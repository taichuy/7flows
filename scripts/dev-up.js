#!/usr/bin/env node
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const TMP_DIR = path.join(REPO_ROOT, 'tmp', 'dev-up');
const LOG_DIR = path.join(REPO_ROOT, 'tmp', 'logs');
const LOG_ARCHIVE_DIR = path.join(LOG_DIR, 'archive');
const PID_DIR = path.join(TMP_DIR, 'pids');
const MIDDLEWARE_DIR = path.join(REPO_ROOT, 'docker');
const API_DIR = path.join(REPO_ROOT, 'api');
const WEB_DIR = path.join(REPO_ROOT, 'web');
const WEB_PORT = 3100;
const WEB_DIST_DIR = path.join(WEB_DIR, '.next');
const WEB_APP_PATHS_MANIFEST = path.join(WEB_DIST_DIR, 'server', 'app-paths-manifest.json');
const WEB_NEXT_CLI = path.join(WEB_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const WEB_MODES = new Set(['dev', 'build']);
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];
const LOOPBACK_NO_PROXY_ENTRIES = ['localhost', '127.0.0.1', '127.0.0.0/8', '::1'];
const AUTHOR_ROUTE_PROBES = [
  { path: '/login', expectedStatuses: [200] },
  { path: '/workspace', expectedStatuses: [200, 307, 308] },
  { path: '/workflows', expectedStatuses: [200, 307, 308] },
  { path: '/workflows/new', expectedStatuses: [200, 307, 308] },
];
const AUTHOR_MANIFEST_ROUTES = ['/login/page'];

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(PID_DIR, { recursive: true });

let action = 'start';
let startWorker = true;
let startBeat = true;
let skipInstall = false;
let manageDockerMiddleware = true;
let composeCommand = null;
let webMode = 'dev';

function usage() {
  process.stdout.write(`用法：node scripts/dev-up.js [选项] [start|ensure|stop|pause|status]

默认动作：start

选项：
  --skip-install  跳过 \`uv sync\` 与 \`pnpm install\`
  --no-worker     不启动 Celery worker
  --no-beat       不启动 Celery beat
  --web-mode      Web 启动模式：\`dev\`（默认）或 \`build\`
  --local-only    仅管理本地 API / Worker / Scheduler / Web，不启动或关闭 Docker；要求当前配置的 Postgres / Redis 已可用
  -h, --help      查看帮助

示例：
  node scripts/dev-up.js
  node scripts/dev-up.js --skip-install
  node scripts/dev-up.js --web-mode build
  node scripts/dev-up.js --local-only
  node scripts/dev-up.js start --skip-install
  node scripts/dev-up.js start --web-mode=build --skip-install
  node scripts/dev-up.js start --local-only --skip-install
  node scripts/dev-up.js ensure --local-only --skip-install
  node scripts/dev-up.js status --local-only
  node scripts/dev-up.js status
  node scripts/dev-up.js pause
  node scripts/dev-up.js stop
  node scripts/dev-pause.js
`);
}

function log(message) {
  process.stdout.write(`[7flows-dev-up] ${message}\n`);
}

function commandExists(commandName) {
  const pathValue = process.env.PATH || '';
  const directories = pathValue.split(path.delimiter).filter(Boolean);
  const extensions =
    process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.ps1'] : [''];

  for (const directory of directories) {
    for (const extension of extensions) {
      const fullPath = path.join(directory, `${commandName}${extension}`);
      if (fs.existsSync(fullPath)) {
        return true;
      }
    }
  }

  return false;
}

function requireCommand(commandName) {
  if (!commandExists(commandName)) {
    throw new Error(`缺少命令：${commandName}`);
  }
}

function displayPath(targetPath) {
  const relativePath = path.relative(REPO_ROOT, targetPath);
  if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join('/');
  }

  return targetPath;
}

