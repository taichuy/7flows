#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const { getRepoRoot } = require('./testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('./testing/verify-runtime.js');

const VALID_MODES = new Set(['run', 'coverage']);

function normalizePassThroughArgs(args) {
  if (args[0] === '--') {
    return args.slice(1);
  }

  return args;
}

function parseCliArgs(argv) {
  const [mode = 'run', ...passThroughArgs] = argv;

  if (!VALID_MODES.has(mode)) {
    throw new Error(`Unknown frontend vitest mode: ${mode}`);
  }

  return {
    mode,
    passThroughArgs: normalizePassThroughArgs(passThroughArgs),
  };
}

function buildVitestCommand({ mode, runtimeConfig, passThroughArgs = [] }) {
  const args = [
    '--dir',
    'web/app',
    'exec',
    'vitest',
    'run',
  ];

  if (mode === 'coverage') {
    args.push('--coverage');
  }

  args.push(
    `--maxWorkers=${runtimeConfig.frontend.vitestMaxWorkers}`,
    `--minWorkers=${runtimeConfig.frontend.vitestMinWorkers}`,
    ...passThroughArgs
  );

  return {
    command: 'pnpm',
    args,
    cwd: '.',
  };
}

function main(argv = [], deps = {}) {
  const options = parseCliArgs(argv);
  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const spawnSyncImpl = deps.spawnSyncImpl || spawnSync;

  const command = buildVitestCommand({
    mode: options.mode,
    runtimeConfig,
    passThroughArgs: options.passThroughArgs,
  });

  const result = spawnSyncImpl(command.command, command.args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[1flowbase-run-frontend-vitest] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseCliArgs,
  buildVitestCommand,
  main,
};
