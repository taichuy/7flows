# Local Verify Lock And Resource Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为本地质量脚本增加“本地后端并发配置 + 全局重型验证锁 + 控制台 owner 可见性”，同时保持 `CI/CD` 继续使用仓库默认全功率行为。

**Architecture:** 新增 `scripts/node/testing/verify-runtime.js` 作为唯一的本地验证运行时真相源，负责读取 `.1flowbase.verify.local.json`、归一化后端并发配置、管理 `tmp/test-governance/locks/heavy-verify/owner.json`、处理 stale lock 和 token 重入。`scripts/node/testing/warning-capture.js` 在现有串行执行骨架之上新增 `runManagedCommandSequence`，统一把 runtime config、重型锁和子进程环境透传能力收口给 `verify-backend`、`verify-repo`、`verify-ci`、`verify-coverage`、`test-frontend full`、`test-contracts` 等入口复用。

**Tech Stack:** Node.js CLI, `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:os`, `node:crypto`, existing `scripts/node/testing/warning-capture.js`

**Source Spec:** [2026-04-21-local-verify-lock-and-resource-config-design.md](/home/taichu/git/1flowbase/docs/superpowers/specs/1flowbase/2026-04-21-local-verify-lock-and-resource-config-design.md)

**Execution Note:** 按用户当前偏好，计划执行时直接在当前仓库推进，不使用 `git worktree`。每完成一个任务都要同步更新本计划中的 checkbox 状态，并做独立 commit。

**Out Of Scope:** 前端 worker 本地调参、多把细粒度锁、浏览器态监控、系统资源采样、改变 `verify-repo`/`verify-ci` 的命令顺序

---

## File Structure

### Shared runtime and command orchestration

- Create: `scripts/node/testing/verify-runtime.js`
  - 唯一负责本地配置读取、默认值归一化、分钟到毫秒换算、重型锁获取与释放、stale lock 清理、token 重入。
- Create: `scripts/node/testing/_tests/verify-runtime.test.js`
  - 覆盖本地配置解析、`CI` 忽略策略、非法值失败、锁等待、stale lock、token 重入和 owner 释放边界。
- Create: `scripts/node/testing/_tests/warning-capture.test.js`
  - 覆盖 `runManagedCommandSequence` 在 `heavy` 与 `none` 两种 lock mode 下的行为差异，以及锁 token 注入子进程环境。
- Modify: `scripts/node/testing/warning-capture.js`
  - 在保留 `runCommandSequence` 的前提下，新增 runtime-aware wrapper，让各 CLI 不再各自手写锁逻辑。

### Backend consumers

- Modify: `scripts/node/verify-backend.js`
  - 将 `cargo --jobs` 与 `--test-threads` 分开读取 runtime config，并声明自己属于 `heavy` gate。
- Modify: `scripts/node/test-backend.js`
  - 与 `verify-backend` 使用同一套 runtime config 和 `heavy` gate。
- Modify: `scripts/node/verify-backend/_tests/cli.test.js`
  - 锁住 `cargoJobs` 与 `cargoTestThreads` 已解耦，且 `main()` 通过 managed runner 进入 `heavy` gate。
- Modify: `scripts/node/test-backend/_tests/cli.test.js`
  - 锁住 `test-backend` 读取 runtime config 后会把 `cargo --jobs` 和 `--test-threads` 按预期写入命令参数。

### Repository and coverage consumers

- Modify: `scripts/node/verify-repo.js`
  - 仓库级 full gate 外层进入 `heavy` gate，并向子进程透传 lock token。
- Modify: `scripts/node/verify-ci.js`
  - `verify-repo + verify-coverage all` 外层进入 `heavy` gate，并透传 lock token。
- Modify: `scripts/node/verify-coverage.js`
  - 覆盖率入口进入 `heavy` gate，并沿用本地后端并发配置。
- Modify: `scripts/node/test-frontend.js`
  - `full` 层进入 `heavy` gate，`fast` 层显式保持 `none`。
- Modify: `scripts/node/test-contracts.js`
  - contract gate 进入 `heavy` gate。
- Modify: `scripts/node/verify-repo/_tests/cli.test.js`
  - 锁住 `verify-repo` 对子脚本的顺序和 `ONEFLOWBASE_VERIFY_LOCK_TOKEN` 透传。
- Modify: `scripts/node/verify-ci/_tests/cli.test.js`
  - 锁住 `verify-ci` 对 `verify-repo` 和 `verify-coverage all` 的 token 透传。
- Modify: `scripts/node/verify-coverage/_tests/cli.test.js`
  - 锁住覆盖率 gate 会走 managed runner，并继续使用 runtime config 提供的后端并发。
- Modify: `scripts/node/test-frontend/_tests/cli.test.js`
  - 锁住 `full` 层走 `heavy`，`fast` 层不走锁。
- Modify: `scripts/node/test-contracts/_tests/cli.test.js`
  - 锁住 contract gate 走 `heavy`。