function createTimestampLabel(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function parseNoProxyEntries(envValue) {
  return String(envValue || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildLocalLoopbackEnv(sourceEnv) {
  const noProxyEntries = new Set([
    ...parseNoProxyEntries(sourceEnv.NO_PROXY),
    ...parseNoProxyEntries(sourceEnv.no_proxy),
    ...LOOPBACK_NO_PROXY_ENTRIES,
  ]);
  const noProxyValue = [...noProxyEntries].join(',');

  return {
    ...sourceEnv,
    NO_PROXY: noProxyValue,
    no_proxy: noProxyValue,
  };
}

function shellProxyMayInterceptLoopback() {
  const hasProxy = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy'].some(
    (key) => Boolean(process.env[key])
  );

  if (!hasProxy) {
    return false;
  }

  const noProxyEntries = new Set([
    ...parseNoProxyEntries(process.env.NO_PROXY),
    ...parseNoProxyEntries(process.env.no_proxy),
  ]);

  return !noProxyEntries.has('127.0.0.1');
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || REPO_ROOT,
    env: { ...buildLocalLoopbackEnv(process.env), ...(options.env || {}) },
    encoding: 'utf8',
    stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  return result;
}

function ensureCommandSuccess(description, result) {
  if (!result.error && result.status === 0) {
    return;
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  throw new Error(`${description} 失败，退出码 ${result.status}`);
}

function resolveComposeCommand() {
  const dockerComposeResult = runCommand('docker', ['compose', 'version'], { captureOutput: true });
  if (!dockerComposeResult.error && dockerComposeResult.status === 0) {
    composeCommand = { command: 'docker', baseArgs: ['compose'] };
    return;
  }

  const legacyComposeResult = runCommand('docker-compose', ['version'], { captureOutput: true });
  if (!legacyComposeResult.error && legacyComposeResult.status === 0) {
    composeCommand = { command: 'docker-compose', baseArgs: [] };
    return;
  }

  throw new Error('缺少 `docker compose` 或 `docker-compose` 命令');
}

function runMiddlewareCompose(args, options = {}) {
  const result = runCommand(composeCommand.command, [
    ...composeCommand.baseArgs,
    '-f',
    'docker-compose.middleware.yaml',
    ...args,
  ], {
    cwd: MIDDLEWARE_DIR,
    captureOutput: options.captureOutput === true,
  });

  if (options.allowFailure === true) {
    return result;
  }

  ensureCommandSuccess(`docker 中间件命令 ${args.join(' ')}`, result);
  return result;
}

function copyIfMissing(examplePath, targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(examplePath, targetPath);
    log(`已创建 ${displayPath(targetPath)}`);
  }
}

function parseEnvKeys(filePath) {
  if (!fs.existsSync(filePath)) {
    return new Set();
  }

  const keys = new Set();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
  for (const line of lines) {
    const normalizedLine = line.trim();
    if (!normalizedLine || normalizedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = normalizedLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

function stripOptionalQuotes(rawValue) {
  const value = String(rawValue || '').trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const parsed = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u);
  for (const line of lines) {
    const normalizedLine = line.trim();
    if (!normalizedLine || normalizedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = normalizedLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    const value = normalizedLine.slice(separatorIndex + 1);
    if (!key) {
      continue;
    }

    parsed[key] = stripOptionalQuotes(value);
  }

  return parsed;
}

function warnIfEnvExampleKeysAreMissing(examplePath, targetPath) {
  if (!fs.existsSync(examplePath) || !fs.existsSync(targetPath)) {
    return;
  }

  const exampleKeys = parseEnvKeys(examplePath);
  const targetKeys = parseEnvKeys(targetPath);
  const missingKeys = [...exampleKeys].filter((key) => !targetKeys.has(key));
  if (missingKeys.length === 0) {
    return;
  }

  log(
    `${displayPath(targetPath)} 缺少 ${missingKeys.length} 个配置项：${missingKeys.join(', ')}。请从 ${displayPath(examplePath)} 补齐或重建该文件。`
  );
}

function getApiRuntimeEnv() {
  return {
    ...parseEnvFile(path.join(API_DIR, '.env.example')),
    ...parseEnvFile(path.join(API_DIR, '.env')),
    ...process.env,
  };
}

function inferDefaultPort(protocol) {
  if (protocol.startsWith('postgres')) {
    return 5432;
  }
  if (protocol.startsWith('redis')) {
    return 6379;
  }
  if (protocol === 'http') {
    return 80;
  }
  if (protocol === 'https') {
    return 443;
  }

  return null;
}

function resolveNetworkTarget(name, envKey, rawUrl) {
  if (!rawUrl) {
    return {
      name,
      envKey,
      rawUrl: '',
      error: `${envKey} 未配置`,
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (error) {
    return {
      name,
      envKey,
      rawUrl,
      error: `${envKey} 不是合法 URL`,
    };
  }

  const protocol = parsedUrl.protocol.replace(/:$/u, '');
  if (protocol.startsWith('sqlite')) {
    return null;
  }

  const host = parsedUrl.hostname;
  const port = Number.parseInt(parsedUrl.port || '', 10) || inferDefaultPort(protocol);
  if (!host || !port) {
    return {
      name,
      envKey,
      rawUrl,
      error: `${envKey} 缺少可探测的 host/port`,
    };
  }

  return {
    name,
    envKey,
    rawUrl,
    host,
    port,
  };
}

function probeTcpTarget(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = net.createConnection({ host, port });

    const finish = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish({ ok: true }));
    socket.on('timeout', () => finish({ ok: false, reason: 'timeout' }));
    socket.on('error', (error) => finish({ ok: false, reason: error && error.code ? error.code : String(error) }));
  });
}

function formatNetworkTarget(target) {
  if (target.error) {
    return `${target.name}: ${target.error}`;
  }

  return `${target.name}: ${target.host}:${target.port}`;
}

async function collectCoreDependencyFailures() {
  const apiEnv = getApiRuntimeEnv();
  const targets = [
    resolveNetworkTarget('postgres', 'SEVENFLOWS_DATABASE_URL', apiEnv.SEVENFLOWS_DATABASE_URL),
    resolveNetworkTarget('redis', 'SEVENFLOWS_REDIS_URL', apiEnv.SEVENFLOWS_REDIS_URL),
  ].filter(Boolean);

  const failures = [];
  for (const target of targets) {
    if (target.error) {
      failures.push({
        ...target,
        reason: target.error,
      });
      continue;
    }

    const result = await probeTcpTarget(target.host, target.port);
    if (!result.ok) {
      failures.push({
        ...target,
        reason: result.reason,
      });
    }
  }

  return failures;
}

function buildCoreDependencyFailureMessage(failures) {
  const failureDetails = failures
    .map((failure) => {
      const location = failure.error ? failure.envKey : `${failure.host}:${failure.port}`;
      const source = failure.rawUrl ? ` <- ${failure.envKey}=${failure.rawUrl}` : ` <- ${failure.envKey}`;
      return `- ${failure.name}: ${location} (${failure.reason})${source}`;
    })
    .join('\n');

  const suggestion = manageDockerMiddleware
    ? '- 已请求启动 Docker 中间件，但 Postgres / Redis 仍未就绪。请先检查 `docker compose -f docker/docker-compose.middleware.yaml ps` 与对应容器日志。'
    : '- `--local-only` 不会启动 Docker；请先让当前配置里的 Postgres / Redis 可达，或直接改用 `node scripts/dev-up.js`。';

  return `核心依赖未就绪\n${failureDetails}\n${suggestion}`;
}

async function ensureCoreDependenciesReachable() {
  const attempts = manageDockerMiddleware ? 15 : 2;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const failures = await collectCoreDependencyFailures();
    if (failures.length === 0) {
      if (attempt > 1) {
        log(
          `核心依赖已就绪：${[
            resolveNetworkTarget('postgres', 'SEVENFLOWS_DATABASE_URL', getApiRuntimeEnv().SEVENFLOWS_DATABASE_URL),
            resolveNetworkTarget('redis', 'SEVENFLOWS_REDIS_URL', getApiRuntimeEnv().SEVENFLOWS_REDIS_URL),
          ]
            .filter(Boolean)
            .map(formatNetworkTarget)
            .join(', ')}`
        );
      }
      return;
    }

    if (attempt === attempts) {
      throw new Error(buildCoreDependencyFailureMessage(failures));
    }

    if (manageDockerMiddleware) {
      log(`等待核心依赖就绪（第 ${attempt}/${attempts} 次检查）`);
      await sleep(1000);
      continue;
    }

    await sleep(250);
  }
}

function pidFileFor(serviceName) {
  return path.join(PID_DIR, `${serviceName}.pid`);
}

function logFileFor(serviceName) {
  return path.join(LOG_DIR, `${serviceName}.log`);
}

function readPid(pidFile) {
  if (!fs.existsSync(pidFile)) {
    return null;
  }

  const rawValue = fs.readFileSync(pidFile, 'utf8').trim();
  if (!rawValue) {
    return null;
  }

  const pid = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  return pid;
}

function isPidRunning(pidFile) {
  const pid = readPid(pidFile);
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

function cleanupStalePid(pidFile) {
  if (fs.existsSync(pidFile) && !isPidRunning(pidFile)) {
    fs.rmSync(pidFile, { force: true });
  }
}

function isServiceRunning(serviceName) {
  const pidFile = pidFileFor(serviceName);
  cleanupStalePid(pidFile);
  return isPidRunning(pidFile);
}

function collectMissingManagedServices() {
  const missingServices = [];

  if (!isServiceRunning('api')) {
    missingServices.push('api');
  }

  if (startWorker && !isServiceRunning('worker')) {
    missingServices.push('worker');
  }

  if (startBeat && !isServiceRunning('beat')) {
    missingServices.push('beat');
  }

  if (!isServiceRunning('web')) {
    missingServices.push('web');
  }

  return missingServices;
}

function sleepSync(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function readTail(filePath, maxLines = 40) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line, index, allLines) => !(index === allLines.length - 1 && line === ''));

  return lines.slice(-maxLines).join('\n');
}

function setWebMode(nextWebMode) {
  if (!WEB_MODES.has(nextWebMode)) {
    throw new Error(`不支持的 Web 启动模式：${nextWebMode}`);
  }

  webMode = nextWebMode;
}

function getWebCommand() {
  if (!fs.existsSync(WEB_NEXT_CLI)) {
    throw new Error(`缺少 ${displayPath(WEB_NEXT_CLI)}，请先同步 Web 依赖`);
  }

  if (webMode === 'build') {
    return {
      command: process.execPath,
      args: [WEB_NEXT_CLI, 'start', '-p', String(WEB_PORT)],
      env: {},
    };
  }

  return {
    command: process.execPath,
    args: [WEB_NEXT_CLI, 'dev', '-p', String(WEB_PORT)],
    env: {
      WATCHPACK_POLLING: 'true',
    },
  };
}

function cleanupWebBuildArtifacts() {
  if (!fs.existsSync(WEB_DIST_DIR)) {
    return;
  }

  fs.rmSync(WEB_DIST_DIR, { recursive: true, force: true });
  log(`已清理 ${displayPath(WEB_DIST_DIR)}，避免旧 route manifest 残留`);
}

function findListeningPidsByPort(port) {
  const processIds = new Set();

  if (process.platform !== 'win32' && commandExists('ss')) {
    const ssResult = runCommand('ss', ['-ltnp', `sport = :${port}`], { captureOutput: true });
    if (!ssResult.error && ssResult.status === 0 && ssResult.stdout) {
      for (const match of ssResult.stdout.matchAll(/pid=(\d+)/g)) {
        processIds.add(Number.parseInt(match[1], 10));
      }
    }
  }

  if (processIds.size === 0 && commandExists('lsof')) {
    const lsofResult = runCommand('lsof', ['-iTCP:' + String(port), '-sTCP:LISTEN', '-n', '-P'], {
      captureOutput: true,
    });
    if (!lsofResult.error && lsofResult.status === 0 && lsofResult.stdout) {
      for (const line of lsofResult.stdout.split(/\r?\n/).slice(1)) {
        const columns = line.trim().split(/\s+/);
        const pid = Number.parseInt(columns[1] || '', 10);
        if (Number.isInteger(pid) && pid > 0) {
          processIds.add(pid);
        }
      }
    }
  }

  return [...processIds];
}

function cleanupOrphanedWebListeners() {
  const trackedPid = readPid(pidFileFor('web'));
  const occupiedPids = findListeningPidsByPort(WEB_PORT).filter((pid) => pid !== trackedPid);

  if (occupiedPids.length === 0) {
    return;
  }

  log(`发现占用 ${WEB_PORT} 端口的孤儿 Web 进程：${occupiedPids.join(', ')}`);
  for (const pid of occupiedPids) {
    killProcessGroup(pid, 'SIGTERM');
  }

  sleepSync(1000);

  for (const pid of occupiedPids) {
    try {
      process.kill(pid, 0);
      killProcessGroup(pid, 'SIGKILL');
    } catch (error) {
      if (!error || error.code !== 'ESRCH') {
        throw error;
      }
    }
  }
}

function readWebAppPathsManifest() {
  if (!fs.existsSync(WEB_APP_PATHS_MANIFEST)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(WEB_APP_PATHS_MANIFEST, 'utf8'));
  } catch (error) {
    return null;
  }
}

function getMissingAuthorManifestRoutes(manifest) {
  const manifestRoutes = new Set(Object.keys(manifest || {}));
  return AUTHOR_MANIFEST_ROUTES.filter((route) => !manifestRoutes.has(route));
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function probeAuthorRouteStatus(routePath, host = 'localhost') {
  try {
    const response = await fetch(`http://${host}:${WEB_PORT}${routePath}`, {
      redirect: 'manual',
      headers: {
        accept: 'text/html',
      },
    });

    return response.status;
  } catch (error) {
    return null;
  }
}

function formatAuthorRouteStatuses(routeStatuses) {
  return routeStatuses
    .map(({ path: routePath, status, expectedStatuses }) => {
      const actualStatus = status === null ? 'unreachable' : String(status);
      return `${routePath}=${actualStatus} (expect ${expectedStatuses.join('/')})`;
    })
    .join(', ');
}

async function collectWebAuthorRouteHealth() {
  const routeStatuses = [];

  for (const probe of AUTHOR_ROUTE_PROBES) {
    const status = await probeAuthorRouteStatus(probe.path);
    routeStatuses.push({
      ...probe,
      status,
      ok: typeof status === 'number' && probe.expectedStatuses.includes(status),
    });
  }

  const manifest = readWebAppPathsManifest();
  const missingManifestRoutes = getMissingAuthorManifestRoutes(manifest);

  return {
    manifest,
    missingManifestRoutes,
    routeStatuses,
    ok: routeStatuses.every((probe) => probe.ok) && missingManifestRoutes.length === 0,
  };
}

async function collectLoopbackHostParity() {
  const loopbackPaths = ['/login', '/workflows/new'];
  const results = [];

  for (const host of LOOPBACK_HOSTS) {
    for (const routePath of loopbackPaths) {
      results.push({
        host,
        path: routePath,
        status: await probeAuthorRouteStatus(routePath, host),
      });
    }
  }

  return results;
}

function formatLoopbackHostParity(results) {
  return results
    .map(({ host, path: routePath, status }) => `${host}${routePath}=${status === null ? 'unreachable' : status}`)
    .join(', ');
}

function printLoopbackProxyNotice() {
  if (!shellProxyMayInterceptLoopback()) {
    return;
  }

  process.stdout.write(
    'web proxy note: 检测到 shell 代理且 NO_PROXY 未显式包含 127.0.0.1；CLI 直连 127.0.0.1 可能被代理劫持。可临时执行 `export NO_PROXY=localhost,127.0.0.1,127.0.0.0/8,::1` 后再用 curl 复验。\n'
  );
}

async function ensureWebAuthorRoutesHealthy() {
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const health = await collectWebAuthorRouteHealth();
    if (health.ok) {
      log(`Web 作者路由已恢复：${formatAuthorRouteStatuses(health.routeStatuses)}`);
      return health;
    }

    await sleep(1000);
  }

  const health = await collectWebAuthorRouteHealth();
  const tailOutput = readTail(logFileFor('web'), 80);
  const manifestSummary = health.manifest
    ? Object.keys(health.manifest).join(', ')
    : 'manifest missing';

  throw new Error(
    `Web 作者路由未恢复\n` +
      `- route status: ${formatAuthorRouteStatuses(health.routeStatuses)}\n` +
      `- missing manifest routes: ${health.missingManifestRoutes.join(', ') || 'none'}\n` +
      `- manifest keys: ${manifestSummary}\n` +
      (tailOutput ? `- web log tail:\n${tailOutput}` : '')
  );
}

function startBackgroundProcess(serviceName, workdir, command, args, extraEnv = {}) {
  const pidFile = pidFileFor(serviceName);
  const logFile = logFileFor(serviceName);

  cleanupStalePid(pidFile);

  if (isPidRunning(pidFile)) {
    log(`${serviceName} 已在运行，PID=${readPid(pidFile)}`);
    return;
  }

  log(`启动 ${serviceName}，日志：${displayPath(logFile)}`);
  const outputHandle = fs.openSync(logFile, 'a');
  const child = spawn(command, args, {
    cwd: workdir,
    detached: true,
    env: { ...buildLocalLoopbackEnv(process.env), ...extraEnv },
    stdio: ['ignore', outputHandle, outputHandle],
  });

  child.unref();
  fs.closeSync(outputHandle);

  if (!child.pid) {
    throw new Error(`${serviceName} 启动失败，请查看 ${displayPath(logFile)}`);
  }

  fs.writeFileSync(pidFile, String(child.pid));

  sleepSync(1000);
  if (isPidRunning(pidFile)) {
    log(`${serviceName} 已启动，PID=${readPid(pidFile)}`);
    return;
  }

  const tailOutput = readTail(logFile);
  const error = new Error(`${serviceName} 启动失败，请查看 ${displayPath(logFile)}`);
  if (tailOutput) {
    process.stderr.write(`${tailOutput}\n`);
  }
  throw error;
}

function killProcessGroup(pid, signal) {
  const targets = process.platform === 'win32' ? [pid] : [-pid, pid];

  for (const target of targets) {
    try {
      process.kill(target, signal);
      return;
    } catch (error) {
      if (error && error.code === 'ESRCH') {
        continue;
      }
    }
  }
}

function stopBackgroundProcess(serviceName) {
  const pidFile = pidFileFor(serviceName);
  cleanupStalePid(pidFile);

  if (!fs.existsSync(pidFile)) {
    log(`${serviceName} 未运行`);
    return;
  }

  const pid = readPid(pidFile);
  if (pid && isPidRunning(pidFile)) {
    killProcessGroup(pid, 'SIGTERM');
    sleepSync(1000);
    if (isPidRunning(pidFile)) {
      killProcessGroup(pid, 'SIGKILL');
    }
  }

  fs.rmSync(pidFile, { force: true });
  log(`${serviceName} 已停止`);
}

function stopWebProcess() {
  stopBackgroundProcess('web');
  cleanupOrphanedWebListeners();
}

function printProcessStatus(serviceName) {
  const pidFile = pidFileFor(serviceName);
  cleanupStalePid(pidFile);

  if (isPidRunning(pidFile)) {
    process.stdout.write(`${serviceName.padEnd(12)} running (PID=${readPid(pidFile)})\n`);
    return;
  }

  process.stdout.write(`${serviceName.padEnd(12)} stopped\n`);
}

function runWithRetries(description, attempts, runner) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      runner();
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(`${description} 失败，已尝试 ${attempts} 次\n${error.message}`);
      }

      log(`${description} 第 ${attempt} 次失败，3 秒后重试`);
      sleepSync(3000);
    }
  }
}

