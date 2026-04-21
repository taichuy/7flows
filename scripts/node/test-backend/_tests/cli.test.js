const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildCommands, main } = require('../../test-backend.js');

test('buildCommands runs pure backend cargo test with bounded parallelism', () => {
  assert.deepEqual(buildCommands({ cargoParallelism: 4 }), [
    {
      label: 'cargo-test',
      command: 'cargo',
      args: ['test', '--workspace', '--jobs', '4', '--', '--test-threads=4'],
      cwd: 'api',
      env: {
        CARGO_BUILD_JOBS: '4',
        CARGO_INCREMENTAL: '0',
      },
    },
  ]);
});

test('main writes advisory warning output under tmp/test-governance', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-test-backend-'));
  const calls = [];

  const status = main([], {
    repoRoot,
    cargoParallelism: 1,
    env: {},
    writeStdout() {},
    writeStderr() {},
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });

      return {
        status: 0,
        stdout: '',
        stderr: 'warning: cargo test advisory\n',
      };
    },
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['test', '--workspace', '--jobs', '1', '--', '--test-threads=1']);

  const warningLogPath = path.join(repoRoot, 'tmp', 'test-governance', 'test-backend.warnings.log');
  assert.equal(fs.existsSync(warningLogPath), true);
  assert.match(fs.readFileSync(warningLogPath, 'utf8'), /warning: cargo test advisory/u);
});