### Local config assets

- Create: `.1flowbase.verify.local.json.example`
  - 本地配置示例，只暴露 `backend.cargoJobs`、`backend.cargoTestThreads`、`locks.waitTimeoutMinutes`、`locks.pollIntervalMs`。
- Modify: `.gitignore`
  - 忽略 `.1flowbase.verify.local.json`

## Task 1: Create The Verify Runtime Helper And Config Parsing Tests

**Files:**
- Create: `scripts/node/testing/verify-runtime.js`
- Create: `scripts/node/testing/_tests/verify-runtime.test.js`

- [x] **Step 1: Write the failing config parsing tests**

Create `scripts/node/testing/_tests/verify-runtime.test.js` with focused config cases first:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LOCAL_VERIFY_CONFIG_FILE,
  loadVerifyRuntimeConfig,
} = require('../verify-runtime.js');

test('loadVerifyRuntimeConfig returns repo defaults when local config is absent', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-runtime-'));

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
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-runtime-'));

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

  assert.equal(config.backend.cargoJobs, 3);
  assert.equal(config.backend.cargoTestThreads, 2);
  assert.equal(config.locks.waitTimeoutMinutes, 12);
  assert.equal(config.locks.waitTimeoutMs, 12 * 60 * 1000);
  assert.equal(config.locks.pollIntervalMs, 1500);
});

test('loadVerifyRuntimeConfig ignores local file in CI environments', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-runtime-'));

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({ backend: { cargoJobs: 1, cargoTestThreads: 1 } }, null, 2)
  );

  const config = loadVerifyRuntimeConfig({
    repoRoot,
    env: { CI: 'true' },
    availableParallelism: 8,
  });

  assert.equal(config.backend.cargoJobs, 4);
  assert.equal(config.backend.cargoTestThreads, 4);
});

test('loadVerifyRuntimeConfig rejects invalid values instead of silently clamping', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-runtime-'));

  fs.writeFileSync(
    path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE),
    JSON.stringify({
      backend: { cargoJobs: 0, cargoTestThreads: 10 },
      locks: { waitTimeoutMinutes: -1, pollIntervalMs: 0 },
    }, null, 2)
  );

  assert.throws(
    () => loadVerifyRuntimeConfig({ repoRoot, env: {}, availableParallelism: 4 }),
    /must be a positive integer/u
  );
});
```

- [x] **Step 2: Run the new runtime tests and confirm the helper does not exist yet**

Run:

```bash
node --test scripts/node/testing/_tests/verify-runtime.test.js
```

Expected: FAIL with `Cannot find module '../verify-runtime.js'` or missing export assertions.

- [x] **Step 3: Implement config constants, defaults, and normalization**

Create `scripts/node/testing/verify-runtime.js` with the config API first, before any lock behavior:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LOCAL_VERIFY_CONFIG_FILE = '.1flowbase.verify.local.json';
const VERIFY_LOCK_TOKEN_ENV = 'ONEFLOWBASE_VERIFY_LOCK_TOKEN';
const DEFAULT_WAIT_TIMEOUT_MINUTES = 30;
const DEFAULT_POLL_INTERVAL_MS = 5000;

function getAvailableParallelism() {
  if (typeof os.availableParallelism === 'function') {
    return os.availableParallelism();
  }

  return os.cpus().length;
}

function isCiEnvironment(env = process.env) {
  return env.CI === 'true' || env.GITHUB_ACTIONS === 'true';
}

function readLocalVerifyConfig(repoRoot, env = process.env) {
  if (isCiEnvironment(env)) {
    return null;
  }

  const configPath = path.join(repoRoot, LOCAL_VERIFY_CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
}

function loadVerifyRuntimeConfig({
  repoRoot,
  env = process.env,
  availableParallelism = getAvailableParallelism(),
}) {
  const defaultCargoJobs = Math.max(1, Math.floor(availableParallelism / 2));
  const raw = readLocalVerifyConfig(repoRoot, env) ?? {};
  const cargoJobs = raw.backend?.cargoJobs ?? defaultCargoJobs;
  const cargoTestThreads = raw.backend?.cargoTestThreads ?? cargoJobs;
  const waitTimeoutMinutes = raw.locks?.waitTimeoutMinutes ?? DEFAULT_WAIT_TIMEOUT_MINUTES;
  const pollIntervalMs = raw.locks?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  assertPositiveInteger(cargoJobs, 'backend.cargoJobs');
  assertPositiveInteger(cargoTestThreads, 'backend.cargoTestThreads');
  assertPositiveInteger(waitTimeoutMinutes, 'locks.waitTimeoutMinutes');
  assertPositiveInteger(pollIntervalMs, 'locks.pollIntervalMs');

  if (cargoJobs > availableParallelism || cargoTestThreads > availableParallelism) {
    throw new Error('backend.cargoJobs and backend.cargoTestThreads must not exceed availableParallelism.');
  }

  return {
    backend: {
      cargoJobs,
      cargoTestThreads,
    },
    locks: {
      waitTimeoutMinutes,
      waitTimeoutMs: waitTimeoutMinutes * 60 * 1000,
      pollIntervalMs,
    },
  };
}

module.exports = {
  LOCAL_VERIFY_CONFIG_FILE,
  VERIFY_LOCK_TOKEN_ENV,
  loadVerifyRuntimeConfig,
  isCiEnvironment,
  getAvailableParallelism,
};
```