function prepareEnvFiles() {
  copyIfMissing(path.join(MIDDLEWARE_DIR, 'middleware.env.example'), path.join(MIDDLEWARE_DIR, 'middleware.env'));
  copyIfMissing(path.join(API_DIR, '.env.example'), path.join(API_DIR, '.env'));
  copyIfMissing(path.join(WEB_DIR, '.env.example'), path.join(WEB_DIR, '.env.local'));
  warnIfEnvExampleKeysAreMissing(path.join(API_DIR, '.env.example'), path.join(API_DIR, '.env'));
  warnIfEnvExampleKeysAreMissing(path.join(WEB_DIR, '.env.example'), path.join(WEB_DIR, '.env.local'));
}

function buildWebArtifacts() {
  if (webMode !== 'build') {
    return;
  }

  log('构建 Web 产物');
  ensureCommandSuccess('构建 Web 产物', runCommand('corepack', ['pnpm', 'build'], { cwd: WEB_DIR }));
}

async function startWebProcess() {
  cleanupOrphanedWebListeners();
  cleanupWebBuildArtifacts();

  buildWebArtifacts();

  const webCommand = getWebCommand();
  startBackgroundProcess('web', WEB_DIR, webCommand.command, webCommand.args, webCommand.env);
  await ensureWebAuthorRoutesHealthy();
}

