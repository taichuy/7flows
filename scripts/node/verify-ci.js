#!/usr/bin/env node

const path = require('node:path');

const {
  getRepoRoot,
  runCommandSequence,
} = require('./testing/warning-capture.js');

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

function main(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();

  return runCommandSequence({
    repoRoot,
    env: deps.env || process.env,
    scope: 'verify-ci',
    commands: buildCommands({ repoRoot }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[1flowbase-verify-ci] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildCommands,
  main,
};
