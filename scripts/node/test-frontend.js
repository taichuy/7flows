#!/usr/bin/env node

const path = require('node:path');

const {
  getRepoRoot,
  runManagedCommandSequence,
} = require('./testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('./testing/verify-runtime.js');

const LAYERS = new Set(['fast', 'full']);

function parseCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    return {
      help: true,
      layer: 'full',
    };
  }

  const [layer = 'full'] = argv;

  if (!LAYERS.has(layer)) {
    throw new Error(`Unknown frontend test layer: ${layer}`);
  }

  return {
    help: false,
    layer,
  };
}

function buildCommands({ layer, repoRoot }) {
  if (layer === 'fast') {
    return [
      {
        label: 'frontend-fast-test',
        command: 'pnpm',
        args: ['--dir', 'web/app', 'test'],
        cwd: '.',
      },
    ];
  }

  return [
    {
      label: 'frontend-lint',
      command: 'pnpm',
      args: ['--dir', 'web', 'lint'],
      cwd: '.',
    },
    {
      label: 'frontend-test',
      command: 'pnpm',
      args: ['--dir', 'web', 'test'],
      cwd: '.',
    },
    {
      label: 'frontend-build',
      command: 'pnpm',
      args: ['--dir', 'web/app', 'build'],
      cwd: '.',
    },
    {
      label: 'frontend-style-boundary',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'check-style-boundary.js'), 'all-pages'],
      cwd: repoRoot,
    },
  ];
}

function usage() {
  process.stdout.write(`Usage: node scripts/node/test-frontend.js [fast|full]\n`);
}

async function main(argv = [], deps = {}) {
  const options = parseCliArgs(argv);

  if (options.help) {
    usage();
    return 0;
  }

  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: `test-frontend-${options.layer}`,
    lockMode: options.layer === 'full' ? 'heavy' : 'none',
    commandDisplay: `node scripts/node/test-frontend.js ${options.layer}`.trim(),
    runtimeConfig,
    commands: buildCommands({
      layer: options.layer,
      repoRoot,
    }),
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
      process.stderr.write(`[1flowbase-test-frontend] ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseCliArgs,
  buildCommands,
  main,
};