- [x] **Step 4: Run the runtime config tests again**

Run:

```bash
node --test scripts/node/testing/_tests/verify-runtime.test.js
```

Expected: PASS. Defaults resolve to half CPU, minute-based timeout is normalized to both `waitTimeoutMinutes` and internal `waitTimeoutMs`, and invalid values fail fast.

- [x] **Step 5: Commit the config helper foundation**

Run:

```bash
git add scripts/node/testing/verify-runtime.js scripts/node/testing/_tests/verify-runtime.test.js
git commit -m "feat: add local verify runtime config helper"
```

## Task 2: Add Heavy Verify Lock Acquisition, Waiting, And Reentrant Release

**Files:**
- Modify: `scripts/node/testing/verify-runtime.js`
- Modify: `scripts/node/testing/_tests/verify-runtime.test.js`

- [x] **Step 1: Extend the runtime tests with lock cases**

Append lock-focused tests to `scripts/node/testing/_tests/verify-runtime.test.js`:

```js
const {
  HEAVY_VERIFY_LOCK_DIR,
  acquireHeavyVerifyLock,
  withHeavyVerifyLock,
  readHeavyVerifyLockOwner,
} = require('../verify-runtime.js');

test('acquireHeavyVerifyLock creates owner.json with pid, scope, token and startedAt', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-lock-'));

  const lock = await acquireHeavyVerifyLock({
    repoRoot,
    env: {},
    scope: 'verify-backend',
    command: 'node scripts/node/verify-backend.js',
    writeStdout() {},
    now: () => new Date('2026-04-21T12:10:00.000Z'),
    hostname: 'devbox',
    processId: 321,
    sleepImpl: async () => {},
    isProcessAliveImpl: () => true,
  });

  const owner = readHeavyVerifyLockOwner({ repoRoot });

  assert.equal(owner.pid, 321);
  assert.equal(owner.scope, 'verify-backend');
  assert.equal(owner.command, 'node scripts/node/verify-backend.js');
  assert.equal(owner.hostname, 'devbox');
  assert.match(owner.token, /^[a-f0-9-]{36}$/u);

  lock.release();
  assert.equal(fs.existsSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR)), false);
});

test('acquireHeavyVerifyLock waits for a live owner and times out after configured minutes', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-lock-'));
  const output = [];
  const nowValues = [
    new Date('2026-04-21T12:00:00.000Z'),
    new Date('2026-04-21T12:00:30.000Z'),
    new Date('2026-04-21T12:01:01.000Z'),
  ];

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

  await assert.rejects(
    acquireHeavyVerifyLock({
      repoRoot,
      env: {},
      scope: 'verify-backend',
      command: 'node scripts/node/verify-backend.js',
      runtimeConfig: {
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

  assert.match(output.join(''), /busy: scope=verify-repo pid=999/u);
  assert.match(output.join(''), /waiting.../u);
});

test('acquireHeavyVerifyLock cleans a stale owner before retrying', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-lock-'));
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

  assert.match(output.join(''), /stale lock detected, cleaning/u);
  assert.equal(readHeavyVerifyLockOwner({ repoRoot }).pid, 777);
  lock.release();
});

test('acquireHeavyVerifyLock treats matching token as a reentrant owner', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-lock-'));
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

test('withHeavyVerifyLock releases the owner when cleanup signals fire', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-lock-'));
  const listeners = new Map();

  await withHeavyVerifyLock(
    {
      repoRoot,
      env: {},
      scope: 'verify-backend',
      command: 'node scripts/node/verify-backend.js',
      runtimeConfig: {
        backend: { cargoJobs: 1, cargoTestThreads: 1 },
        locks: { waitTimeoutMinutes: 1, waitTimeoutMs: 60_000, pollIntervalMs: 1000 },
      },
      processEmitter: {
        once(event, handler) {
          listeners.set(event, handler);
        },
        removeListener(event, handler) {
          if (listeners.get(event) === handler) {
            listeners.delete(event);
          }
        },
      },
      sleepImpl: async () => {},
      isProcessAliveImpl: () => true,
      processId: 888,
    },
    async () => {
      listeners.get('SIGINT')();
      assert.equal(fs.existsSync(path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR)), false);
      return 0;
    }
  );
});
```

- [x] **Step 2: Run only the lock-focused runtime cases**

Run:

