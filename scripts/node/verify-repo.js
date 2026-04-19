#!/usr/bin/env node

const path = require('node:path');

const {
  getRepoRoot,
  runCommandSequence,
} = require('./testing/warning-capture.js');

function buildCommands({ repoRoot }) {
  return [
    {
      label: 'repo-script-tests',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'test-scripts.js')],
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
      + 'Runs: scripts/node tests + frontend full gate + backend full gate\n'
  );
}

function main(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage();
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();

  return runCommandSequence({
    repoRoot,
    env: deps.env || process.env,
    scope: 'verify-repo',
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
    process.stderr.write(`[1flowbase-verify-repo] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildCommands,
  main,
};
