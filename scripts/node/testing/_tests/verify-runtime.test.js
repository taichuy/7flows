const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  HEAVY_VERIFY_LOCK_DIR,
  LOCAL_VERIFY_CONFIG_FILE,
  acquireHeavyVerifyLock,
  isCiEnvironment,
  loadVerifyRuntimeConfig,
  readHeavyVerifyLockOwner,
  withHeavyVerifyLock,
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

test('loadVerifyRuntimeConfig merges backend and lock overrides field by field', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
        cargoJobs: 3,
      },
      locks: {
        waitTimeoutMinutes: 12,
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
      cargoTestThreads: 4,
    },
    locks: {
      waitTimeoutMinutes: 12,
      waitTimeoutMs: 12 * 60 * 1000,
      pollIntervalMs: 5000,
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

test('isCiEnvironment accepts common truthy CI variants', () => {
  const cases = [
    [{ CI: 'true' }, true],
    [{ CI: 'TRUE' }, true],
    [{ CI: '1' }, true],
    [{ GITHUB_ACTIONS: 'true' }, true],
    [{ GITHUB_ACTIONS: 'TRUE' }, true],
    [{ GITHUB_ACTIONS: '1' }, true],
    [{ CI: 'false', GITHUB_ACTIONS: 'true' }, true],
    [{ CI: '0', GITHUB_ACTIONS: '0' }, false],
    [{}, false],
  ];

  for (const [env, expected] of cases) {
    assert.equal(isCiEnvironment(env), expected);
  }
});

test('loadVerifyRuntimeConfig rejects invalid backend cargoJobs', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
        cargoJobs: 0,
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

test('loadVerifyRuntimeConfig rejects invalid backend cargoTestThreads', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
        cargoTestThreads: 0,
      },
    }, null, 2)
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /backend\.cargoTestThreads must be a positive integer/
  );
});

test('loadVerifyRuntimeConfig rejects invalid locks waitTimeoutMinutes', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      locks: {
        waitTimeoutMinutes: 0,
      },
    }, null, 2)
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot,
      env: {},
      availableParallelism: 4,
    }),
    /locks\.waitTimeoutMinutes must be a positive integer/
  );
});

test('loadVerifyRuntimeConfig rejects invalid locks pollIntervalMs', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      locks: {
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
    /locks\.pollIntervalMs must be a positive integer/
  );
});

test('loadVerifyRuntimeConfig rejects backend cargoTestThreads above available parallelism', () => {
  const repoRoot = createRepoRoot();

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: {
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
    /backend\.cargoTestThreads must not exceed availableParallelism/
  );
});

test('loadVerifyRuntimeConfig rejects missing repoRoot', () => {
  assert.throws(
    () => loadVerifyRuntimeConfig({
      env: {},
      availableParallelism: 4,
    }),
    /repoRoot must be a non-empty string/
  );
});

