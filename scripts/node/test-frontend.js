#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  parseFrontendCliArgs: parseCliArgs,
  buildFrontendCommands: buildCommands,
  runFrontend,
} = require('./test');
const {
  getRepoRoot,
  resolveOutputDir,
} = require('./testing/warning-capture.js');

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

  if (options.help || options.layer !== 'fast') {
    return runFrontend(argv, deps);
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const governanceWriters = createGovernanceLogWriters({
    repoRoot,
    env,
    fileName: 'frontend-fast.log',
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });

  const status = await runFrontend(argv, {
    ...deps,
    repoRoot,
    env,
    writeStdout: governanceWriters.writeStdout,
    writeStderr: governanceWriters.writeStderr,
  });

  const warningLogPath = path.join(
    resolveOutputDir(repoRoot, env),
    'frontend-fast.warnings.log'
  );
  if (!fs.existsSync(warningLogPath)) {
    fs.writeFileSync(warningLogPath, '', 'utf8');
  }

  return status;
}

if (require.main === module) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`[1flowbase-test-frontend] ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseCliArgs,
  buildCommands,
  main,
};
