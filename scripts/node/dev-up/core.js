const { parseCliArgs, selectServiceKeys, shouldManageDocker, usage } = require('./cli.js');
const { buildServiceEnv, ensureServiceEnvFile, getServicePrestartCommands } = require('./env.js');
const {
  ensureRustfsVolumePermissions,
  manageDocker,
  resolveComposeCommand,
} = require('./middleware.js');
const { waitForServicePort, manageServices } = require('./process.js');
const { runServicePrestartCommands } = require('./postgres-reset.js');
const {
  DEFAULT_STARTUP_TIMEOUT_MS,
  ensureRuntimeDirs,
  getRepoRoot,
  getRuntimePaths,
  getServiceDefinitions,
} = require('./services.js');

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
    const { log } = require('./cli.js');
    log('已跳过 Docker 中间件管理');
  }

  await manageServices(options.action, services);
  return 0;
}

module.exports = {
  DEFAULT_STARTUP_TIMEOUT_MS,
  buildServiceEnv,
  ensureRustfsVolumePermissions,
  ensureServiceEnvFile,
  getRepoRoot,
  getRuntimePaths,
  getServiceDefinitions,
  getServicePrestartCommands,
  main,
  parseCliArgs,
  resolveComposeCommand,
  runServicePrestartCommands,
  selectServiceKeys,
  shouldManageDocker,
  waitForServicePort,
};