test('loadVerifyRuntimeConfig rejects empty repoRoot', () => {
  assert.throws(
    () => loadVerifyRuntimeConfig({
      repoRoot: '',
      env: {},
      availableParallelism: 4,
    }),
    /repoRoot must be a non-empty string/
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

test('acquireHeavyVerifyLock writes owner.json with the expected metadata', async () => {
  const repoRoot = createRepoRoot();
  const output = [];

  const lock = await acquireHeavyVerifyLock({
    repoRoot,
    env: {},
    scope: 'verify-backend',
    command: 'node scripts/node/verify-backend.js',
    now: () => new Date('2026-04-21T12:10:00.000Z'),
    hostname: 'devbox',
    processId: 321,
    sleepImpl: async () => {},
    isProcessAliveImpl: () => true,
    writeStdout: (text) => output.push(text),
  });

  const owner = readHeavyVerifyLockOwner({ repoRoot });

  assert.equal(owner.pid, 321);
  assert.equal(owner.scope, 'verify-backend');
  assert.equal(owner.command, 'node scripts/node/verify-backend.js');
  assert.equal(owner.cwd, repoRoot);
  assert.equal(owner.startedAt, '2026-04-21T12:10:00.000Z');
  assert.equal(owner.hostname, 'devbox');
  assert.equal(typeof owner.token, 'string');
  assert.equal(owner.token.length > 0, true);

  lock.release();
  assert.equal(fs.existsSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR)), false);
  assert.match(output.join(''), /\[1flowbase-verify-lock\] acquired: scope=verify-backend pid=321/u);
  assert.match(output.join(''), /\[1flowbase-verify-lock\] released: scope=verify-backend pid=321/u);
});

test('acquireHeavyVerifyLock waits for a live owner and times out', async () => {
  const repoRoot = createRepoRoot();
  const output = [];

  fs.mkdirSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR, 'owner.json'),
    JSON.stringify({
      token: 'existing-token',
      pid: 999,
      scope: 'verify-repo',
      command: 'node scripts/node/verify-repo.js',
      cwd: repoRoot,
      startedAt: '2026-04-21T12:00:00.000Z',
      hostname: 'devbox',
    }, null, 2)
  );

  const nowValues = [
    new Date('2026-04-21T12:00:00.000Z'),
    new Date('2026-04-21T12:00:30.000Z'),
    new Date('2026-04-21T12:01:01.000Z'),
  ];

  await assert.rejects(
    acquireHeavyVerifyLock({
      repoRoot,
      env: {},
      scope: 'verify-backend',
      command: 'node scripts/node/verify-backend.js',
      runtimeConfig: {
        backend: {
          cargoJobs: 1,
          cargoTestThreads: 1,
        },
        locks: {
          waitTimeoutMinutes: 1,
          waitTimeoutMs: 60_000,
          pollIntervalMs: 1000,
        },
      },
      writeStdout: (text) => output.push(text),
      now: () => nowValues.shift() ?? new Date('2026-04-21T12:01:01.000Z'),
      sleepImpl: async () => {},
      isProcessAliveImpl: () => true,
      processId: 654,
    }),
    /timeout waiting for heavy-verify lock/u
  );

  assert.match(output.join(''), /\[1flowbase-verify-lock\] busy: scope=verify-repo pid=999/u);
  assert.match(output.join(''), /\[1flowbase-verify-lock\] waiting.../u);
  assert.match(output.join(''), /\[1flowbase-verify-lock\] timeout waiting for heavy-verify lock:/u);
});

test('acquireHeavyVerifyLock cleans a stale owner before retrying', async () => {
  const repoRoot = createRepoRoot();
  const output = [];

  fs.mkdirSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR, 'owner.json'),
    JSON.stringify({
      token: 'stale-token',
      pid: 555,
      scope: 'verify-ci',
      command: 'node scripts/node/verify-ci.js',
      cwd: repoRoot,
      startedAt: '2026-04-21T11:00:00.000Z',
      hostname: 'devbox',
    }, null, 2)
  );

  const lock = await acquireHeavyVerifyLock({
    repoRoot,
    env: {},
    scope: 'verify-backend',
    command: 'node scripts/node/verify-backend.js',
    writeStdout: (text) => output.push(text),
    isProcessAliveImpl: () => false,
    sleepImpl: async () => {},
    processId: 777,
  });

  assert.match(output.join(''), /\[1flowbase-verify-lock\] stale lock detected, cleaning/u);
  assert.equal(readHeavyVerifyLockOwner({ repoRoot }).pid, 777);
  lock.release();
});

test('acquireHeavyVerifyLock cleans a damaged owner before retrying', async () => {
  const repoRoot = createRepoRoot();
  const output = [];

  fs.mkdirSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR, 'owner.json'), '{ not valid json');

  const lock = await acquireHeavyVerifyLock({
    repoRoot,
    env: {},
    scope: 'verify-backend',
    command: 'node scripts/node/verify-backend.js',
    writeStdout: (text) => output.push(text),
    isProcessAliveImpl: () => true,
    sleepImpl: async () => {},
    processId: 778,
  });

  assert.match(output.join(''), /\[1flowbase-verify-lock\] stale lock detected, cleaning/u);
  assert.equal(readHeavyVerifyLockOwner({ repoRoot }).pid, 778);
  lock.release();
});

