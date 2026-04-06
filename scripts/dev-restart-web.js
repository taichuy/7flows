#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const TMP_DIR = path.join(REPO_ROOT, 'tmp', 'dev-up');
const PID_DIR = path.join(TMP_DIR, 'pids');
const LOG_DIR = path.join(REPO_ROOT, 'tmp', 'logs');
const WEB_DIR = path.join(REPO_ROOT, 'web');
const WEB_PORT = 3100;
const WEB_PID_FILE = path.join(PID_DIR, 'web.pid');
const WEB_LOG_FILE = path.join(LOG_DIR, 'web.log');
const WEB_DIST_DIR = path.join(WEB_DIR, '.next');
const WEB_NEXT_CLI = path.join(WEB_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');

fs.mkdirSync(PID_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

let dryRun = false;
let skipInstall = true;
let requestedWebMode = null;

function usage() {
  process.stdout.write(`用法：node scripts/dev-restart-web.js [选项]

默认行为：
- 仅停止并重启受管的 Web 进程
- 固定走 local-only，不管理 Docker / API / Worker / Beat
- 默认跳过 pnpm install

选项：
  --web-mode      Web 启动模式：\`dev\`（默认）或 \`build\`
  --install       重启前额外执行一次 \`pnpm install\`
  --skip-install  显式保持默认行为：跳过 \`pnpm install\`
  --dry-run       只打印将执行的动作，不真正停止或启动进程
  -h, --help      查看帮助

示例：
  node scripts/dev-restart-web.js
  node scripts/dev-restart-web.js --web-mode build
  node scripts/dev-restart-web.js --install
  node scripts/dev-restart-web.js --dry-run
`);
}

function log(message) {
  process.stdout.write(`[7flows-dev-restart-web] ${message}\n`);
}

function displayPath(targetPath) {
  const relativePath = path.relative(REPO_ROOT, targetPath);
  if (relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join('/');
  }

  return targetPath;
}

function sleepSync(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return;
  }

  const blocker = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(blocker, 0, 0, milliseconds);
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

function runCommand(command, args, { cwd = REPO_ROOT, captureOutput = false } = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function readPid(pidFile) {
  if (!fs.existsSync(pidFile)) {
    return null;
  }

  const value = fs.readFileSync(pidFile, 'utf8').trim();
  const pid = Number.parseInt(value, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error && error.code === 'ESRCH');
  }
}

function cleanupStalePid(pidFile) {
  const pid = readPid(pidFile);
  if (!pid || isPidAlive(pid)) {
    return;
  }

  fs.rmSync(pidFile, { force: true });
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

function waitForProcessExit(pid, attempts = 10, intervalMs = 500) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!isPidAlive(pid)) {
      return true;
    }

    sleepSync(intervalMs);
  }

  return !isPidAlive(pid);
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

function readProcessArgs(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || !commandExists('ps')) {
    return '';
  }

  const result = runCommand('ps', ['-o', 'args=', '-p', String(pid)], { captureOutput: true });
  if (result.error || result.status !== 0) {
    return '';
  }

  return (result.stdout || '').trim();
}

function inferWebMode() {
  if (requestedWebMode) {
    return requestedWebMode;
  }

  cleanupStalePid(WEB_PID_FILE);
  const pid = readPid(WEB_PID_FILE);
  const args = pid ? readProcessArgs(pid) : '';

  if (args.includes('/next/dist/bin/next start') || args.includes(' next start ')) {
    log('未显式传入 --web-mode，沿用当前受管 Web 进程的 build 模式');
    return 'build';
  }

  if (args.includes('/next/dist/bin/next dev') || args.includes(' next dev ')) {
    log('未显式传入 --web-mode，沿用当前受管 Web 进程的 dev 模式');
    return 'dev';
  }

  return 'dev';
}

