const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildCommands, main } = require('../../verify-backend.js');

function getExpectedParallelism() {
  const available = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;

  return Math.max(1, Math.floor(available / 2));
}

test('buildCommands uses independent cargo jobs and cargo test threads', () => {
  assert.deepEqual(buildCommands({ cargoJobs: 4, cargoTestThreads: 2 }), [
    {
      label: 'cargo-fmt',
      command: 'cargo',
      args: ['fmt', '--all', '--check'],
      cwd: 'api',
      env: {
        CARGO_BUILD_JOBS: '4',
      },
    },
    {
      label: 'cargo-clippy',
      command: 'cargo',
      args: ['clippy', '--workspace', '--all-targets', '--jobs', '4', '--', '-D', 'warnings'],
      cwd: 'api',
      env: {
        CARGO_BUILD_JOBS: '4',
        CARGO_INCREMENTAL: '0',
      },
    },
    {
      label: 'cargo-test',
      command: 'cargo',
      args: ['test', '--workspace', '--jobs', '4', '--', '--test-threads=2'],
      cwd: 'api',
      env: {
        CARGO_BUILD_JOBS: '4',
        CARGO_INCREMENTAL: '0',
      },
    },
    {
      label: 'cargo-check',
      command: 'cargo',
      args: ['check', '--workspace', '--jobs', '4'],
      cwd: 'api',
      env: {
        CARGO_BUILD_JOBS: '4',
        CARGO_INCREMENTAL: '0',
      },
    },
  ]);
});

test('main routes backend verification through the heavy managed gate', async () => {
  let capturedOptions = null;

  const status = await main([], {
    repoRoot: '/repo-root',
    env: {},
    runtimeConfig: {
      backend: {
        cargoJobs: 3,
        cargoTestThreads: 1,
      },
      locks: {
        waitTimeoutMinutes: 30,
        waitTimeoutMs: 30 * 60 * 1000,
        pollIntervalMs: 5000,
      },
    },
    writeStdout() {},
    writeStderr() {},
    managedRunnerImpl(options) {
      capturedOptions = options;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.equal(capturedOptions.lockMode, 'heavy');
  assert.equal(capturedOptions.scope, 'verify-backend');
  assert.equal(capturedOptions.commandDisplay, 'node scripts/node/verify-backend.js');
  assert.deepEqual(capturedOptions.commands, buildCommands({ cargoJobs: 3, cargoTestThreads: 1 }));
});

test('verify-backend limits cargo jobs to half of available CPU and serializes tests', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-backend-'));
  const fakeBinDir = path.join(tempDir, 'bin');
  const logPath = path.join(tempDir, 'cargo.log');
  const warningOutputDir = path.join(tempDir, 'warnings');
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const scriptPath = path.join(repoRoot, 'scripts', 'node', 'verify-backend.js');
  const fakeCargoPath = path.join(fakeBinDir, 'cargo');
  const expectedParallelism = getExpectedParallelism();

  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.writeFileSync(
    fakeCargoPath,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$VERIFY_BACKEND_LOG"',
      'printf "warning: backend advisory\\n" >&2',
      'exit 0',
    ].join('\n')
  );
  fs.chmodSync(fakeCargoPath, 0o755);

  const result = spawnSync('node', [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CI: 'true',
      PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`,
      VERIFY_BACKEND_LOG: logPath,
      ONEFLOWBASE_WARNING_OUTPUT_DIR: warningOutputDir,
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);

  const invocations = fs
    .readFileSync(logPath, 'utf8')
    .trim()
    .split('\n');

  assert.equal(invocations.length, 4);
  assert.match(invocations[1], new RegExp(`clippy --workspace --all-targets --jobs ${expectedParallelism} -- -D warnings`));
  assert.match(invocations[2], new RegExp(`test --workspace --jobs ${expectedParallelism} -- --test-threads=1`));
  assert.match(invocations[3], new RegExp(`check --workspace --jobs ${expectedParallelism}`));

  const warningLogPath = path.join(warningOutputDir, 'verify-backend.warnings.log');
  assert.equal(fs.existsSync(warningLogPath), true);
  assert.match(fs.readFileSync(warningLogPath, 'utf8'), /warning: backend advisory/u);
});
