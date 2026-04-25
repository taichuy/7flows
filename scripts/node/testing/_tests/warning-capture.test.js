const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  runCommandSequence,
  runManagedCommandSequence,
} = require('../warning-capture.js');

test('runManagedCommandSequence injects the heavy lock token into child env', async () => {
  const calls = [];

  const status = await runManagedCommandSequence({
    repoRoot: '/repo-root',
    env: {},
    scope: 'verify-backend',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-backend.js',
    commands: [{ label: 'cargo-test', command: 'cargo', args: ['test'] }],
    withHeavyVerifyLockImpl: async (_options, run) => run({
      ONEFLOWBASE_VERIFY_LOCK_TOKEN: 'chain-token',
    }),
    runCommandSequenceImpl: (options) => {
      calls.push(options);
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
});

test('runManagedCommandSequence skips the heavy lock wrapper in none mode', async () => {
  let heavyLockCalls = 0;

  const status = await runManagedCommandSequence({
    repoRoot: '/repo-root',
    env: {},
    scope: 'test-backend',
    lockMode: 'none',
    commandDisplay: 'node scripts/node/test-backend.js',
    commands: [{ label: 'cargo-test', command: 'cargo', args: ['test'] }],
    withHeavyVerifyLockImpl: async () => {
      heavyLockCalls += 1;
      return 0;
    },
    runCommandSequenceImpl: () => 0,
  });

  assert.equal(status, 0);
  assert.equal(heavyLockCalls, 0);
});

test('runCommandSequence handles large stdout without hitting the default spawnSync buffer limit', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-warning-capture-'));
  const scriptPath = path.join(repoRoot, 'emit-large-output.js');

  fs.writeFileSync(
    scriptPath,
    'process.stdout.write("x".repeat(2 * 1024 * 1024));\n'
  );

  const status = runCommandSequence({
    repoRoot,
    scope: 'warning-capture-large-output',
    commands: [
      {
        label: 'large-output',
        command: process.execPath,
        args: [scriptPath],
      },
    ],
    spawnSyncImpl: spawnSync,
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status, 0);
});

test('runCommandSequence does not create a warning log for stdout-only success output', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-warning-capture-'));
  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'stdout-only.warnings.log');

  const status = runCommandSequence({
    repoRoot,
    scope: 'stdout-only',
    commands: [
      {
        label: 'stdout-only',
        command: process.execPath,
        args: ['-e', 'process.stdout.write("all good\\n")'],
      },
    ],
    spawnSyncImpl: spawnSync,
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status, 0);
  assert.equal(fs.existsSync(warningLogPath), false);
});

test('runCommandSequence injects the pnpm-adjacent real node env for pnpm commands', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-pnpm-node-env-'));
  const binDir = path.join(tempDir, 'bin');
  const calls = [];

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'pnpm'), '', 'utf8');
  fs.writeFileSync(path.join(binDir, 'node'), '', 'utf8');

  const status = runCommandSequence({
    repoRoot: '/repo-root',
    scope: 'pnpm-node-env',
    env: {
      PATH: ['/tmp/bun-node-wrapper', binDir].join(path.delimiter),
    },
    commands: [
      {
        label: 'pnpm-test',
        command: 'pnpm',
        args: ['--version'],
      },
    ],
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: '', stderr: '' };
    },
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'pnpm');
  assert.equal(calls[0].options.env.NODE, path.join(binDir, 'node'));
  assert.equal(
    calls[0].options.env.npm_node_execpath,
    path.join(binDir, 'node')
  );
  assert.match(
    calls[0].options.env.PATH,
    new RegExp(`^${binDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  );
});

test('runCommandSequence resets the warning log before a new run', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-warning-capture-'));
  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'reset.warnings.log');

  const firstStatus = runCommandSequence({
    repoRoot,
    scope: 'reset',
    commands: [
      {
        label: 'first-run',
        command: process.execPath,
        args: ['-e', 'require("node:fs").writeSync(2, "warning: first run\\n")'],
      },
    ],
    spawnSyncImpl: spawnSync,
    writeStdout() {},
    writeStderr() {},
  });

  const firstLog = fs.readFileSync(warningLogPath, 'utf8');
  assert.equal(firstStatus, 0);
  assert.match(firstLog, /warning: first run/u);

  const secondStatus = runCommandSequence({
    repoRoot,
    scope: 'reset',
    commands: [
      {
        label: 'second-run',
        command: process.execPath,
        args: ['-e', 'require("node:fs").writeSync(2, "warning: second run\\n")'],
      },
    ],
    spawnSyncImpl: spawnSync,
    writeStdout() {},
    writeStderr() {},
  });

  const secondLog = fs.readFileSync(warningLogPath, 'utf8');
  assert.equal(secondStatus, 0);
  assert.doesNotMatch(secondLog, /warning: first run/u);
  assert.match(secondLog, /warning: second run/u);
});

test('runCommandSequence removes stale warning logs before a clean run', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-warning-capture-'));
  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'warning-clean.warnings.log');

  const firstStatus = runCommandSequence({
    repoRoot,
    scope: 'warning-clean',
    commands: [
      {
        label: 'warning-run',
        command: process.execPath,
        args: ['-e', 'require("node:fs").writeSync(2, "warning: stale artifact\\n")'],
      },
    ],
    spawnSyncImpl: spawnSync,
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(firstStatus, 0);
  assert.equal(fs.existsSync(warningLogPath), true);

  const secondStatus = runCommandSequence({
    repoRoot,
    scope: 'warning-clean',
    commands: [
      {
        label: 'clean-run',
        command: process.execPath,
        args: ['-e', 'process.stdout.write("clean run\\n")'],
      },
    ],
    spawnSyncImpl: spawnSync,
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(secondStatus, 0);
  assert.equal(fs.existsSync(warningLogPath), false);
});
