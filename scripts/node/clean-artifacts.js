#!/usr/bin/env node

const {
  parseCliArgs,
  runArtifactCleanup: main,
} = require('./clean-artifacts/core.js');

if (require.main === module) {
  try {
    process.exitCode = main({
      options: parseCliArgs(process.argv.slice(2)),
    });
  } catch (error) {
    process.stderr.write(`[1flowbase-clean-artifacts] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseCliArgs,
  main,
};
