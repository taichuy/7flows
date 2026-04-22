const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ACTIONS = new Set(['start', 'ensure', 'stop', 'status', 'restart']);
const SCOPES = new Set(['all', 'frontend', 'backend']);
const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const CARGO_COLD_STARTUP_TIMEOUT_MS = 60_000;
const LOOPBACK_NO_PROXY_ENTRIES = ['localhost', '127.0.0.1', '127.0.0.0/8', '::1'];
const LOCAL_POSTGRES_HOSTS = new Set(['127.0.0.1', 'localhost']);

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function getRuntimePaths(repoRoot) {
  const tmpDir = path.join(repoRoot, 'tmp', 'dev-up');
  const pidDir = path.join(tmpDir, 'pids');
  const logDir = path.join(repoRoot, 'tmp', 'logs');

  return {
    tmpDir,
    pidDir,
    logDir,
  };
}

function ensureRuntimeDirs(paths) {
  fs.mkdirSync(paths.tmpDir, { recursive: true });
  fs.mkdirSync(paths.pidDir, { recursive: true });
  fs.mkdirSync(paths.logDir, { recursive: true });
}

function usage() {
  process.stdout.write(`用法：node scripts/node/dev-up.js [选项] [start|ensure|stop|status|restart]

默认动作：start

选项：
  --frontend-only  仅管理前端进程
  --backend-only   仅管理后端进程（api-server + plugin-runner）
  --skip-docker    跳过 Docker 中间件管理
  -h, --help       查看帮助

示例：
  node scripts/node/dev-up.js
  node scripts/node/dev-up.js --skip-docker
  node scripts/node/dev-up.js restart --frontend-only
  node scripts/node/dev-up.js restart --backend-only
  node scripts/node/dev-up.js status
`);
}

function log(message) {
  process.stdout.write(`[1flowbase-dev-up] ${message}\n`);
}

function parseCliArgs(argv) {
  let action = 'start';
  let actionSpecified = false;
  let scope = 'all';
  let skipDocker = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    if (arg === '--frontend-only') {
      if (scope !== 'all') {
        throw new Error('不能同时指定 --frontend-only 和 --backend-only');
      }
      scope = 'frontend';
      continue;
    }

    if (arg === '--backend-only') {
      if (scope !== 'all') {
        throw new Error('不能同时指定 --frontend-only 和 --backend-only');
      }
      scope = 'backend';
      continue;
    }

    if (arg === '--skip-docker') {
      skipDocker = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`未知选项：${arg}`);
    }

    if (actionSpecified) {
      throw new Error(`只能指定一个动作，收到多余参数：${arg}`);
    }

    if (!ACTIONS.has(arg)) {
      throw new Error(`未知动作：${arg}`);
    }

    action = arg;
    actionSpecified = true;
  }

  if (!SCOPES.has(scope)) {
    throw new Error(`未知范围：${scope}`);
  }

  return {
    action,
    scope,
    skipDocker,
    help,
  };
}

function shouldManageDocker(options) {
  return !options.skipDocker && options.scope === 'all';
}

function selectServiceKeys(scope) {
  switch (scope) {
    case 'frontend':
      return ['web'];
    case 'backend':
      return ['api-server', 'plugin-runner'];
    default:
      return ['web', 'api-server', 'plugin-runner'];
  }
}

