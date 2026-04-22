const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');

const {
  DEFAULT_STARTUP_TIMEOUT_MS,
  parseCliArgs,
  shouldManageDocker,
  selectServiceKeys,
  getServiceDefinitions,
  manageDocker,
  startService,
  ensureServiceEnvFile,
  buildServiceEnv,
  getServicePrestartCommands,
  runServicePrestartCommands,
  ensureRustfsVolumePermissions,
  waitForServicePort,
} = require('../core.js');

test('parseCliArgs defaults to full start', () => {
  assert.deepEqual(parseCliArgs([]), {
    action: 'start',
    scope: 'all',
    skipDocker: false,
    help: false,
  });
});

test('parseCliArgs supports backend restart without docker', () => {
  assert.deepEqual(parseCliArgs(['restart', '--backend-only', '--skip-docker']), {
    action: 'restart',
    scope: 'backend',
    skipDocker: true,
    help: false,
  });
});

test('shouldManageDocker skips docker for frontend-only runs', () => {
  assert.equal(
    shouldManageDocker({
      scope: 'frontend',
      skipDocker: false,
    }),
    false
  );
});

test('selectServiceKeys maps scopes to managed services', () => {
  assert.deepEqual(selectServiceKeys('all'), ['web', 'api-server', 'plugin-runner']);
  assert.deepEqual(selectServiceKeys('frontend'), ['web']);
  assert.deepEqual(selectServiceKeys('backend'), ['api-server', 'plugin-runner']);
});

test('getServiceDefinitions uses repo default ports and explicit backend binaries', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const services = getServiceDefinitions(repoRoot);

  assert.equal(services.web.port, 3100);
  assert.equal(services['api-server'].port, 7800);
  assert.equal(services['plugin-runner'].port, 7801);
  assert.equal(services.web.bindHost, '0.0.0.0');
  assert.equal(services.web.probeHost, '127.0.0.1');
  assert.equal(services['api-server'].bindHost, '0.0.0.0');
  assert.equal(services['api-server'].probeHost, '127.0.0.1');
  assert.deepEqual(services.web.args, ['--filter', '@1flowbase/web', 'dev']);
  assert.deepEqual(services['api-server'].args, ['run', '-p', 'api-server', '--bin', 'api-server']);
  assert.deepEqual(services['plugin-runner'].args, ['run', '-p', 'plugin-runner', '--bin', 'plugin-runner']);
});

test('getServiceDefinitions gives plugin-runner extra startup time for cold cargo builds', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const services = getServiceDefinitions(repoRoot);

  assert.equal(services.web.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS);
  assert.equal(services['api-server'].startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS);
  assert.equal(services['plugin-runner'].startupTimeoutMs, 60_000);
});

test('waitForServicePort honors per-service startup timeout overrides', async () => {
  const calls = [];

  const ready = await waitForServicePort(
    {
      probeHost: '127.0.0.1',
      port: 7801,
      startupTimeoutMs: 60_000,
    },
    async (host, port, timeoutMs) => {
      calls.push({ host, port, timeoutMs });
      return true;
    }
  );

  assert.equal(ready, true);
  assert.deepEqual(calls, [
    {
      host: '127.0.0.1',
      port: 7801,
      timeoutMs: 60_000,
    },
  ]);
});

test('startService fails fast when the frontend port is occupied by another process', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-port-occupied-'));
  const service = {
    key: 'web',
    label: 'frontend',
    cwd: path.join(tempRoot, 'web'),
    command: 'pnpm',
    args: ['--filter', '@1flowbase/web', 'dev'],
    bindHost: '0.0.0.0',
    probeHost: '127.0.0.1',
    port: 3100,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    logFile: path.join(tempRoot, 'web.log'),
    pidFile: path.join(tempRoot, 'web.json'),
  };
  let spawned = false;

  await assert.rejects(
    startService(service, {
      ensureServiceEnvFileImpl() {
        return false;
      },
      requireCommandImpl() {},
      runServicePrestartCommandsImpl() {},
      readPidRecordImpl() {
        return null;
      },
      isProcessAliveImpl() {
        return false;
      },
      isPortOpenImpl: async () => true,
      logImpl() {},
      spawnImpl() {
        spawned = true;
        throw new Error('spawn should not be called');
      },
    }),
    /frontend 启动失败，端口 3100 已被其他进程占用/u
  );

  assert.equal(spawned, false);
  assert.equal(fs.existsSync(service.pidFile), false);
});