function ensureDependencies() {
  if (skipInstall) {
    log('按参数跳过依赖同步');
    return;
  }

  log('同步 API 依赖');
  ensureCommandSuccess('同步 API 依赖', runCommand('uv', ['sync', '--extra', 'dev'], { cwd: API_DIR }));

  log('同步 Web 依赖');
  ensureCommandSuccess(
    '同步 Web 依赖',
    runCommand('corepack', ['pnpm', 'install'], { cwd: WEB_DIR }),
  );
}

function startMiddleware() {
  log('启动 docker 中间件');
  runMiddlewareCompose(['up', '-d']);
}

function runMigrations() {
  log('执行 API migration');
  runWithRetries('API migration', 10, () => {
    ensureCommandSuccess(
      '执行 API migration',
      runCommand('uv', ['run', 'alembic', 'upgrade', 'head'], { cwd: API_DIR }),
    );
  });
}

function archiveLogs() {
  if (!fs.existsSync(LOG_DIR)) {
    return;
  }

  const files = fs.readdirSync(LOG_DIR);
  const logFiles = files.filter((file) => file.endsWith('.log'));
  if (logFiles.length === 0) {
    return;
  }

  const archiveDir = path.join(LOG_ARCHIVE_DIR, createTimestampLabel());
  fs.mkdirSync(archiveDir, { recursive: true });

  let archivedCount = 0;
  for (const file of files) {
    if (file.endsWith('.log')) {
      fs.renameSync(path.join(LOG_DIR, file), path.join(archiveDir, file));
      archivedCount += 1;
    }
  }

  if (archivedCount > 0) {
    log(`已归档 ${archivedCount} 个旧日志文件到 ${displayPath(archiveDir)}`);
  }
}

