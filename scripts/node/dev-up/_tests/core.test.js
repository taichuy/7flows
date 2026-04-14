const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');

const {
  parseCliArgs,
  shouldManageDocker,
  selectServiceKeys,
  getServiceDefinitions,
  ensureServiceEnvFile,
  buildServiceEnv,
  getServicePrestartCommands,
  ensureRustfsVolumePermissions,
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
  assert.deepEqual(services.web.args, ['--filter', '@1flowse/web', 'dev']);
  assert.deepEqual(services['api-server'].args, ['run', '-p', 'api-server', '--bin', 'api-server']);
  assert.deepEqual(services['plugin-runner'].args, ['run', '-p', 'plugin-runner', '--bin', 'plugin-runner']);
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
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-dev-up-'));
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
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-dev-up-env-'));
  const apiServerDir = path.join(tempRepoRoot, 'api', 'apps', 'api-server');
  const envExamplePath = path.join(apiServerDir, '.env.example');

  fs.mkdirSync(apiServerDir, { recursive: true });
  fs.writeFileSync(
    envExamplePath,
    [
      '# api defaults',
      'API_DATABASE_URL=postgres://from-example',
      'API_REDIS_URL=redis://from-example',
      'BOOTSTRAP_WORKSPACE_NAME=\"1Flowse\"',
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
  assert.equal(env.BOOTSTRAP_WORKSPACE_NAME, '1Flowse');
  assert.equal(env.EXTRA_FLAG, 'enabled');
});

test('getServicePrestartCommands resets api root password in development mode', () => {
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-dev-up-prestart-'));
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
  const tempRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowse-dev-up-prod-'));
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