function getServiceDefinitions(repoRoot) {
  const paths = getRuntimePaths(repoRoot);
  const apiServerEnvDir = path.join(repoRoot, 'api', 'apps', 'api-server');

  return {
    web: {
      key: 'web',
      label: 'frontend',
      repoRoot,
      cwd: path.join(repoRoot, 'web'),
      command: 'pnpm',
      args: ['--filter', '@1flowbase/web', 'dev'],
      bindHost: '0.0.0.0',
      probeHost: '127.0.0.1',
      port: 3100,
      startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
      logFile: path.join(paths.logDir, 'web.log'),
      pidFile: path.join(paths.pidDir, 'web.json'),
    },
    'api-server': {
      key: 'api-server',
      label: 'api-server',
      repoRoot,
      cwd: path.join(repoRoot, 'api'),
      command: 'cargo',
      args: ['run', '-p', 'api-server', '--bin', 'api-server'],
      bindHost: '0.0.0.0',
      probeHost: '127.0.0.1',
      port: 7800,
      startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
      envFile: path.join(apiServerEnvDir, '.env'),
      envExampleFile: path.join(apiServerEnvDir, '.env.example'),
      logFile: path.join(paths.logDir, 'api-server.log'),
      pidFile: path.join(paths.pidDir, 'api-server.json'),
    },
    'plugin-runner': {
      key: 'plugin-runner',
      label: 'plugin-runner',
      repoRoot,
      cwd: path.join(repoRoot, 'api'),
      command: 'cargo',
      args: ['run', '-p', 'plugin-runner', '--bin', 'plugin-runner'],
      bindHost: '0.0.0.0',
      probeHost: '127.0.0.1',
      port: 7801,
      startupTimeoutMs: CARGO_COLD_STARTUP_TIMEOUT_MS,
      logFile: path.join(paths.logDir, 'plugin-runner.log'),
      pidFile: path.join(paths.pidDir, 'plugin-runner.json'),
    },
  };
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

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function ensureServiceEnvFile(service) {
  if (!service.envFile || !service.envExampleFile) {
    return false;
  }

  if (fs.existsSync(service.envFile) || !fs.existsSync(service.envExampleFile)) {
    return false;
  }

  fs.mkdirSync(path.dirname(service.envFile), { recursive: true });
  fs.copyFileSync(service.envExampleFile, service.envFile);
  log(`已创建 ${path.relative(service.repoRoot || getRepoRoot(), service.envFile)}`);
  return true;
}

function buildServiceEnv(service, sourceEnv = process.env) {
  const fileEnv = parseEnvFile(service.envFile);
  return buildLocalLoopbackEnv({
    ...fileEnv,
    ...sourceEnv,
  });
}

function getCommandOutput(result) {
  return [result?.stdout, result?.stderr, result?.error?.message].filter(Boolean).join('\n');
}

function writeCommandOutput(result) {
  if (result?.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result?.stderr) {
    process.stderr.write(result.stderr);
  }
}

function isMigrationChecksumMismatch(result) {
  return getCommandOutput(result).includes('was previously applied but has been modified');
}

function quotePostgresIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function parsePostgresDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    return null;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (_error) {
    return null;
  }

  if (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') {
    return null;
  }

  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  if (!databaseName) {
    return null;
  }

  return {
    host: parsedUrl.hostname.trim().toLowerCase(),
    port: parsedUrl.port || '5432',
    user: decodeURIComponent(parsedUrl.username || 'postgres'),
    databaseName,
  };
}

function getMiddlewarePostgresPort(repoRoot) {
  const dockerDir = path.join(repoRoot, 'docker');
  for (const fileName of ['middleware.env', 'middleware.env.example']) {
    const fileEnv = parseEnvFile(path.join(dockerDir, fileName));
    if (fileEnv.POSTGRES_PORT) {
      return String(fileEnv.POSTGRES_PORT);
    }
  }

  return '35432';
}

function buildLocalPostgresResetPlan(service, databaseUrl) {
  if (!service?.repoRoot) {
    return null;
  }

  const database = parsePostgresDatabaseUrl(databaseUrl);
  if (!database || !LOCAL_POSTGRES_HOSTS.has(database.host)) {
    return null;
  }

  const expectedPort = getMiddlewarePostgresPort(service.repoRoot);
  if (database.port !== expectedPort) {
    return null;
  }

  const quotedDatabaseName = quotePostgresIdentifier(database.databaseName);
  return {
    databaseName: database.databaseName,
    commands: [
      {
        description: `重建开发数据库 ${database.databaseName}`,
        args: [
          'exec',
          '-T',
          'db',
          'psql',
          '-U',
          database.user,
          '-d',
          'postgres',
          '-c',
          `DROP DATABASE IF EXISTS ${quotedDatabaseName} WITH (FORCE);`,
        ],
      },
      {
        description: `创建开发数据库 ${database.databaseName}`,
        args: [
          'exec',
          '-T',
          'db',
          'psql',
          '-U',
          database.user,
          '-d',
          'postgres',
          '-c',
          `CREATE DATABASE ${quotedDatabaseName};`,
        ],
      },
    ],
  };
}