async function prepareStartEnvironment() {
  requireCommand('uv');
  requireCommand('corepack');
  if (manageDockerMiddleware) {
    requireCommand('docker');
    resolveComposeCommand();
  }

  prepareEnvFiles();
  ensureDependencies();
  getWebCommand();
  if (manageDockerMiddleware) {
    startMiddleware();
  } else {
    log('按本地模式跳过 Docker 中间件启动');
  }
  await ensureCoreDependenciesReachable();
}

async function startAll() {
  log('正在准备启动环境...');
  await prepareStartEnvironment();

  stopWebProcess();
  stopBackgroundProcess('beat');
  stopBackgroundProcess('worker');
  stopBackgroundProcess('api');

  archiveLogs();

  runMigrations();

  startBackgroundProcess('api', API_DIR, 'uv', [
    'run',
    'uvicorn',
    'app.main:app',
    '--reload',
    '--host',
    '0.0.0.0',
    '--port',
    '8000',
  ]);
  if (startWorker) {
    startBackgroundProcess('worker', API_DIR, 'uv', [
      'run',
      'celery',
      '-A',
      'app.core.celery_app.celery_app',
      'worker',
      '--loglevel',
      'INFO',
      '--pool',
      'solo',
    ]);
  }
  if (startBeat) {
    startBackgroundProcess('beat', API_DIR, 'uv', [
      'run',
      'celery',
      '-A',
      'app.core.celery_app.celery_app',
      'beat',
      '--loglevel',
      'INFO',
    ]);
  }
  await startWebProcess();

  const sharedArgs = [manageDockerMiddleware ? null : '--local-only', webMode === 'build' ? '--web-mode=build' : null]
    .filter(Boolean)
    .join(' ');
  const ensureCommand = `node scripts/dev-up.js ensure${sharedArgs ? ` ${sharedArgs}` : ''}`;
  const statusCommand = `node scripts/dev-up.js status${sharedArgs ? ` ${sharedArgs}` : ''}`;
  const pauseCommand = `node scripts/dev-pause.js${sharedArgs ? ` ${sharedArgs}` : ''}`;
  const stopCommand = `node scripts/dev-up.js stop${sharedArgs ? ` ${sharedArgs}` : ''}`;

  process.stdout.write(`
启动完成：
- API:  http://localhost:8000
- Web:  http://localhost:3100 (${webMode})
- 日志: tmp/logs/

常用命令：
- 修复缺失：${ensureCommand}
- 查看状态：${statusCommand}
- 暂停全部：${pauseCommand}
- 停止全部：${stopCommand}
`);
}

