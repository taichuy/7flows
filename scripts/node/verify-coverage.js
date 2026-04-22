#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  parseCoverageCliArgs: parseCliArgs,
  buildCoverageFrontendCommand: buildFrontendCommand,
  collectFrontendCoverageFailures,
  buildCoverageBackendCleanupCommands: buildBackendCleanupCommands,
  buildCoverageBackendCommands: buildBackendCommands,
  collectBackendCoverageFailures,
  ensureCargoLlvmCovInstalled,
  runCoverage,
} = require('./verify');
const {
  getRepoRoot,
  resolveOutputDir,
} = require('./testing/warning-capture.js');

const COVERAGE_SCOPE_LABEL = '1flowbase-verify-coverage';

function createGovernanceLogWriters({
  repoRoot,
  env,
  fileName,
  writeStdout = (text) => process.stdout.write(text),
  writeStderr = (text) => process.stderr.write(text),
}) {
  const outputDir = resolveOutputDir(repoRoot, env);
  const logPath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(logPath, { force: true });

  const append = (text) => {
    if (!text) {
      return;
    }

    fs.appendFileSync(logPath, text, 'utf8');
  };

  return {
    writeStdout(text) {
      append(text);
      writeStdout(text);
    },
    writeStderr(text) {
      append(text);
      writeStderr(text);
    },
  };
}

async function main(argv = [], deps = {}) {
  const options = parseCliArgs(argv);

  if (options.help) {
    return runCoverage(argv, deps);
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const governanceWriters = createGovernanceLogWriters({
    repoRoot,
    env,
    fileName: 'coverage-summary.log',
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });

  return runCoverage(argv, {
    ...deps,
    repoRoot,
    env,
    writeStdout: governanceWriters.writeStdout,
    writeStderr: governanceWriters.writeStderr,
  });
}

if (require.main === module) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`[${COVERAGE_SCOPE_LABEL}] ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseCliArgs,
  buildFrontendCommand,
  buildBackendCommands,
  buildBackendCleanupCommands,
  collectFrontendCoverageFailures,
  collectBackendCoverageFailures,
  ensureCargoLlvmCovInstalled,
  main,
};