```bash
node --test --test-name-pattern "HeavyVerifyLock|stale owner|reentrant owner|waits for a live owner" scripts/node/testing/_tests/verify-runtime.test.js
```

Expected: FAIL because `HEAVY_VERIFY_LOCK_DIR`, `acquireHeavyVerifyLock`, `withHeavyVerifyLock`, and `readHeavyVerifyLockOwner` do not exist yet.

- [x] **Step 3: Implement the heavy lock, owner record, and release semantics**

Extend `scripts/node/testing/verify-runtime.js` with lock ownership and reentrant wrapper support:

```js
const crypto = require('node:crypto');

const HEAVY_VERIFY_LOCK_DIR = path.join('tmp', 'test-governance', 'locks', 'heavy-verify');

function getHeavyVerifyLockPath(repoRoot) {
  return path.join(repoRoot, HEAVY_VERIFY_LOCK_DIR);
}

function readHeavyVerifyLockOwner({ repoRoot }) {
  const ownerPath = path.join(getHeavyVerifyLockPath(repoRoot), 'owner.json');

  if (!fs.existsSync(ownerPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function removeHeavyVerifyLock({ repoRoot, token }) {
  const owner = readHeavyVerifyLockOwner({ repoRoot });

  if (!owner || owner.token !== token) {
    return false;
  }

  fs.rmSync(getHeavyVerifyLockPath(repoRoot), { recursive: true, force: true });
  return true;
}

async function acquireHeavyVerifyLock({
  repoRoot,
  env = process.env,
  scope,
  command,
  runtimeConfig = loadVerifyRuntimeConfig({ repoRoot, env }),
  writeStdout = (text) => process.stdout.write(text),
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  isProcessAliveImpl = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') {
        return false;
      }
      throw error;
    }
  },
  now = () => new Date(),
  hostname = os.hostname(),
  processId = process.pid,
}) {
  const lockPath = getHeavyVerifyLockPath(repoRoot);
  const token = env[VERIFY_LOCK_TOKEN_ENV] || crypto.randomUUID();
  const startedAt = now().toISOString();
  const timeoutAt = now().getTime() + runtimeConfig.locks.waitTimeoutMs;

  while (true) {
    try {
      fs.mkdirSync(lockPath, { recursive: false });
      fs.writeFileSync(
        path.join(lockPath, 'owner.json'),
        JSON.stringify({
          token,
          pid: processId,
          scope,
          command,
          cwd: repoRoot,
          startedAt,
          hostname,
        }, null, 2)
      );

      writeStdout(`[1flowbase-verify-lock] acquired: scope=${scope} pid=${processId}\n`);

      return {
        token,
        reentrant: false,
        release() {
          if (removeHeavyVerifyLock({ repoRoot, token })) {
            writeStdout(`[1flowbase-verify-lock] released: scope=${scope} pid=${processId}\n`);
          }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }

    const owner = readHeavyVerifyLockOwner({ repoRoot });

    if (owner?.token === token) {
      return {
        token,
        reentrant: true,
        release() {},
      };
    }

    if (!owner || !isProcessAliveImpl(owner.pid)) {
      writeStdout('[1flowbase-verify-lock] stale lock detected, cleaning...\n');
      fs.rmSync(lockPath, { recursive: true, force: true });
      continue;
    }

    writeStdout(
      `[1flowbase-verify-lock] busy: scope=${owner.scope} pid=${owner.pid} startedAt=${owner.startedAt}\n`
    );

    if (now().getTime() > timeoutAt) {
      throw new Error('timeout waiting for heavy-verify lock');
    }

    writeStdout('[1flowbase-verify-lock] waiting...\n');
    await sleepImpl(runtimeConfig.locks.pollIntervalMs);
  }
}

async function withHeavyVerifyLock(options, run) {
  const lock = await acquireHeavyVerifyLock(options);
  const nextEnv = {
    ...(options.env ?? process.env),
    [VERIFY_LOCK_TOKEN_ENV]: lock.token,
  };
  const processEmitter = options.processEmitter ?? process;
  const cleanupEvents = ['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection'];
  const handlers = cleanupEvents.map((event) => {
    const handler = () => {
      lock.release();
    };
    processEmitter.once(event, handler);
    return [event, handler];
  });

  try {
    return await run(nextEnv);
  } finally {
    for (const [event, handler] of handlers) {
      processEmitter.removeListener(event, handler);
    }
    lock.release();
  }
}
```

- [x] **Step 4: Run the full runtime helper test file**

Run:

```bash
node --test scripts/node/testing/_tests/verify-runtime.test.js
```

Expected: PASS. Owner record is written under `tmp/test-governance/locks/heavy-verify`, stale owners are cleaned, matching tokens reenter without blocking, and timeout behavior is explicit.

- [x] **Step 5: Commit the heavy lock helper**

Run:

```bash
git add scripts/node/testing/verify-runtime.js scripts/node/testing/_tests/verify-runtime.test.js
git commit -m "feat: add heavy verify lock runtime"
```

## Task 3: Add A Managed Runner And Wire Backend Scripts To Runtime Config

**Files:**
- Create: `scripts/node/testing/_tests/warning-capture.test.js`
- Modify: `scripts/node/testing/warning-capture.js`
- Modify: `scripts/node/verify-backend.js`
- Modify: `scripts/node/test-backend.js`
- Modify: `scripts/node/verify-backend/_tests/cli.test.js`
- Modify: `scripts/node/test-backend/_tests/cli.test.js`

- [ ] **Step 1: Write the failing managed-runner and backend CLI tests**

Create `scripts/node/testing/_tests/warning-capture.test.js` and extend backend CLI tests:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { runManagedCommandSequence } = require('../warning-capture.js');

test('runManagedCommandSequence acquires heavy lock and injects token into child env', async () => {
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
  assert.equal(calls[0].env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
});

test('runManagedCommandSequence skips the lock wrapper when lockMode is none', async () => {
  let heavyLockCalls = 0;

  const status = await runManagedCommandSequence({
    repoRoot: '/repo-root',
    env: {},
    scope: 'test-frontend-fast',
    lockMode: 'none',
    commandDisplay: 'node scripts/node/test-frontend.js fast',
    commands: [{ label: 'frontend-fast-test', command: 'pnpm', args: ['test'] }],
    withHeavyVerifyLockImpl: async () => {
      heavyLockCalls += 1;
      return 0;
    },
    runCommandSequenceImpl: () => 0,
  });

  assert.equal(status, 0);
  assert.equal(heavyLockCalls, 0);
});
```

Update `scripts/node/verify-backend/_tests/cli.test.js` so `buildCommands()` no longer assumes jobs and test threads always match:

```js
test('buildCommands uses independent cargo jobs and cargo test threads', () => {
  assert.deepEqual(buildCommands({ cargoJobs: 4, cargoTestThreads: 2 }), [
    {
      label: 'cargo-fmt',
      command: 'cargo',
      args: ['fmt', '--all', '--check'],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4' },
    },
    {
      label: 'cargo-clippy',
      command: 'cargo',
      args: ['clippy', '--workspace', '--all-targets', '--jobs', '4', '--', '-D', 'warnings'],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4', CARGO_INCREMENTAL: '0' },
    },
    {
      label: 'cargo-test',
      command: 'cargo',
      args: ['test', '--workspace', '--jobs', '4', '--', '--test-threads=2'],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4', CARGO_INCREMENTAL: '0' },
    },
    {
      label: 'cargo-check',
      command: 'cargo',
      args: ['check', '--workspace', '--jobs', '4'],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4', CARGO_INCREMENTAL: '0' },
    },
  ]);
});
```

Update `scripts/node/test-backend/_tests/cli.test.js` similarly:

```js
test('buildCommands uses configured backend jobs and test threads', () => {
  assert.deepEqual(buildCommands({ cargoJobs: 3, cargoTestThreads: 1 }), [
    {
      label: 'cargo-test',
      command: 'cargo',
      args: ['test', '--workspace', '--jobs', '3', '--', '--test-threads=1'],
      cwd: 'api',
      env: {
        CARGO_BUILD_JOBS: '3',
        CARGO_INCREMENTAL: '0',
      },
    },
  ]);
});
```

- [ ] **Step 2: Run the managed-runner and backend CLI tests**

Run:

```bash
node --test \
  scripts/node/testing/_tests/warning-capture.test.js \
  scripts/node/verify-backend/_tests/cli.test.js \
  scripts/node/test-backend/_tests/cli.test.js
```

Expected: FAIL because `runManagedCommandSequence` does not exist and the backend `buildCommands()` signatures still assume one `cargoParallelism` value.

- [ ] **Step 3: Implement `runManagedCommandSequence` and update backend scripts**

Modify `scripts/node/testing/warning-capture.js` to wrap `runCommandSequence()`:

```js
const {
  loadVerifyRuntimeConfig,
  withHeavyVerifyLock,
} = require('./verify-runtime.js');

async function runManagedCommandSequence({
  repoRoot = getRepoRoot(),
  env = process.env,
  scope,
  commands,
  lockMode = 'none',
  commandDisplay,
  runtimeConfig = loadVerifyRuntimeConfig({ repoRoot, env }),
  withHeavyVerifyLockImpl = withHeavyVerifyLock,
  runCommandSequenceImpl = runCommandSequence,
  ...rest
}) {
  const execute = (managedEnv) => runCommandSequenceImpl({
    repoRoot,
    env: managedEnv,
    scope,
    commands,
    ...rest,
  });

  if (lockMode !== 'heavy') {
    return execute(env);
  }

  return withHeavyVerifyLockImpl(
    {
      repoRoot,
      env,
      scope,
      command: commandDisplay,
      runtimeConfig,
      writeStdout: rest.writeStdout,
    },
    execute
  );
}
```

Update `scripts/node/verify-backend.js`:

```js
const {
  buildCargoCommandEnv,
  getRepoRoot,
  runManagedCommandSequence,
} = require('./testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('./testing/verify-runtime.js');

function buildCommands({ cargoJobs, cargoTestThreads }) {
  return [
    {
      label: 'cargo-fmt',
      command: 'cargo',
      args: ['fmt', '--all', '--check'],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs }),
    },
    {
      label: 'cargo-clippy',
      command: 'cargo',
      args: ['clippy', '--workspace', '--all-targets', '--jobs', String(cargoJobs), '--', '-D', 'warnings'],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs, disableIncremental: true }),
    },
    {
      label: 'cargo-test',
      command: 'cargo',
      args: ['test', '--workspace', '--jobs', String(cargoJobs), '--', `--test-threads=${cargoTestThreads}`],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs, disableIncremental: true }),
    },
    {
      label: 'cargo-check',
      command: 'cargo',
      args: ['check', '--workspace', '--jobs', String(cargoJobs)],
      cwd: 'api',
      env: buildCargoCommandEnv({ cargoParallelism: cargoJobs, disableIncremental: true }),
    },
  ];
}