async function ensureAll() {
  const missingServices = collectMissingManagedServices();
  if (missingServices.length === 0) {
    log('全部受管服务均在运行，无需补启动');
    return;
  }

  log(`发现缺失服务：${missingServices.join(', ')}`);
  await prepareStartEnvironment();
  runMigrations();

  if (missingServices.includes('api')) {
    startBackgroundProcess('api', API_DIR, 'uv', [
      'run',
      'uvicorn',
      'app.main:app',
      '--reload',
      '--host',
      '0.0.0.0',
      '--port',
      '8000',
    ]);
  }
  if (startWorker && missingServices.includes('worker')) {
    startBackgroundProcess('worker', API_DIR, 'uv', [
      'run',
      'celery',
      '-A',
      'app.core.celery_app.celery_app',
      'worker',
      '--loglevel',
      'INFO',
      '--pool',
      'solo',
    ]);
  }
  if (startBeat && missingServices.includes('beat')) {
    startBackgroundProcess('beat', API_DIR, 'uv', [
      'run',
      'celery',
      '-A',
      'app.core.celery_app.celery_app',
      'beat',
      '--loglevel',
      'INFO',
    ]);
  }
  if (missingServices.includes('web')) {
    await startWebProcess();
  }

  log(`已补启动服务：${missingServices.join(', ')}`);
}

