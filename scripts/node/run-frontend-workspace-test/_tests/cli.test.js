const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildWorkspaceTestCommand,
  main,
} = require('../../run-frontend-workspace-test.js');

test('buildWorkspaceTestCommand uses runtime-configured turbo concurrency', () => {
  assert.deepEqual(
    buildWorkspaceTestCommand({
      runtimeConfig: {
        frontend: {
          turboConcurrency: 2,
        },
      },
      passThroughArgs: ['--filter=@1flowbase/web'],
    }),
    {
      command: 'pnpm',
      args: [
        '--dir',
        'web',
        'exec',
        'turbo',
        'run',
        'test',
        '--concurrency=2',
        '--filter=@1flowbase/web',
      ],
      cwd: '.',
    }
  );
});

test('main spawns turbo wrapper command', () => {
  let captured = null;

  const status = main(['--filter=@1flowbase/web'], {
    repoRoot: '/repo-root',
    env: {},
    runtimeConfig: {
      frontend: {
        turboConcurrency: 1,
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
    'web',
    'exec',
    'turbo',
    'run',
    'test',
    '--concurrency=1',
    '--filter=@1flowbase/web',
  ]);
  assert.equal(captured.options.cwd, '/repo-root');
});

test('main strips leading passthrough separator before spawning turbo', () => {
  let captured = null;

  const status = main(['--', '--help'], {
    repoRoot: '/repo-root',
    env: {},
    runtimeConfig: {
      frontend: {
        turboConcurrency: 1,
      },
    },
    spawnSyncImpl(command, args) {
      captured = { command, args };
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(captured.args, [
    '--dir',
    'web',
    'exec',
    'turbo',
    'run',
    'test',
    '--concurrency=1',
    '--help',
  ]);
});

test('main prepends pnpm sibling node binary to PATH before spawning turbo', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-run-frontend-workspace-'));
  const binDir = path.join(tempDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'pnpm'), '', 'utf8');
  fs.writeFileSync(path.join(binDir, 'node'), '', 'utf8');
  fs.chmodSync(path.join(binDir, 'pnpm'), 0o755);
  fs.chmodSync(path.join(binDir, 'node'), 0o755);

  let captured = null;
  const status = main([], {
    repoRoot: '/repo-root',
    env: {
      PATH: binDir,
    },
    runtimeConfig: {
      frontend: {
        turboConcurrency: 1,
      },
    },
    spawnSyncImpl(command, args, options) {
      captured = { command, args, options };
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.equal(captured.options.env.PATH.split(path.delimiter)[0], binDir);
  assert.equal(captured.options.env.npm_execpath, path.join(binDir, 'pnpm'));
  assert.equal(captured.options.env.npm_node_execpath, path.join(binDir, 'node'));
  assert.equal(captured.options.env.NODE, path.join(binDir, 'node'));
});