test('startService reclaims an occupied service port during restart takeover before spawning', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-port-takeover-'));
  const service = {
    key: 'api-server',
    label: 'api-server',
    cwd: path.join(tempRoot, 'api'),
    command: 'cargo',
    args: ['run', '-p', 'api-server', '--bin', 'api-server'],
    bindHost: '0.0.0.0',
    probeHost: '127.0.0.1',
    port: 7800,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    logFile: path.join(tempRoot, 'api-server.log'),
    pidFile: path.join(tempRoot, 'api-server.json'),
  };
  const clearCalls = [];
  let portOccupied = true;
  let spawned = false;
  let recordedPid = null;

  await startService(service, {
    ensureServiceEnvFileImpl() {
      return false;
    },
    requireCommandImpl() {},
    runServicePrestartCommandsImpl() {},
    readPidRecordImpl() {
      return null;
    },
    isProcessAliveImpl() {
      return false;
    },
    async isPortOpenImpl() {
      return portOccupied;
    },
    async clearPortConflictsImpl(label, ports) {
      clearCalls.push({ label, ports });
      portOccupied = false;
    },
    logImpl() {},
    spawnImpl() {
      spawned = true;
      return {
        pid: 4242,
        unref() {},
      };
    },
    buildServiceEnvImpl() {
      return {};
    },
    writePidRecordImpl(_service, pid) {
      recordedPid = pid;
    },
    async waitForServicePortImpl() {
      return true;
    },
    takeOverPortOwnership: true,
  });

  assert.deepEqual(clearCalls, [
    {
      label: 'api-server',
      ports: [7800],
    },
  ]);
  assert.equal(spawned, true);
  assert.equal(recordedPid, 4242);
});

test('manageDocker restart clears middleware port conflicts before bringing services up', async () => {
  const composeCalls = [];
  const clearCalls = [];

  await manageDocker('/repo-root', 'restart', {
    ensureMiddlewareEnvImpl() {},
    ensureRustfsVolumePermissionsImpl() {},
    getMiddlewareHostPortsImpl() {
      return [35432, 36379, 39000, 39001];
    },
    async clearPortConflictsImpl(label, ports) {
      clearCalls.push({ label, ports });
    },
    runMiddlewareComposeImpl(_repoRoot, args) {
      composeCalls.push(args);
      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
  });

  assert.deepEqual(clearCalls, [
    {
      label: 'docker 中间件',
      ports: [35432, 36379, 39000, 39001],
    },
  ]);
  assert.deepEqual(composeCalls, [['down'], ['up', '-d']]);
});

test('api-server example env files use workspace bootstrap naming', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const developmentExample = fs.readFileSync(
    path.join(repoRoot, 'api', 'apps', 'api-server', '.env.example'),
    'utf8'
  );
  const productionExample = fs.readFileSync(
    path.join(repoRoot, 'api', 'apps', 'api-server', '.env.production.example'),
    'utf8'
  );

  assert.match(developmentExample, /^BOOTSTRAP_WORKSPACE_NAME=/mu);
  assert.doesNotMatch(developmentExample, /^BOOTSTRAP_TEAM_NAME=/mu);
  assert.match(productionExample, /^BOOTSTRAP_WORKSPACE_NAME=/mu);
  assert.doesNotMatch(productionExample, /^BOOTSTRAP_TEAM_NAME=/mu);
});

