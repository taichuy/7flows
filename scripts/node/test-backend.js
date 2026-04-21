#!/usr/bin/env node

const {
  buildCargoCommandEnv,
  getCargoParallelism,
  runCommandSequence,
  getRepoRoot,
} = require('./testing/warning-capture.js');

function buildCommands({ cargoParallelism }) {
  return [
    {
      label: 'cargo-test',
      command: 'cargo',
      args: ['test', '--workspace', '--jobs', String(cargoParallelism), '--', `--test-threads=${cargoParallelism}`],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism, disableIncremental: true }),
    },
  ];
}

function main(_argv = [], deps = {}) {
  const repoRoot = deps.repoRoot || getRepoRoot();
  const cargoParallelism = deps.cargoParallelism || getCargoParallelism();

  return runCommandSequence({
    repoRoot,
    env: deps.env || process.env,
    scope: 'test-backend',
    commands: buildCommands({ cargoParallelism }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[1flowbase-test-backend] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildCommands,
  main,
};
