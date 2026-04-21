#!/usr/bin/env node

const path = require('node:path');

const {
  getRepoRoot,
  runManagedCommandSequence,
} = require('./testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('./testing/verify-runtime.js');

function buildCommands({ repoRoot }) {
  return [
    {
      label: 'ci-verify-repo',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-repo.js')],
      cwd: repoRoot,
    },
    {
      label: 'ci-verify-coverage',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-coverage.js'), 'all'],
      cwd: repoRoot,
    },
  ];
}

function usage(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/verify-ci.js\n'
      + 'Runs: verify-repo + verify-coverage all\n'
  );
}

async function main(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: 'verify-ci',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-ci.js',
    runtimeConfig,
    commands: buildCommands({ repoRoot }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

if (require.main === module) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`[1flowbase-verify-ci] ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  buildCommands,
  main,
};