test('ensureRustfsVolumePermissions creates writable rustfs bind mount directories', () => {
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-'));
  const dockerDir = path.join(tempRepoRoot, 'docker');
  const rustfsDataDir = path.join(dockerDir, 'volumes', 'rustfs', 'data');
  const rustfsLogsDir = path.join(dockerDir, 'volumes', 'rustfs', 'logs');

  fs.mkdirSync(rustfsDataDir, { recursive: true, mode: 0o755 });
  fs.mkdirSync(rustfsLogsDir, { recursive: true, mode: 0o755 });

  ensureRustfsVolumePermissions(tempRepoRoot);

  assert.equal(fs.statSync(path.join(dockerDir, 'volumes', 'rustfs')).mode & 0o777, 0o777);
  assert.equal(fs.statSync(rustfsDataDir).mode & 0o777, 0o777);
  assert.equal(fs.statSync(rustfsLogsDir).mode & 0o777, 0o777);
});

test('ensureServiceEnvFile seeds api env defaults and buildServiceEnv loads them', () => {
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-env-'));
  const apiServerDir = path.join(tempRepoRoot, 'api', 'apps', 'api-server');
  const envExamplePath = path.join(apiServerDir, '.env.example');

  fs.mkdirSync(apiServerDir, { recursive: true });
  fs.writeFileSync(
    envExamplePath,
    [
      '# api defaults',
      'API_DATABASE_URL=postgres://from-example',
      'API_REDIS_URL=redis://from-example',
      'BOOTSTRAP_WORKSPACE_NAME=\"1flowbase\"',
    ].join('\n')
  );

  const services = getServiceDefinitions(tempRepoRoot);
  const apiService = services['api-server'];

  assert.equal(fs.existsSync(apiService.envFile), false);
  assert.equal(ensureServiceEnvFile(apiService), true);
  assert.equal(fs.existsSync(apiService.envFile), true);

  const env = buildServiceEnv(apiService, {
    API_DATABASE_URL: 'postgres://from-shell',
    EXTRA_FLAG: 'enabled',
  });

  assert.equal(env.API_DATABASE_URL, 'postgres://from-shell');
  assert.equal(env.API_REDIS_URL, 'redis://from-example');
  assert.equal(env.BOOTSTRAP_WORKSPACE_NAME, '1flowbase');
  assert.equal(env.EXTRA_FLAG, 'enabled');
});

test('ensureServiceEnvFile migrates legacy api-server brand defaults in existing env file', () => {
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-legacy-env-'));
  const apiServerDir = path.join(tempRepoRoot, 'api', 'apps', 'api-server');
  const envExamplePath = path.join(apiServerDir, '.env.example');
  const envPath = path.join(apiServerDir, '.env');

  fs.mkdirSync(apiServerDir, { recursive: true });
  fs.writeFileSync(
    envExamplePath,
    [
      'API_DATABASE_URL=postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase',
      'API_REDIS_URL=redis://:1flowbase@127.0.0.1:36379',
      'API_COOKIE_NAME=flowbase_console_session',
      'BOOTSTRAP_WORKSPACE_NAME=1flowbase',
    ].join('\n')
  );
  fs.writeFileSync(
    envPath,
    [
      'API_DATABASE_URL=postgres://postgres:sevenflows@127.0.0.1:35432/sevenflows',
      'API_REDIS_URL=redis://:sevenflows@127.0.0.1:36379',
      'API_COOKIE_NAME=flowse_console_session',
      'BOOTSTRAP_WORKSPACE_NAME=1Flowse',
      'BOOTSTRAP_ROOT_PASSWORD=change-me',
    ].join('\n')
  );

  const services = getServiceDefinitions(tempRepoRoot);
  const apiService = services['api-server'];

  assert.equal(ensureServiceEnvFile(apiService), true);

  const env = buildServiceEnv(apiService, {});

  assert.equal(env.API_DATABASE_URL, 'postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase');
  assert.equal(env.API_REDIS_URL, 'redis://:1flowbase@127.0.0.1:36379');
  assert.equal(env.API_COOKIE_NAME, 'flowbase_console_session');
  assert.equal(env.BOOTSTRAP_WORKSPACE_NAME, '1flowbase');
  assert.equal(env.BOOTSTRAP_ROOT_PASSWORD, 'change-me');
});

