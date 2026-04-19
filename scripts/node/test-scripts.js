#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  getRepoRoot,
  runCommandSequence,
} = require('./testing/warning-capture.js');

function parseCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    return {
      help: true,
      filters: [],
    };
  }

  return {
    help: false,
    filters: argv,
  };
}

function walkScriptTests(currentDir, collected) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      walkScriptTests(absolutePath, collected);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (
      entry.name.endsWith('.js')
      && absolutePath.includes(`${path.sep}_tests${path.sep}`)
    ) {
      collected.push(absolutePath);
    }
  }
}

function listTestFiles(repoRoot) {
  const collected = [];
  walkScriptTests(path.join(repoRoot, 'scripts', 'node'), collected);
  return collected;
}

function selectTestFiles(files, filters) {
  const sorted = [...files].sort((left, right) => left.localeCompare(right));

  if (filters.length === 0) {
    return sorted;
  }

  return sorted.filter((file) => filters.some((filter) => file.includes(filter)));
}

function buildCommand({ repoRoot, files }) {
  return {
    label: 'scripts-node-tests',
    command: process.execPath,
    args: ['--test', ...files],
    cwd: repoRoot,
  };
}

function usage() {
  process.stdout.write(
    'Usage: node scripts/node/test-scripts.js [filter ...]\n'
      + 'Examples:\n'
      + '  node scripts/node/test-scripts.js\n'
      + '  node scripts/node/test-scripts.js page-debug\n'
      + '  node scripts/node/test-scripts.js verify-backend runtime-gate\n'
  );
}

function main(argv = [], deps = {}) {
  const options = parseCliArgs(argv);

  if (options.help) {
    usage();
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const discoveredFiles = (deps.listTestFilesImpl || (() => listTestFiles(repoRoot)))();
  const selectedFiles = selectTestFiles(discoveredFiles, options.filters);

  if (selectedFiles.length === 0) {
    throw new Error(`No script tests matched filters: ${options.filters.join(', ')}`);
  }

  return runCommandSequence({
    repoRoot,
    env: deps.env || process.env,
    scope: 'test-scripts',
    commands: [buildCommand({ repoRoot, files: selectedFiles })],
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[1flowbase-test-scripts] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseCliArgs,
  listTestFiles,
  selectTestFiles,
  buildCommand,
  main,
};
