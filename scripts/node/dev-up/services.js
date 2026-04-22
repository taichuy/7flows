const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const CARGO_COLD_STARTUP_TIMEOUT_MS = 60_000;

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

module.exports = {
  CARGO_COLD_STARTUP_TIMEOUT_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  ensureRuntimeDirs,
  getRepoRoot,
  getRuntimePaths,
  getServiceDefinitions,
};
