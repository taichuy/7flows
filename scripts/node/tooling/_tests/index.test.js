const test = require('node:test');
const assert = require('node:assert/strict');

const { main } = require('../index.js');

test('tooling index dispatches runtime-gate subcommand', async () => {
  let capturedArgv = null;

  const status = await main(['runtime-gate', 'snapshot', '/settings'], {
    runRuntimeGateImpl(argv) {
      capturedArgv = argv;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(capturedArgv, ['snapshot', '/settings']);
});

test('tooling index dispatches check-style-boundary subcommand', async () => {
  let capturedArgv = null;

  const status = await main(['check-style-boundary', 'all-pages'], {
    runCheckStyleBoundaryImpl(argv) {
      capturedArgv = argv;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(capturedArgv, ['all-pages']);
});

test('tooling index dispatches check-rust-backend subcommand', async () => {
  let capturedArgv = null;

  const status = await main(['check-rust-backend'], {
    runCheckRustBackendImpl(argv) {
      capturedArgv = argv;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(capturedArgv, []);
});

test('tooling index dispatches hotspot-review subcommand', async () => {
  let capturedArgv = null;

  const status = await main(['hotspot-review', '--since', '1 day ago'], {
    runHotspotReviewImpl(argv) {
      capturedArgv = argv;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(capturedArgv, ['--since', '1 day ago']);
});

test('tooling index rejects unknown subcommands', async () => {
  await assert.rejects(
    () => main(['unknown']),
    /Unknown tooling command: unknown/u
  );
});