function findListeningPidsByPort(port) {
  const processIds = new Set();

  if (process.platform !== 'win32' && commandExists('ss')) {
    const result = runCommand('ss', ['-ltnp', `sport = :${port}`], { captureOutput: true });
    if (!result.error && result.status === 0 && result.stdout) {
      for (const match of result.stdout.matchAll(/pid=(\d+)/g)) {
        processIds.add(Number.parseInt(match[1], 10));
      }
    }
  }

  if (processIds.size === 0 && commandExists('lsof')) {
    const result = runCommand(
      'lsof',
      ['-iTCP:' + String(port), '-sTCP:LISTEN', '-n', '-P'],
      { captureOutput: true }
    );
    if (!result.error && result.status === 0 && result.stdout) {
      for (const line of result.stdout.split(/\r?\n/).slice(1)) {
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

function cleanupOrphanedWebListeners(excludedPids = []) {
  const excludedPidSet = new Set(excludedPids.filter((pid) => Number.isInteger(pid) && pid > 0));
  const occupiedPids = findListeningPidsByPort(WEB_PORT).filter((pid) => !excludedPidSet.has(pid));

  if (occupiedPids.length === 0) {
    return;
  }

  log(`发现占用 ${WEB_PORT} 端口的孤儿 Web 进程：${occupiedPids.join(', ')}`);
  if (dryRun) {
    return;
  }

  for (const pid of occupiedPids) {
    killProcessGroup(pid, 'SIGTERM');
  }

  sleepSync(1000);

  for (const pid of occupiedPids) {
    if (isPidAlive(pid)) {
      killProcessGroup(pid, 'SIGKILL');
    }
  }
}

function stopTrackedWebProcess() {
  cleanupStalePid(WEB_PID_FILE);
  const pid = readPid(WEB_PID_FILE);

  if (!pid) {
    log('未发现受管 Web 进程，直接进入启动阶段');
    return;
  }

  log(`停止受管 Web 进程，PID=${pid}`);
  if (dryRun) {
    return;
  }

  killProcessGroup(pid, 'SIGTERM');
  if (!waitForProcessExit(pid)) {
    killProcessGroup(pid, 'SIGKILL');
    waitForProcessExit(pid, 4, 250);
  }

  fs.rmSync(WEB_PID_FILE, { force: true });
}

function cleanupWebBuildArtifacts() {
  if (!fs.existsSync(WEB_DIST_DIR)) {
    return;
  }

  log(`清理 ${displayPath(WEB_DIST_DIR)}，避免旧产物残留`);
  if (!dryRun) {
    fs.rmSync(WEB_DIST_DIR, { recursive: true, force: true });
  }
}

function ensureWebDependencies() {
  if (skipInstall) {
    log('按默认行为跳过 pnpm install');
    return;
  }

  requireCommand('corepack');
  log('同步 Web 依赖');
  const result = runCommand('corepack', ['pnpm', 'install'], { cwd: WEB_DIR });
  if (result.status !== 0) {
    throw new Error('同步 Web 依赖失败');
  }
}

function buildWebArtifacts() {
  requireCommand('corepack');
  log('构建 Web 产物');
  if (dryRun) {
    return;
  }

  const result = runCommand('corepack', ['pnpm', 'build'], { cwd: WEB_DIR });
  if (result.status !== 0) {
    throw new Error('构建 Web 产物失败');
  }
}

function resolveWebCommand(webMode) {
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

function startWebProcess(webMode) {
  cleanupOrphanedWebListeners();
  cleanupWebBuildArtifacts();
  if (webMode === 'build') {
    buildWebArtifacts();
  }

  const webCommand = resolveWebCommand(webMode);
  log(`启动 Web（${webMode}），日志：${displayPath(WEB_LOG_FILE)}`);

  if (dryRun) {
    log(
      `dry-run: ${webCommand.command} ${webCommand.args
        .map((arg) => JSON.stringify(arg))
        .join(' ')}`
    );
    return;
  }

  const outputHandle = fs.openSync(WEB_LOG_FILE, 'a');
  const child = spawn(webCommand.command, webCommand.args, {
    cwd: WEB_DIR,
    detached: true,
    env: { ...process.env, ...webCommand.env },
    stdio: ['ignore', outputHandle, outputHandle],
  });

  child.unref();
  fs.closeSync(outputHandle);

  if (!child.pid) {
    throw new Error(`Web 启动失败，请查看 ${displayPath(WEB_LOG_FILE)}`);
  }

  fs.writeFileSync(WEB_PID_FILE, String(child.pid));
  sleepSync(1000);

  if (!isPidAlive(child.pid)) {
    const tailOutput = readTail(WEB_LOG_FILE);
    throw new Error(
      `Web 启动失败，请查看 ${displayPath(WEB_LOG_FILE)}${
        tailOutput ? `\n${tailOutput}` : ''
      }`
    );
  }
}

function probeLoginRoute() {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port: WEB_PORT,
        path: '/login',
        headers: {
          Host: 'localhost',
        },
        timeout: 2000,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? null);
      }
    );

    request.on('error', () => resolve(null));
    request.on('timeout', () => {
      request.destroy();
      resolve(null);
    });
  });
}

async function ensureWebHealthy() {
  if (dryRun) {
    return;
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const status = await probeLoginRoute();
    if (status === 200) {
      log('Web 登录页已恢复：/login=200');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const tailOutput = readTail(WEB_LOG_FILE, 80);
  throw new Error(
    `Web 登录页未恢复（期望 /login=200）${
      tailOutput ? `\n最近日志：\n${tailOutput}` : ''
    }`
  );
}

function parseArgs(args) {
  for (let index = 0; index < args.length; index += 1) {
    const currentArg = args[index];

    switch (currentArg) {
      case '--install':
        skipInstall = false;
        break;
      case '--skip-install':
        skipInstall = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--web-mode': {
        const nextWebMode = args[index + 1];
        if (!nextWebMode) {
          throw new Error('`--web-mode` 需要一个参数：dev 或 build');
        }

        requestedWebMode = parseWebMode(nextWebMode);
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
          requestedWebMode = parseWebMode(currentArg.slice('--web-mode='.length));
          break;
        }

        throw new Error(`未知参数：${currentArg}`);
    }
  }
}

function parseWebMode(value) {
  if (value !== 'dev' && value !== 'build') {
    throw new Error(`不支持的 Web 启动模式：${value}`);
  }

  return value;
}

async function main() {
  try {
    parseArgs(process.argv.slice(2));

    const webMode = inferWebMode();
    ensureWebDependencies();
    stopTrackedWebProcess();
    startWebProcess(webMode);
    await ensureWebHealthy();

    if (dryRun) {
      log('dry-run 完成');
      return;
    }

    process.stdout.write(`
Web 重启完成：
- Web:  http://localhost:${WEB_PORT} (${webMode})
- PID:  ${readPid(WEB_PID_FILE) ?? 'unknown'}
- 日志: ${displayPath(WEB_LOG_FILE)}
`);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`${message}\n\n`);
    usage();
    process.exit(1);
  }
}

main();
