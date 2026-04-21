#!/usr/bin/env node

const {
  getRepoRoot,
  runManagedCommandSequence,
} = require('./testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('./testing/verify-runtime.js');

const CONTRACT_TEST_FILES = [
  'src/features/settings/api/_tests/settings-api.test.ts',
  'src/features/settings/_tests/model-providers-page.test.tsx',
  'src/style-boundary/_tests/registry.test.tsx',
  'src/features/agent-flow/_tests/llm-model-provider-field.test.tsx',
];

function buildCommands({ repoRoot }) {
  return [
    {
      label: 'model-provider-contract-tests',
      command: 'pnpm',
      args: ['--dir', 'web/app', 'exec', 'vitest', 'run', ...CONTRACT_TEST_FILES],
      cwd: repoRoot,
    },
  ];
}

function usage(writeStdout = (text) => process.stdout.write(text)) {
  writeStdout(
    'Usage: node scripts/node/test-contracts.js\n'
      + 'Runs targeted model provider contract tests across shared consumers\n'
  );
}

async function main(argv = [], deps = {}) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage(deps.writeStdout);
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: 'test-contracts',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/test-contracts.js',
    runtimeConfig,
    commands: buildCommands({ repoRoot }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}

if (require.main === module) {
  Promise.resolve()
    .then(() => main(process.argv.slice(2)))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`[1flowbase-test-contracts] ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  CONTRACT_TEST_FILES,
  buildCommands,
  main,
};
