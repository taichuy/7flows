const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCliArgs, buildVitestCommand, main } = require('../../run-frontend-vitest.js');

test('parseCliArgs defaults to run mode', () => {
  assert.deepEqual(parseCliArgs([]), {
    mode: 'run',
    passThroughArgs: [],
  });
});

test('parseCliArgs strips leading passthrough separator', () => {
  assert.deepEqual(parseCliArgs(['run', '--', '--help']), {
    mode: 'run',
    passThroughArgs: ['--help'],
  });
});

test('buildVitestCommand uses runtime-configured worker limits', () => {
  assert.deepEqual(
    buildVitestCommand({
      mode: 'run',
      runtimeConfig: {
        frontend: {
          vitestMaxWorkers: 2,
          vitestMinWorkers: 1,
        },
      },
      passThroughArgs: ['src/example.test.ts'],
    }),
    {
      command: 'pnpm',
      args: [
        '--dir',
        'web/app',
        'exec',
        'vitest',
        'run',
        '--maxWorkers=2',
        '--minWorkers=1',
        'src/example.test.ts',
      ],
      cwd: '.',
    }
  );
});

test('buildVitestCommand adds coverage flag in coverage mode', () => {
  assert.deepEqual(
    buildVitestCommand({
      mode: 'coverage',
      runtimeConfig: {
        frontend: {
          vitestMaxWorkers: 1,
          vitestMinWorkers: 1,
        },
      },
      passThroughArgs: [],
    }).args,
    [
      '--dir',
      'web/app',
      'exec',
      'vitest',
      'run',
      '--coverage',
      '--maxWorkers=1',
      '--minWorkers=1',
    ]
  );
});

test('main loads runtime config and spawns vitest wrapper command', () => {
  let captured = null;

  const status = main(['run', 'src/example.test.ts'], {
    repoRoot: '/repo-root',
    env: {},
    runtimeConfig: {
      frontend: {
        vitestMaxWorkers: 3,
        vitestMinWorkers: 1,
      },
    },
    spawnSyncImpl(command, args, options) {
      captured = { command, args, options };
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.equal(captured.command, 'pnpm');
  assert.deepEqual(captured.args, [
    '--dir',
    'web/app',
    'exec',
    'vitest',
    'run',
    '--maxWorkers=3',
    '--minWorkers=1',
    'src/example.test.ts',
  ]);
  assert.equal(captured.options.cwd, '/repo-root');
});