function parseApiEnvironment(value) {
  const normalized = String(value || 'development')
    .trim()
    .toLowerCase();

  if (normalized === 'development' || normalized === 'dev' || normalized === 'local') {
    return 'development';
  }

  if (normalized === 'production' || normalized === 'prod') {
    return 'production';
  }

  throw new Error(`无效的 API_ENV：${value}`);
}

function getServicePrestartCommands(service, sourceEnv = process.env) {
  if (!service || service.key !== 'api-server') {
    return [];
  }

  const env = buildServiceEnv(service, sourceEnv);
  if (parseApiEnvironment(env.API_ENV) === 'production') {
    return [];
  }

  return [
    {
      description: 'api-server 开发态重置 root 密码',
      command: service.command,
      args: ['run', '-p', 'api-server', '--bin', 'reset_root_password'],
      cwd: service.cwd,
      env,
    },
  ];
}

function tryRecoverApiServerPrestartFailure(
  service,
  prestartCommand,
  result,
  { runMiddlewareComposeImpl = runMiddlewareCompose, logImpl = log } = {}
) {
  if (!service || service.key !== 'api-server' || !prestartCommand?.env) {
    return false;
  }

  if (parseApiEnvironment(prestartCommand.env.API_ENV) === 'production') {
    return false;
  }

  if (!isMigrationChecksumMismatch(result)) {
    return false;
  }

  const resetPlan = buildLocalPostgresResetPlan(service, prestartCommand.env.API_DATABASE_URL);
  if (!resetPlan) {
    return false;
  }

  logImpl(
    `${service.label} 检测到本地开发数据库 migration checksum 失配，准备重建数据库 ${resetPlan.databaseName}`
  );

  for (const command of resetPlan.commands) {
    const resetResult = runMiddlewareComposeImpl(service.repoRoot, command.args, {
      captureOutput: true,
      allowFailure: true,
    });
    ensureCommandSuccess(command.description, resetResult);
  }

  logImpl(`${service.label} 已重建数据库 ${resetPlan.databaseName}，重试预启动步骤`);
  return true;
}

function runServicePrestartCommands(
  service,
  {
    sourceEnv = process.env,
    runCommandImpl = runCommand,
    runMiddlewareComposeImpl = runMiddlewareCompose,
    logImpl = log,
  } = {}
) {
  for (const prestartCommand of getServicePrestartCommands(service, sourceEnv)) {
    logImpl(`${service.label} 执行预启动步骤：${prestartCommand.description}`);
    let recovered = false;

    while (true) {
      const result = runCommandImpl(prestartCommand.command, prestartCommand.args, {
        cwd: prestartCommand.cwd,
        env: prestartCommand.env,
        captureOutput: true,
      });

      if (!result.error && result.status === 0) {
        writeCommandOutput(result);
        break;
      }

      writeCommandOutput(result);

      if (
        !recovered &&
        tryRecoverApiServerPrestartFailure(service, prestartCommand, result, {
          runMiddlewareComposeImpl,
          logImpl,
        })
      ) {
        recovered = true;
        continue;
      }

      ensureCommandSuccess(prestartCommand.description, result);
    }
  }
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || getRepoRoot(),
    env: { ...buildLocalLoopbackEnv(process.env), ...(options.env || {}) },
    encoding: 'utf8',
    stdio: options.captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
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

let cachedComposeCommand = null;

function resolveComposeCommand({ resetCache = false, runCommandImpl = runCommand } = {}) {
  if (resetCache) {
    cachedComposeCommand = null;
  }

  if (cachedComposeCommand) {
    return cachedComposeCommand;
  }

  const dockerComposeResult = runCommandImpl('docker', ['compose', 'version'], {
    captureOutput: true,
  });
  if (!dockerComposeResult.error && dockerComposeResult.status === 0) {
    cachedComposeCommand = { command: 'docker', baseArgs: ['compose'] };
    return cachedComposeCommand;
  }

  throw new Error('缺少 `docker compose` 命令');
}

function ensureMiddlewareEnv(repoRoot) {
  const dockerDir = path.join(repoRoot, 'docker');
  const examplePath = path.join(dockerDir, 'middleware.env.example');
  const targetPath = path.join(dockerDir, 'middleware.env');

  if (!fs.existsSync(targetPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, targetPath);
    log(`已创建 docker/middleware.env`);
  }
}

function ensureRustfsVolumePermissions(repoRoot) {
  const rustfsRootDir = path.join(repoRoot, 'docker', 'volumes', 'rustfs');
  const rustfsDataDir = path.join(rustfsRootDir, 'data');
  const rustfsLogsDir = path.join(rustfsRootDir, 'logs');

  for (const targetDir of [rustfsRootDir, rustfsDataDir, rustfsLogsDir]) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o777 });
    fs.chmodSync(targetDir, 0o777);
  }
}