test('getServicePrestartCommands resets api root password in development mode', () => {
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-prestart-'));
  const apiServerDir = path.join(tempRepoRoot, 'api', 'apps', 'api-server');
  const envExamplePath = path.join(apiServerDir, '.env.example');

  fs.mkdirSync(apiServerDir, { recursive: true });
  fs.writeFileSync(
    envExamplePath,
    ['API_ENV=development', 'API_DATABASE_URL=postgres://from-example'].join('\n')
  );

  const services = getServiceDefinitions(tempRepoRoot);
  const apiService = services['api-server'];
  ensureServiceEnvFile(apiService);

  const commands = getServicePrestartCommands(apiService, {});

  assert.deepEqual(
    commands.map((command) => ({
      command: command.command,
      args: command.args,
      cwd: command.cwd,
    })),
    [
      {
        command: 'cargo',
        args: ['run', '-p', 'api-server', '--bin', 'reset_root_password'],
        cwd: path.join(tempRepoRoot, 'api'),
      },
    ]
  );
  assert.equal(commands[0].env.API_ENV, 'development');
});

test('getServicePrestartCommands skips api root reset in production mode', () => {
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-prod-'));
  const apiServerDir = path.join(tempRepoRoot, 'api', 'apps', 'api-server');
  const envExamplePath = path.join(apiServerDir, '.env.example');

  fs.mkdirSync(apiServerDir, { recursive: true });
  fs.writeFileSync(
    envExamplePath,
    ['API_ENV=production', 'API_DATABASE_URL=postgres://from-example'].join('\n')
  );

  const services = getServiceDefinitions(tempRepoRoot);
  const apiService = services['api-server'];
  ensureServiceEnvFile(apiService);

  assert.deepEqual(getServicePrestartCommands(apiService, {}), []);
});

test('runServicePrestartCommands rebuilds local postgres db after migration checksum mismatch', () => {
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-dev-up-recover-'));
  const apiServerDir = path.join(tempRepoRoot, 'api', 'apps', 'api-server');
  const dockerDir = path.join(tempRepoRoot, 'docker');

  fs.mkdirSync(apiServerDir, { recursive: true });
  fs.mkdirSync(dockerDir, { recursive: true });

  fs.writeFileSync(
    path.join(apiServerDir, '.env.example'),
    [
      'API_ENV=development',
      'API_DATABASE_URL=postgres://postgres:1flowbase@127.0.0.1:35432/1flowbase',
      'API_REDIS_URL=redis://127.0.0.1:36379',
      'BOOTSTRAP_WORKSPACE_NAME=1flowbase',
      'BOOTSTRAP_ROOT_ACCOUNT=root',
      'BOOTSTRAP_ROOT_EMAIL=root@example.com',
      'BOOTSTRAP_ROOT_PASSWORD=change-me',
    ].join('\n')
  );
  fs.writeFileSync(path.join(dockerDir, 'middleware.env'), 'POSTGRES_PORT=35432\n');

  const services = getServiceDefinitions(tempRepoRoot);
  const apiService = services['api-server'];
  ensureServiceEnvFile(apiService);

  const commandCalls = [];
  const composeCalls = [];
  let attempt = 0;

  runServicePrestartCommands(apiService, {
    runCommandImpl(command, args, options) {
      commandCalls.push({ command, args, options });
      attempt += 1;
      if (attempt === 1) {
        return {
          status: 1,
          stdout: '',
          stderr: 'Error: migration 20260412183000 was previously applied but has been modified\n',
        };
      }

      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
    runMiddlewareComposeImpl(repoRoot, args) {
      composeCalls.push({ repoRoot, args });
      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
  });

  assert.equal(commandCalls.length, 2);
  assert.ok(commandCalls.every((entry) => entry.options.captureOutput === true));
  assert.deepEqual(
    composeCalls.map((entry) => entry.args),
    [
      [
        'exec',
        '-T',
        'db',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        'DROP DATABASE IF EXISTS "1flowbase" WITH (FORCE);',
      ],
      [
        'exec',
        '-T',
        'db',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        'CREATE DATABASE "1flowbase";',
      ],
    ]
  );
});
