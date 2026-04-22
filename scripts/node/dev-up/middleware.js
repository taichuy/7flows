const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { log } = require('./cli.js');
const { buildLocalLoopbackEnv, parseEnvFile } = require('./env.js');
const { getRepoRoot } = require('./services.js');

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

function writeCommandOutput(result) {
  if (result?.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result?.stderr) {
    process.stderr.write(result.stderr);
  }
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

function ensureMiddlewareEnv(repoRoot, { logImpl = log } = {}) {
  const dockerDir = path.join(repoRoot, 'docker');
  const examplePath = path.join(dockerDir, 'middleware.env.example');
  const targetPath = path.join(dockerDir, 'middleware.env');

  if (!fs.existsSync(targetPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, targetPath);
    logImpl('已创建 docker/middleware.env');
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

async function manageDocker(
  repoRoot,
  action,
  {
    ensureMiddlewareEnvImpl = ensureMiddlewareEnv,
    ensureRustfsVolumePermissionsImpl = ensureRustfsVolumePermissions,
    runMiddlewareComposeImpl = runMiddlewareCompose,
  } = {}
) {
  ensureMiddlewareEnvImpl(repoRoot);

  if (action === 'status') {
    const result = runMiddlewareComposeImpl(repoRoot, ['ps'], {
      captureOutput: true,
      allowFailure: true,
    });

    writeCommandOutput(result);

    if (result.error || result.status !== 0) {
      throw new Error('docker 中间件状态检查失败');
    }
    return;
  }

  if (action === 'stop') {
    runMiddlewareComposeImpl(repoRoot, ['down']);
    return;
  }

  ensureRustfsVolumePermissionsImpl(repoRoot);

  if (action === 'restart') {
    runMiddlewareComposeImpl(repoRoot, ['down']);
  }

  runMiddlewareComposeImpl(repoRoot, ['up', '-d']);
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

module.exports = {
  ensureCommandSuccess,
  ensureMiddlewareEnv,
  ensureRustfsVolumePermissions,
  getMiddlewarePostgresPort,
  manageDocker,
  resolveComposeCommand,
  runCommand,
  runMiddlewareCompose,
  writeCommandOutput,
};
