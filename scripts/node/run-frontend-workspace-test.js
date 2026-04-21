#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const { getRepoRoot } = require('./testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('./testing/verify-runtime.js');

function normalizePassThroughArgs(args) {
  if (args[0] === '--') {
    return args.slice(1);
  }

  return args;
}

function buildWorkspaceTestCommand({ runtimeConfig, passThroughArgs = [] }) {
  return {
    command: 'pnpm',
    args: [
      '--dir',
      'web',
      'exec',
      'turbo',
      'run',
      'test',
      `--concurrency=${runtimeConfig.frontend.turboConcurrency}`,
      ...passThroughArgs,
    ],
    cwd: '.',
  };
}

function main(argv = [], deps = {}) {
  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const spawnSyncImpl = deps.spawnSyncImpl || spawnSync;

  const command = buildWorkspaceTestCommand({
    runtimeConfig,
    passThroughArgs: normalizePassThroughArgs(argv),
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
    process.stderr.write(`[1flowbase-run-frontend-workspace-test] ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildWorkspaceTestCommand,
  main,
};