function stopAll() {
  if (manageDockerMiddleware) {
    requireCommand('docker');
    resolveComposeCommand();
  }

  stopWebProcess();
  stopBackgroundProcess('beat');
  stopBackgroundProcess('worker');
  stopBackgroundProcess('api');

  if (manageDockerMiddleware) {
    log('停止 docker 中间件');
    runMiddlewareCompose(['down']);
  } else {
    log('按本地模式保留 Docker 中间件状态不变');
  }
}

async function statusAll() {
  if (manageDockerMiddleware) {
    requireCommand('docker');
    resolveComposeCommand();
  }
  const trackedWebPidFile = pidFileFor('web');
  const trackedWebPid = readPid(trackedWebPidFile);
  const orphanedWebPids = findListeningPidsByPort(WEB_PORT).filter((pid) => pid !== trackedWebPid);

  printProcessStatus('api');
  printProcessStatus('worker');
  printProcessStatus('beat');
  printProcessStatus('web');
  if (isPidRunning(trackedWebPidFile)) {
    const health = await collectWebAuthorRouteHealth();
    process.stdout.write(
      `web routes   ${health.ok ? 'healthy' : 'degraded'} (${formatAuthorRouteStatuses(health.routeStatuses)})\n`
    );
    const loopbackParity = await collectLoopbackHostParity();
    process.stdout.write(`web hosts    ${formatLoopbackHostParity(loopbackParity)}\n`);
    printLoopbackProxyNotice();
    if (health.missingManifestRoutes.length > 0) {
      process.stdout.write(
        `web manifest missing: ${health.missingManifestRoutes.join(', ')}\n`
      );
    }
  } else if (orphanedWebPids.length > 0) {
    process.stdout.write(`web orphan   port ${WEB_PORT} occupied by PID=${orphanedWebPids.join(',')}\n`);
  }
  process.stdout.write('\nDocker middleware:\n');

  if (!manageDockerMiddleware) {
    process.stdout.write('skipped (--local-only)\n');
    return;
  }

  const result = runMiddlewareCompose(['ps'], { allowFailure: true });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function parseArgs(args) {
  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];

    switch (currentArg) {
      case 'start':
      case 'ensure':
      case 'stop':
      case 'pause':
      case 'status':
        if (action !== 'start') {
          throw new Error(`动作只能指定一次：已收到 ${action}，又收到 ${currentArg}`);
        }
        action = currentArg;
        break;
      case '--skip-install':
        skipInstall = true;
        break;
      case '--no-worker':
        startWorker = false;
        break;
      case '--no-beat':
        startBeat = false;
        break;
      case '--local-only':
        manageDockerMiddleware = false;
        break;
      case '--web-mode': {
        const nextWebMode = args[index + 1];
        if (!nextWebMode) {
          throw new Error('`--web-mode` 需要一个参数：dev 或 build');
        }

        setWebMode(nextWebMode);
        index += 1;
        break;
      }
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      default:
        if (currentArg.startsWith('--web-mode=')) {
          setWebMode(currentArg.slice('--web-mode='.length));
          break;
        }

        throw new Error(`未知参数：${currentArg}`);
    }
  }
}

async function main() {
  try {
    parseArgs(process.argv.slice(2));

    switch (action) {
      case 'start':
        await startAll();
        break;
      case 'ensure':
        await ensureAll();
        break;
      case 'stop':
      case 'pause':
        stopAll();
        break;
      case 'status':
        await statusAll();
        break;
      default:
        usage();
        process.exit(1);
    }
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (action !== 'start' || !/^未知参数：/.test(message)) {
      process.stderr.write('\n');
    }
    usage();
    process.exit(1);
  }
}

main();