function runMiddlewareCompose(repoRoot, args, options = {}) {
  const composeCommand = resolveComposeCommand();
  const result = runCommand(
    composeCommand.command,
    [...composeCommand.baseArgs, '-f', 'docker-compose.middleware.yaml', ...args],
    {
      cwd: path.join(repoRoot, 'docker'),
      captureOutput: options.captureOutput === true,
    }
  );

  if (options.allowFailure === true) {
    return result;
  }

  ensureCommandSuccess(`docker 中间件命令 ${args.join(' ')}`, result);
  return result;
}

function readPidRecord(pidFile) {
  if (!fs.existsSync(pidFile)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(pidFile, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function getProbeHost(service) {
  return service.probeHost || service.host;
}

function getBindHost(service) {
  return service.bindHost || service.host;
}

function getStartupTimeoutMs(service) {
  if (!service || !Number.isFinite(service.startupTimeoutMs) || service.startupTimeoutMs <= 0) {
    return DEFAULT_STARTUP_TIMEOUT_MS;
  }

  return service.startupTimeoutMs;
}

function writePidRecord(service, pid) {
  fs.writeFileSync(
    service.pidFile,
    JSON.stringify(
      {
        pid,
        command: service.command,
        args: service.args,
        port: service.port,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function removePidRecord(pidFile) {
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false;
    }

    throw error;
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPortOpen(host, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(value);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));
  });
}

async function waitForPort(host, port, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return true;
    }

    await sleep(250);
  }

  return false;
}

function waitForServicePort(service, waitForPortImpl = waitForPort) {
  return waitForPortImpl(getProbeHost(service), service.port, getStartupTimeoutMs(service));
}

function signalProcess(pid, signal) {
  try {
    if (process.platform !== 'win32') {
      process.kill(-pid, signal);
      return;
    }
  } catch (error) {
    if (error.code !== 'ESRCH') {
      try {
        process.kill(pid, signal);
        return;
      } catch (innerError) {
        if (innerError.code !== 'ESRCH') {
          throw innerError;
        }
      }
    } else {
      return;
    }
  }

  try {
    process.kill(pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      throw error;
    }
  }
}

async function waitForProcessExit(pid, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await sleep(200);
  }

  return !isProcessAlive(pid);
}

async function startService(service) {
  ensureServiceEnvFile(service);
  requireCommand(service.command);
  runServicePrestartCommands(service);

  const pidRecord = readPidRecord(service.pidFile);
  if (pidRecord && isProcessAlive(pidRecord.pid) && (await isPortOpen(getProbeHost(service), service.port))) {
    log(`${service.label} 已在运行，跳过启动`);
    return;
  }

  if (pidRecord && isProcessAlive(pidRecord.pid)) {
    await stopService(service);
  }

  const outputFd = fs.openSync(service.logFile, 'a');
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: buildServiceEnv(service),
    detached: process.platform !== 'win32',
    stdio: ['ignore', outputFd, outputFd],
  });

  fs.closeSync(outputFd);
  child.unref();
  writePidRecord(service, child.pid);

  const ready = await waitForServicePort(service);
  if (!ready) {
    await stopService(service);
    throw new Error(`${service.label} 启动超时，请查看日志：${service.logFile}`);
  }

  log(`${service.label} 已启动，监听 ${getBindHost(service)}:${service.port}`);
}

