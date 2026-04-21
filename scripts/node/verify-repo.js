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
      label: 'repo-script-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-scripts.js')],
      cwd: repoRoot,
    },
    {
      label: 'repo-contract-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-contracts.js')],
      cwd: repoRoot,
    },
    {
      label: 'repo-frontend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-frontend.js'), 'full'],
      cwd: repoRoot,
    },
    {
      label: 'repo-backend-full',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-backend.js')],
      cwd: repoRoot,
    },
  ];
}

function usage() {
  process.stdout.write(
    'Usage: node scripts/node/verify-repo.js\n'
      + 'Runs: scripts/node tests + contract tests + frontend full gate + backend full gate\n'
  );
}

async function main(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage();
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: 'verify-repo',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-repo.js',
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
      process.stderr.write(`[1flowbase-verify-repo] ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  buildCommands,
  main,
};