async function main(argv = [], deps = {}) {
  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });

  return runManagedCommandSequence({
    repoRoot,
    env,
    scope: 'verify-backend',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-backend.js',
    runtimeConfig,
    commands: buildCommands({
      cargoJobs: runtimeConfig.backend.cargoJobs,
      cargoTestThreads: runtimeConfig.backend.cargoTestThreads,
    }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}
```

Apply the same pattern to `scripts/node/test-backend.js`, using `scope: 'test-backend'`.

- [ ] **Step 4: Run the backend and managed-runner tests again**

Run:

```bash
node --test \
  scripts/node/testing/_tests/warning-capture.test.js \
  scripts/node/verify-backend/_tests/cli.test.js \
  scripts/node/test-backend/_tests/cli.test.js
```

Expected: PASS. `runManagedCommandSequence()` only acquires the heavy lock when requested, and backend scripts now honor separate `cargoJobs` and `cargoTestThreads`.

- [ ] **Step 5: Commit the managed runner and backend integration**

Run:

```bash
git add \
  scripts/node/testing/warning-capture.js \
  scripts/node/testing/_tests/warning-capture.test.js \
  scripts/node/verify-backend.js \
  scripts/node/test-backend.js \
  scripts/node/verify-backend/_tests/cli.test.js \
  scripts/node/test-backend/_tests/cli.test.js
git commit -m "feat: wire backend verify scripts to managed runtime"
```

## Task 4: Wire Repository, Coverage, Frontend Full, And Contract Gates To The Heavy Lock

**Files:**
- Modify: `scripts/node/verify-repo.js`
- Modify: `scripts/node/verify-ci.js`
- Modify: `scripts/node/verify-coverage.js`
- Modify: `scripts/node/test-frontend.js`
- Modify: `scripts/node/test-contracts.js`
- Modify: `scripts/node/verify-repo/_tests/cli.test.js`
- Modify: `scripts/node/verify-ci/_tests/cli.test.js`
- Modify: `scripts/node/verify-coverage/_tests/cli.test.js`
- Modify: `scripts/node/test-frontend/_tests/cli.test.js`
- Modify: `scripts/node/test-contracts/_tests/cli.test.js`

- [ ] **Step 1: Write the failing orchestration and token-propagation tests**

Update `scripts/node/verify-repo/_tests/cli.test.js`:

```js
test('main passes the inherited lock token through every repository gate command', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-repo-'));
  const calls = [];

  const status = await main([], {
    repoRoot,
    env: { ONEFLOWBASE_VERIFY_LOCK_TOKEN: 'chain-token' },
    writeStdout() {},
    writeStderr() {},
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(status, 0);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].options.env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
  assert.equal(calls[1].options.env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
  assert.equal(calls[2].options.env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
  assert.equal(calls[3].options.env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
});
```

Update `scripts/node/verify-ci/_tests/cli.test.js`:

```js
test('main passes the inherited lock token to verify-repo and verify-coverage', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-verify-ci-'));
  const calls = [];

  const status = await main([], {
    repoRoot,
    env: { ONEFLOWBASE_VERIFY_LOCK_TOKEN: 'chain-token' },
    writeStdout() {},
    writeStderr() {},
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(status, 0);
  assert.equal(calls[0].options.env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
  assert.equal(calls[1].options.env.ONEFLOWBASE_VERIFY_LOCK_TOKEN, 'chain-token');
});
```

Update `scripts/node/test-frontend/_tests/cli.test.js`:

```js
test('main marks full frontend gate as heavy lock mode', async () => {
  let capturedLockMode = null;

  const status = await main(['full'], {
    repoRoot: '/repo-root',
    env: {},
    managedRunnerImpl(options) {
      capturedLockMode = options.lockMode;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.equal(capturedLockMode, 'heavy');
});

test('main keeps fast frontend gate outside heavy lock mode', async () => {
  let capturedLockMode = null;

  const status = await main(['fast'], {
    repoRoot: '/repo-root',
    env: {},
    managedRunnerImpl(options) {
      capturedLockMode = options.lockMode;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.equal(capturedLockMode, 'none');
});
```

Update `scripts/node/test-contracts/_tests/cli.test.js`:

```js
test('main routes contract gate through the heavy lock', async () => {
  let capturedLockMode = null;

  const status = await main([], {
    repoRoot: '/repo-root',
    env: {},
    managedRunnerImpl(options) {
      capturedLockMode = options.lockMode;
      return 0;
    },
  });

  assert.equal(status, 0);
  assert.equal(capturedLockMode, 'heavy');
});
```

Update `scripts/node/verify-coverage/_tests/cli.test.js`:

```js
test('main routes backend coverage through the heavy lock and uses configured backend jobs', async () => {
  let capturedOptions = null;

  const status = await main(['backend'], {
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
    preflightSpawnSyncImpl() {
      return { status: 0, stdout: '', stderr: '' };
    },
    managedRunnerImpl(options) {
      capturedOptions = options;
      return 0;
    },
    readFileSyncImpl() {
      return JSON.stringify({ data: [{ totals: { lines: { percent: 100 } } }] });
    },
  });

  assert.equal(status, 0);
  assert.equal(capturedOptions.lockMode, 'heavy');
  assert.match(capturedOptions.commands[1].args.join(' '), /--package control-plane/u);
  assert.equal(capturedOptions.commands[1].env.CARGO_BUILD_JOBS, '3');
});
```

- [ ] **Step 2: Run the orchestration CLI tests and confirm the new injection points are missing**

Run:

```bash
node --test \
  scripts/node/verify-repo/_tests/cli.test.js \
  scripts/node/verify-ci/_tests/cli.test.js \
  scripts/node/verify-coverage/_tests/cli.test.js \
  scripts/node/test-frontend/_tests/cli.test.js \
  scripts/node/test-contracts/_tests/cli.test.js
```

Expected: FAIL because these `main()` functions still call `runCommandSequence()` directly and do not accept `managedRunnerImpl` injection.

- [ ] **Step 3: Switch repository, coverage, frontend full, and contract gates to `runManagedCommandSequence()`**

Apply the managed runner consistently:

```js
const { getRepoRoot, runManagedCommandSequence } = require('./testing/warning-capture.js');
const { loadVerifyRuntimeConfig } = require('./testing/verify-runtime.js');

async function main(argv = [], deps = {}) {
  const repoRoot = deps.repoRoot || getRepoRoot();
  const env = deps.env || process.env;
  const runtimeConfig = deps.runtimeConfig || loadVerifyRuntimeConfig({ repoRoot, env });
  const managedRunner = deps.managedRunnerImpl || runManagedCommandSequence;

  return managedRunner({
    repoRoot,
    env,
    scope: 'verify-repo',
    lockMode: 'heavy',
    commandDisplay: 'node scripts/node/verify-repo.js',
    runtimeConfig,
    commands: buildCommands({ repoRoot }),
    spawnSyncImpl: deps.spawnSyncImpl,
    writeStdout: deps.writeStdout,
    writeStderr: deps.writeStderr,
  });
}
```

Use the same pattern for:

- `verify-ci.js`
  - `scope: 'verify-ci'`
  - `lockMode: 'heavy'`
- `verify-coverage.js`
  - `scope: 'verify-coverage'`
  - `lockMode: 'heavy'`
  - `buildBackendCommands({ repoRoot, cargoParallelism: runtimeConfig.backend.cargoJobs })`
- `test-contracts.js`
  - `scope: 'test-contracts'`
  - `lockMode: 'heavy'`
- `test-frontend.js`
  - `scope: test-frontend-${options.layer}`
  - `lockMode: options.layer === 'full' ? 'heavy' : 'none'`

Also update each `main()` to be `async`, and keep their `require.main === module` blocks compatible:

```js
if (require.main === module) {
  main(process.argv.slice(2))
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error) => {
      process.stderr.write(`[1flowbase-verify-ci] ${error.message}\n`);
      process.exitCode = 1;
    });
}
```

- [ ] **Step 4: Run the orchestration CLI tests again**

Run:

```bash
node --test \
  scripts/node/verify-repo/_tests/cli.test.js \
  scripts/node/verify-ci/_tests/cli.test.js \
  scripts/node/verify-coverage/_tests/cli.test.js \
  scripts/node/test-frontend/_tests/cli.test.js \
  scripts/node/test-contracts/_tests/cli.test.js
```

Expected: PASS. Repository and CI wrappers now preserve `ONEFLOWBASE_VERIFY_LOCK_TOKEN`, `verify-coverage` reads backend jobs from runtime config, and only `test-frontend full` enters heavy lock mode.

- [ ] **Step 5: Commit the heavy-gate consumer integration**

Run:

```bash
git add \
  scripts/node/verify-repo.js \
  scripts/node/verify-ci.js \
  scripts/node/verify-coverage.js \
  scripts/node/test-frontend.js \
  scripts/node/test-contracts.js \
  scripts/node/verify-repo/_tests/cli.test.js \
  scripts/node/verify-ci/_tests/cli.test.js \
  scripts/node/verify-coverage/_tests/cli.test.js \
  scripts/node/test-frontend/_tests/cli.test.js \
  scripts/node/test-contracts/_tests/cli.test.js
git commit -m "feat: gate heavy verify scripts with shared lock"
```

## Task 5: Add Local Config Assets And Run The Full Targeted Verification Set

**Files:**
- Create: `.1flowbase.verify.local.json.example`
- Modify: `.gitignore`

- [ ] **Step 1: Add the committed example config and ignore the real local file**

Create `.1flowbase.verify.local.json.example`:

```json
{
  "backend": {
    "cargoJobs": 4,
    "cargoTestThreads": 2
  },
  "locks": {
    "waitTimeoutMinutes": 30,
    "pollIntervalMs": 5000
  }
}
```

Update `.gitignore` with:

```gitignore
.1flowbase.verify.local.json
```

- [ ] **Step 2: Run the complete targeted Node verification set**

Run:

```bash
node --test \
  scripts/node/testing/_tests/verify-runtime.test.js \
  scripts/node/testing/_tests/warning-capture.test.js \
  scripts/node/verify-backend/_tests/cli.test.js \
  scripts/node/test-backend/_tests/cli.test.js \
  scripts/node/verify-repo/_tests/cli.test.js \
  scripts/node/verify-ci/_tests/cli.test.js \
  scripts/node/verify-coverage/_tests/cli.test.js \
  scripts/node/test-frontend/_tests/cli.test.js \
  scripts/node/test-contracts/_tests/cli.test.js
```

Expected: PASS. The runtime helper, managed runner, and all affected CLI wrappers should now be covered without needing to trigger real heavy verification workloads.

- [ ] **Step 3: Spot-check the user-facing lock messages with a short mocked run**

Run:

```bash
node -e "const { withHeavyVerifyLock } = require('./scripts/node/testing/verify-runtime.js'); withHeavyVerifyLock({ repoRoot: process.cwd(), env: {}, scope: 'verify-backend', command: 'node scripts/node/verify-backend.js', writeStdout: (text) => process.stdout.write(text), runtimeConfig: { backend: { cargoJobs: 1, cargoTestThreads: 1 }, locks: { waitTimeoutMinutes: 1, waitTimeoutMs: 60000, pollIntervalMs: 1000 } } }, async () => 0).then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });"
```

Expected: PASS and print at least one stable line beginning with `[1flowbase-verify-lock] acquired:` followed by `[1flowbase-verify-lock] released:`.

- [ ] **Step 4: Commit the config assets and verification-complete state**

Run:

```bash
git add .gitignore .1flowbase.verify.local.json.example
git commit -m "chore: add local verify config example"
```

- [ ] **Step 5: Update this plan file to mark completed tasks**

Before closing execution, update this file so every completed step flips from `- [ ]` to `- [x]`.

Commit the plan status update:

```bash
git add docs/superpowers/plans/2026-04-21-local-verify-lock-and-resource-config.md
git commit -m "docs: update local verify lock plan progress"
```

## Self-Review Checklist

- [ ] Plan covers spec requirements for:
  - local config path and `.json.example`
  - `CI/GITHUB_ACTIONS` ignoring local config
  - `waitTimeoutMinutes` input with internal millisecond conversion
  - `tmp/test-governance/locks/heavy-verify/owner.json`
  - `pid / scope / command / startedAt / hostname / token`
  - stale lock cleanup
  - `SIGINT` / `SIGTERM` / `uncaughtException` / `unhandledRejection` cleanup release
  - token reentrancy for `verify-ci -> verify-repo -> verify-backend`
  - heavy lock coverage for `verify-backend` / `test-backend` / `verify-repo` / `verify-ci` / `verify-coverage` / `test-frontend full` / `test-contracts`
  - `test-frontend fast` staying outside the lock
- [ ] Placeholder scan passes: no `TODO`, `TBD`, “implement later”, or vague “add validation” steps remain.
- [ ] Function and constant names remain consistent across tasks:
  - `loadVerifyRuntimeConfig`
  - `acquireHeavyVerifyLock`
  - `withHeavyVerifyLock`
  - `runManagedCommandSequence`
  - `VERIFY_LOCK_TOKEN_ENV`
  - `HEAVY_VERIFY_LOCK_DIR`