async function stopService(service) {
  const pidRecord = readPidRecord(service.pidFile);
  if (!pidRecord) {
    log(`${service.label} 未发现 pid 记录，跳过停止`);
    return;
  }

  if (!isProcessAlive(pidRecord.pid)) {
    removePidRecord(service.pidFile);
    log(`${service.label} 进程记录已失效，已清理`);
    return;
  }

  signalProcess(pidRecord.pid, 'SIGTERM');
  const exited = await waitForProcessExit(pidRecord.pid);
  if (!exited) {
    signalProcess(pidRecord.pid, 'SIGKILL');
    await waitForProcessExit(pidRecord.pid, 2000);
  }

  removePidRecord(service.pidFile);
  log(`${service.label} 已停止`);
}

async function statusService(service) {
  const pidRecord = readPidRecord(service.pidFile);
  const alive = pidRecord ? isProcessAlive(pidRecord.pid) : false;
  const portOpen = await isPortOpen(getProbeHost(service), service.port);
  const status = alive && portOpen ? 'running' : alive ? 'starting' : portOpen ? 'orphaned' : 'stopped';

  log(
    `${service.label}: ${status} | listen=${getBindHost(service)}:${service.port} | probe=${getProbeHost(service)}:${service.port} | pid=${pidRecord ? pidRecord.pid : 'none'} | log=${path.relative(
      getRepoRoot(),
      service.logFile
    )}`
  );
}

async function manageServices(action, services) {
  if (action === 'stop') {
    for (const service of [...services].reverse()) {
      await stopService(service);
    }
    return;
  }

  if (action === 'status') {
    for (const service of services) {
      await statusService(service);
    }
    return;
  }

  if (action === 'restart') {
    for (const service of [...services].reverse()) {
      await stopService(service);
    }
  }

  for (const service of services) {
    await startService(service);
  }
}

async function manageDocker(repoRoot, action) {
  ensureMiddlewareEnv(repoRoot);

  if (action === 'status') {
    const result = runMiddlewareCompose(repoRoot, ['ps'], {
      captureOutput: true,
      allowFailure: true,
    });

    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error || result.status !== 0) {
      throw new Error('docker 中间件状态检查失败');
    }
    return;
  }

  if (action === 'stop') {
    runMiddlewareCompose(repoRoot, ['down']);
    return;
  }

  ensureRustfsVolumePermissions(repoRoot);

  if (action === 'restart') {
    runMiddlewareCompose(repoRoot, ['down']);
  }

  runMiddlewareCompose(repoRoot, ['up', '-d']);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  if (options.help) {
    usage();
    return 0;
  }

  const repoRoot = getRepoRoot();
  const runtimePaths = getRuntimePaths(repoRoot);
  ensureRuntimeDirs(runtimePaths);

  const serviceDefinitions = getServiceDefinitions(repoRoot);
  const services = selectServiceKeys(options.scope).map((key) => serviceDefinitions[key]);

  if (shouldManageDocker(options)) {
    await manageDocker(repoRoot, options.action);
  } else if (options.skipDocker) {
    log('已跳过 Docker 中间件管理');
  }

  await manageServices(options.action, services);
  return 0;
}

module.exports = {
  DEFAULT_STARTUP_TIMEOUT_MS,
  getRepoRoot,
  getRuntimePaths,
  parseCliArgs,
  shouldManageDocker,
  selectServiceKeys,
  getServiceDefinitions,
  ensureServiceEnvFile,
  buildServiceEnv,
  getServicePrestartCommands,
  runServicePrestartCommands,
  resolveComposeCommand,
  ensureRustfsVolumePermissions,
  waitForServicePort,
  main,
};
