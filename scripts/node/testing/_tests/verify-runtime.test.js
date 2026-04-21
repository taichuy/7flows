const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LOCAL_VERIFY_CONFIG_FILE,
  loadVerifyRuntimeConfig,
} = require('../verify-runtime.js');

function createRepoRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-runtime-'));
}

test('loadVerifyRuntimeConfig returns defaults when local config is absent', () => {
  const repoRoot = createRepoRoot();

  const config = loadVerifyRuntimeConfig({
    repoRoot,
    env: {},
    availableParallelism: 8,
  });

  assert.deepEqual(config, {
    backend: {
      cargoJobs: 4,
      cargoTestThreads: 4,
    },
    locks: {
      waitTimeoutMinutes: 30,
      waitTimeoutMs: 30 * 60 * 1000,
      pollIntervalMs: 5000,
    },
  });
});

test('loadVerifyRuntimeConfig applies local overrides when config file exists', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
        cargoJobs: 3,
        cargoTestThreads: 2,
      },
      locks: {
        waitTimeoutMinutes: 12,
        pollIntervalMs: 1500,
      },
    }, null, 2)
  );

  const config = loadVerifyRuntimeConfig({
    repoRoot,
    env: {},
    availableParallelism: 8,
  });

  assert.deepEqual(config, {
    backend: {
      cargoJobs: 3,
      cargoTestThreads: 2,
    },
    locks: {
      waitTimeoutMinutes: 12,
      waitTimeoutMs: 12 * 60 * 1000,
      pollIntervalMs: 1500,
    },
  });
});

test('loadVerifyRuntimeConfig ignores local config in CI environments', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
        cargoJobs: 1,
        cargoTestThreads: 1,
      },
      locks: {
        waitTimeoutMinutes: 1,
        pollIntervalMs: 1,
      },
    }, null, 2)
  );

  const config = loadVerifyRuntimeConfig({
    repoRoot,
    env: { CI: 'true' },
    availableParallelism: 8,
  });

  assert.deepEqual(config, {
    backend: {
      cargoJobs: 4,
      cargoTestThreads: 4,
    },
    locks: {
      waitTimeoutMinutes: 30,
      waitTimeoutMs: 30 * 60 * 1000,
      pollIntervalMs: 5000,
    },
  });
});

test('loadVerifyRuntimeConfig rejects invalid values', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
        cargoJobs: 0,
        cargoTestThreads: 10,
      },
      locks: {
        waitTimeoutMinutes: -1,
        pollIntervalMs: 0,
      },
    }, null, 2)
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /must be a positive integer/i
  );
});

test('loadVerifyRuntimeConfig rejects non-object root config values', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    'null'
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /verify runtime config root must be a plain object/
  );
});

test('loadVerifyRuntimeConfig rejects array root config values', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    '[]'
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /verify runtime config root must be a plain object/
  );
});

test('loadVerifyRuntimeConfig rejects non-object backend config values', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: [],
    }, null, 2)
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /backend must be a plain object/
  );
});

test('loadVerifyRuntimeConfig rejects non-object locks config values', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      locks: [],
    }, null, 2)
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /locks must be a plain object/
  );
});

test('loadVerifyRuntimeConfig rejects backend values that exceed available parallelism', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
        cargoJobs: 5,
        cargoTestThreads: 5,
      },
    }, null, 2)
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /must not exceed availableParallelism/
  );
});

test('loadVerifyRuntimeConfig rejects invalid JSON', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    '{ not valid json'
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /Unexpected token|JSON/i
  );
});
