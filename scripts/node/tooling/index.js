#!/usr/bin/env node

const path = require('node:path');

const { main: runCheckStyleBoundary } = require('../check-style-boundary/core.js');
const { main: runPageDebug } = require('../page-debug/core.js');
const { main: runMockUiSync } = require('../mock-ui-sync/core.js');
const { main: runClaudeSkillSync } = require('../claude-skill-sync/core.js');
const {
  getRepoRoot,
  runCommandSequence,
} = require('../testing/warning-capture.js');
const { resolveNodeBinaryFromPath } = require('../testing/node-runtime.js');

const TOOLING_COMMANDS = new Set([
  'check-style-boundary',
  'claude-skill-sync',
  'mock-ui-sync',
  'page-debug',
  'runtime-gate',
]);

function resolveScriptsNodeEntry(repoRoot, entryName) {
  return path.join(repoRoot, 'scripts', 'node', entryName);
}

function resolveScriptsNodeCliEntry(repoRoot, entryName) {
  return `${resolveScriptsNodeEntry(repoRoot, entryName)}.js`;
}

function buildRuntimeGateCommand({ argv, repoRoot, env = process.env }) {
  return {
    label: 'runtime-page-debug',
    command: resolveNodeBinaryFromPath(env),
    args: [resolveScriptsNodeCliEntry(repoRoot, 'tooling'), 'page-debug', ...argv],
    cwd: repoRoot,
  };
}

function usageRuntimeGate(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout('Usage: node scripts/node/runtime-gate.js <page-debug args>\n');
}

function runRuntimeGate(argv = [], deps = {}) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    usageRuntimeGate(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();

  return runCommandSequence({
    repoRoot,
    env: deps.env || process.env,
    scope: 'runtime-gate',
    commands: [buildRuntimeGateCommand({ argv, repoRoot, env: deps.env || process.env })],
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

function parseToolingCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    return {
      help: true,
      command: null,
      rest: [],
    };
  }

  const [command, ...rest] = argv;
  return {
    help: false,
    command,
    rest,
  };
}

function usage(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/tooling <check-style-boundary|claude-skill-sync|mock-ui-sync|page-debug|runtime-gate> [args]\n'
  );
}

async function main(argv = [], deps = {}) {
  const options = parseToolingCliArgs(argv);

  if (options.help) {
    usage(deps.writeStdout);
    return 0;
  }

  if (!TOOLING_COMMANDS.has(options.command)) {
    throw new Error(`Unknown tooling command: ${options.command}`);
  }

  if (options.command === 'check-style-boundary') {
    return (deps.runCheckStyleBoundaryImpl || runCheckStyleBoundary)(options.rest);
  }

  if (options.command === 'claude-skill-sync') {
    return (deps.runClaudeSkillSyncImpl || runClaudeSkillSync)(options.rest);
  }

  if (options.command === 'mock-ui-sync') {
    return (deps.runMockUiSyncImpl || runMockUiSync)(options.rest);
  }

  if (options.command === 'page-debug') {
    return (deps.runPageDebugImpl || runPageDebug)(options.rest);
  }

  return (deps.runRuntimeGateImpl || runRuntimeGate)(options.rest, deps);
}

module.exports = {
  buildRuntimeGateCommand,
  main,
  parseToolingCliArgs,
  runRuntimeGate,
};