test('acquireHeavyVerifyLock keeps a second owner from slipping through while owner.json is not yet written', async () => {
  const repoRoot = createRepoRoot();
  const firstGate = createDeferred();
  const releaseFirst = createDeferred();
  const secondOutput = [];

  const firstAcquirePromise = acquireHeavyVerifyLock({
    repoRoot,
    env: {},
    scope: 'verify-backend',
    command: 'node scripts/node/verify-backend.js',
    runtimeConfig: {
      backend: {
        cargoJobs: 1,
        cargoTestThreads: 1,
      },
      locks: {
        waitTimeoutMinutes: 1,
        waitTimeoutMs: 60_000,
        pollIntervalMs: 1000,
      },
    },
    beforeOwnerWriteImpl: async () => {
      firstGate.resolve();
      await releaseFirst.promise;
    },
    sleepImpl: async () => {},
    isProcessAliveImpl: () => true,
    processId: 901,
  });

  await firstGate.promise;

  const secondAcquirePromise = acquireHeavyVerifyLock({
    repoRoot,
    env: {},
    scope: 'verify-repo',
    command: 'node scripts/node/verify-repo.js',
    runtimeConfig: {
      backend: {
        cargoJobs: 1,
        cargoTestThreads: 1,
      },
      locks: {
        waitTimeoutMinutes: 1,
        waitTimeoutMs: 60_000,
        pollIntervalMs: 1000,
      },
    },
    writeStdout: (text) => secondOutput.push(text),
    sleepImpl: async () => {},
    isProcessAliveImpl: () => true,
    now: (() => {
      const values = [
        new Date('2026-04-21T12:00:00.000Z'),
        new Date('2026-04-21T12:00:30.000Z'),
        new Date('2026-04-21T12:01:01.000Z'),
      ];

      return () => values.shift() ?? new Date('2026-04-21T12:01:01.000Z');
    })(),
    processId: 902,
  });

  await assert.rejects(secondAcquirePromise, /timeout waiting for heavy-verify lock/u);

  assert.match(secondOutput.join(''), /\[1flowbase-verify-lock\] waiting for owner record\.\.\./u);
  assert.equal(readHeavyVerifyLockOwner({ repoRoot }), null);

  releaseFirst.resolve();
  const lock = await firstAcquirePromise;
  assert.equal(readHeavyVerifyLockOwner({ repoRoot }).pid, 901);
  lock.release();
});

test('acquireHeavyVerifyLock treats matching token as a reentrant owner', async () => {
  const repoRoot = createRepoRoot();
  const token = '11111111-2222-4333-8444-555555555555';

  fs.mkdirSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR, 'owner.json'),
    JSON.stringify({
      token,
      pid: 444,
      scope: 'verify-repo',
      command: 'node scripts/node/verify-repo.js',
      cwd: repoRoot,
      startedAt: '2026-04-21T12:00:00.000Z',
      hostname: 'devbox',
    }, null, 2)
  );

  const lock = await acquireHeavyVerifyLock({
    repoRoot,
    env: { ONEFLOWBASE_VERIFY_LOCK_TOKEN: token },
    scope: 'verify-backend',
    command: 'node scripts/node/verify-backend.js',
    processId: 444,
    sleepImpl: async () => {},
    isProcessAliveImpl: () => true,
  });

  assert.equal(lock.token, token);
  assert.equal(lock.reentrant, true);
});

test('withHeavyVerifyLock releases the lock when cleanup events fire', async () => {
  const cleanupEvents = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'];

  for (const eventName of cleanupEvents) {
    const repoRoot = createRepoRoot();
    const listeners = new Map();
    const output = [];

    await withHeavyVerifyLock(
      {
        repoRoot,
        env: {},
        scope: 'verify-backend',
        command: 'node scripts/node/verify-backend.js',
        runtimeConfig: {
          backend: {
            cargoJobs: 1,
            cargoTestThreads: 1,
          },
          locks: {
            waitTimeoutMinutes: 1,
            waitTimeoutMs: 60_000,
            pollIntervalMs: 1000,
          },
        },
        writeStdout: (text) => output.push(text),
        processEmitter: {
          once(name, handler) {
            listeners.set(name, handler);
          },
          removeListener(name, handler) {
            if (listeners.get(name) === handler) {
              listeners.delete(name);
            }
          },
        },
        sleepImpl: async () => {},
        isProcessAliveImpl: () => true,
        processId: 888,
      },
      async () => {
        for (const name of cleanupEvents) {
          assert.equal(typeof listeners.get(name), 'function');
        }

        listeners.get(eventName)();
        assert.equal(fs.existsSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR)), false);
        assert.match(output.join(''), /\[1flowbase-verify-lock\] released: scope=verify-backend pid=888/u);
        return 0;
      }
    );
  }
});

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
