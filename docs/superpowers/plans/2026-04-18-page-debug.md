# Page Debug Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 1Flowbase 增加一个 `scripts/node/page-debug.js`，让开发者或 AI 只给一个前端路由就能自动拿 root 登录态、打开受保护页面、等待到可比较的稳定态，并输出 `html/css/js` 快照、`storage-state.json`、页面截图和结构化控制台日志。

**Architecture:** 保持 `scripts/node/*` 现有的 `cli wrapper + directory core modules + node:test` 风格，不把所有 Playwright、认证、页面等待、证据采集和快照重写逻辑堆进单个 God file。认证态通过 Playwright `request.newContext()` 调用现有密码登录接口并导出 `storageState`，运行态再由浏览器 context 复用该状态；`core.js` 只负责 CLI 协调和结构化 JSON 输出，`auth / readiness / evidence / snapshot` 各自收口单一职责。

**Tech Stack:** Node.js 22 CommonJS, Playwright (`web/package.json`), Node `fs/path`, `node:test`, `node:assert/strict`

**Source Spec:** `docs/superpowers/specs/1flowbase/2026-04-18-page-debug-design.md`

**Execution Note:** 我正在使用 writing-plans skill 创建实现计划。本仓库执行实现计划时不使用 `git worktree`；直接在当前工作区按任务提交推进。实现阶段按 TDD 走：先写 `node:test` 失败用例，再写最小实现，再跑目标测试和手工验证命令。

**Out Of Scope:** 本计划不做图片/字体本地化、不做多页面递归抓取、不做独立 storage state-only 子命令、不做登录页 UI 自动化登录，也不做 API mock / 网络录制回放。

---

## File Structure

### CLI and orchestration boundary

- Create: `scripts/node/page-debug.js`
  - 复用现有脚本 wrapper 习惯，只负责调用 `page-debug/core.js` 的 `main()` 并将异常输出到 `stderr`。
- Create: `scripts/node/page-debug/core.js`
  - 负责 `parseCliArgs`、目标 URL 组装、输出目录与产物路径生成、结构化 JSON 输出，以及把 `auth / readiness / evidence / snapshot` 串成一次完整运行。

### Authentication and storage state boundary

- Create: `scripts/node/page-debug/auth.js`
  - 负责从 `scripts/node/dev-up/core.js` 暴露的 `getServiceDefinitions()` 和 `buildServiceEnv()` 读取 `api-server` 环境，解析 root 账号密码，并通过 Playwright request context 调用 `POST /api/public/auth/providers/password-local/sign-in` 导出 `storage-state.json`。

### Runtime readiness and evidence boundary

- Create: `scripts/node/page-debug/readiness.js`
  - 负责基础稳定态、显式 `--wait-for-url`、`--wait-for-selector` 的等待和失败判定。
- Create: `scripts/node/page-debug/evidence.js`
  - 负责监听页面 `console` / `pageerror` 事件，序列化为 `console.ndjson`，并在稳定态后写出 `page.png`。

### Snapshot boundary

- Create: `scripts/node/page-debug/snapshot.js`
  - 负责资源响应分类、内联 `style/script` 提取、HTML 本地引用重写、CSS `url(...)` 绝对化、`meta.json` 和 `index.html` 落盘。

### Tests

- Create: `scripts/node/page-debug/_tests/core.test.js`
- Create: `scripts/node/page-debug/_tests/auth.test.js`
- Create: `scripts/node/page-debug/_tests/readiness.test.js`
- Create: `scripts/node/page-debug/_tests/evidence.test.js`
- Create: `scripts/node/page-debug/_tests/snapshot.test.js`

## Task 1: Scaffold CLI Contract And Machine-Readable Output

**Files:**
- Create: `scripts/node/page-debug.js`
- Create: `scripts/node/page-debug/core.js`
- Create: `scripts/node/page-debug/_tests/core.test.js`

- [x] **Step 1: Write the failing CLI contract tests**

```js
// scripts/node/page-debug/_tests/core.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createRunArtifacts,
  createSuccessResult,
  parseCliArgs,
  resolveTargetUrl,
} = require('../core.js');

test('parseCliArgs defaults to snapshot mode for a bare route', () => {
  assert.deepEqual(parseCliArgs(['/settings']), {
    help: false,
    mode: 'snapshot',
    target: '/settings',
    webBaseUrl: 'http://127.0.0.1:3100',
    apiBaseUrl: 'http://127.0.0.1:7800',
    outDir: null,
    headless: true,
    timeout: 15000,
    account: null,
    password: null,
    waitForSelector: null,
    waitForUrl: null,
  });
});

test('createRunArtifacts allocates the expected files for snapshot mode', () => {
  const repoRoot = '/repo';
  const artifacts = createRunArtifacts({
    repoRoot,
    mode: 'snapshot',
    outDir: null,
    now: new Date('2026-04-18T12:34:56Z'),
  });

  assert.equal(
    artifacts.runDir,
    path.join(repoRoot, 'tmp', 'page-debug', '2026-04-18T12-34-56-000Z')
  );
  assert.equal(artifacts.storageStatePath, path.join(artifacts.runDir, 'storage-state.json'));
  assert.equal(artifacts.metaPath, path.join(artifacts.runDir, 'meta.json'));
  assert.equal(artifacts.htmlPath, path.join(artifacts.runDir, 'index.html'));
  assert.equal(artifacts.screenshotPath, path.join(artifacts.runDir, 'page.png'));
  assert.equal(artifacts.consoleLogPath, path.join(artifacts.runDir, 'console.ndjson'));
});

test('resolveTargetUrl expands relative routes against the configured web base url', () => {
  assert.equal(
    resolveTargetUrl('http://127.0.0.1:3100', '/me/profile'),
    'http://127.0.0.1:3100/me/profile'
  );
  assert.equal(
    resolveTargetUrl('http://127.0.0.1:3100', 'http://127.0.0.1:3100/settings/members'),
    'http://127.0.0.1:3100/settings/members'
  );
});

test('createSuccessResult exposes machine-readable artifact paths', () => {
  assert.deepEqual(
    createSuccessResult({
      mode: 'snapshot',
      requestedUrl: '/settings',
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      authenticated: true,
      readyState: 'ready_with_selector',
      warnings: [],
      artifacts: {
        runDir: '/tmp/page-debug/run-1',
        metaPath: '/tmp/page-debug/run-1/meta.json',
        storageStatePath: '/tmp/page-debug/run-1/storage-state.json',
        htmlPath: '/tmp/page-debug/run-1/index.html',
        screenshotPath: '/tmp/page-debug/run-1/page.png',
        consoleLogPath: '/tmp/page-debug/run-1/console.ndjson',
      },
    }),
    {
      ok: true,
      mode: 'snapshot',
      requestedUrl: '/settings',
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      authenticated: true,
      readyState: 'ready_with_selector',
      outputDir: '/tmp/page-debug/run-1',
      metaPath: '/tmp/page-debug/run-1/meta.json',
      storageStatePath: '/tmp/page-debug/run-1/storage-state.json',
      htmlPath: '/tmp/page-debug/run-1/index.html',
      screenshotPath: '/tmp/page-debug/run-1/page.png',
      consoleLogPath: '/tmp/page-debug/run-1/console.ndjson',
      warnings: [],
    }
  );
});
```

- [x] **Step 2: Run the CLI contract tests and verify they fail**

Run:

```bash
node --test scripts/node/page-debug/_tests/core.test.js
```

Expected:

- FAIL with `Cannot find module '../core.js'`

- [x] **Step 3: Write the minimal CLI wrapper and core helpers**

```js
// scripts/node/page-debug.js
#!/usr/bin/env node

const { main } = require('./page-debug/core.js');

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[1flowbase-page-debug] ${error.message}\n`);
  process.exitCode = 1;
});
```

```js
// scripts/node/page-debug/core.js
const path = require('node:path');

const DEFAULT_WEB_BASE_URL = 'http://127.0.0.1:3100';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:7800';
const DEFAULT_TIMEOUT = 15000;
const MODES = new Set(['snapshot', 'open', 'login']);

function getRepoRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function parseCliArgs(argv) {
  const options = {
    help: false,
    mode: 'snapshot',
    target: null,
    webBaseUrl: DEFAULT_WEB_BASE_URL,
    apiBaseUrl: DEFAULT_API_BASE_URL,
    outDir: null,
    headless: true,
    timeout: DEFAULT_TIMEOUT,
    account: null,
    password: null,
    waitForSelector: null,
    waitForUrl: null,
  };

  const args = [...argv];
  if (args.includes('-h') || args.includes('--help')) {
    return { ...options, help: true };
  }

  if (args[0] && MODES.has(args[0])) {
    options.mode = args.shift();
  }

  if (options.mode !== 'login' && args[0] && !args[0].startsWith('--')) {
    options.target = args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();
    const value = args[0];

    if (arg === '--web-base-url') options.webBaseUrl = args.shift();
    else if (arg === '--api-base-url') options.apiBaseUrl = args.shift();
    else if (arg === '--out-dir') options.outDir = args.shift();
    else if (arg === '--headless') options.headless = value !== 'false' ? true : (args.shift(), false);
    else if (arg === '--timeout') options.timeout = Number.parseInt(args.shift(), 10);
    else if (arg === '--account') options.account = args.shift();
    else if (arg === '--password') options.password = args.shift();
    else if (arg === '--wait-for-selector') options.waitForSelector = args.shift();
    else if (arg === '--wait-for-url') options.waitForUrl = args.shift();
    else throw new Error(`未知参数：${arg}`);
  }

  if (options.mode !== 'login' && !options.target) {
    throw new Error(`模式 ${options.mode} 需要提供目标路由或 URL`);
  }

  if (options.mode === 'open' && argv.includes('--headless') === false) {
    options.headless = false;
  }

  return options;
}

function resolveTargetUrl(webBaseUrl, target) {
  return /^https?:\/\//u.test(target) ? target : new URL(target, webBaseUrl).toString();
}

function createRunArtifacts({ repoRoot, mode, outDir, now = new Date() }) {
  if (mode === 'login') {
    return {
      runDir: null,
      metaPath: null,
      storageStatePath: null,
      htmlPath: null,
      screenshotPath: null,
      consoleLogPath: null,
    };
  }

  const timestamp = now.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const runDir = outDir
    ? path.resolve(repoRoot, outDir)
    : path.join(repoRoot, 'tmp', 'page-debug', timestamp);

  return {
    runDir,
    metaPath: path.join(runDir, 'meta.json'),
    storageStatePath: path.join(runDir, 'storage-state.json'),
    htmlPath: mode === 'snapshot' ? path.join(runDir, 'index.html') : null,
    screenshotPath: path.join(runDir, 'page.png'),
    consoleLogPath: path.join(runDir, 'console.ndjson'),
  };
}

function createSuccessResult({ mode, requestedUrl, finalUrl, authenticated, readyState, artifacts, warnings }) {
  return {
    ok: true,
    mode,
    requestedUrl,
    finalUrl,
    authenticated,
    readyState,
    outputDir: artifacts.runDir,
    metaPath: artifacts.metaPath,
    storageStatePath: artifacts.storageStatePath,
    htmlPath: artifacts.htmlPath,
    screenshotPath: artifacts.screenshotPath,
    consoleLogPath: artifacts.consoleLogPath,
    warnings,
  };
}

async function main() {
  throw new Error('page-debug orchestration is not wired yet');
}

module.exports = {
  DEFAULT_API_BASE_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_WEB_BASE_URL,
  createRunArtifacts,
  createSuccessResult,
  getRepoRoot,
  main,
  parseCliArgs,
  resolveTargetUrl,
};
```

- [x] **Step 4: Run the CLI contract tests and verify they pass**

Run:

```bash
node --test scripts/node/page-debug/_tests/core.test.js
```

Expected:

- PASS with `4 tests` and `0 failures`

- [x] **Step 5: Commit the CLI scaffold**

```bash
git add scripts/node/page-debug.js scripts/node/page-debug/core.js scripts/node/page-debug/_tests/core.test.js
git commit -m "feat: scaffold page debug cli contract"
```

Execution note (`2026-04-18 11:40 +0800`):

- Red: `rtk node --test scripts/node/page-debug/_tests/core.test.js` failed with `Cannot find module '../core.js'`
- Green: `rtk node --test scripts/node/page-debug/_tests/core.test.js` passed with `4 tests` and `0 failures`

## Task 2: Add Root Credential Loading And HTTP Login Storage State Export

**Files:**
- Create: `scripts/node/page-debug/auth.js`
- Create: `scripts/node/page-debug/_tests/auth.test.js`
- Modify: `scripts/node/page-debug/core.js`

- [x] **Step 1: Write the failing auth tests**

```js
// scripts/node/page-debug/_tests/auth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { loadRootCredentials, loginAndPersistStorageState } = require('../auth.js');

test('loadRootCredentials falls back to api-server bootstrap env values', () => {
  const credentials = loadRootCredentials({
    repoRoot: '/repo',
    accountOverride: null,
    passwordOverride: null,
    getServiceDefinitions: () => ({
      'api-server': { key: 'api-server', envFile: '/repo/api/apps/api-server/.env' },
    }),
    buildServiceEnv: () => ({
      BOOTSTRAP_ROOT_ACCOUNT: 'root',
      BOOTSTRAP_ROOT_PASSWORD: 'change-me',
    }),
  });

  assert.deepEqual(credentials, {
    account: 'root',
    password: 'change-me',
    envFilePath: '/repo/api/apps/api-server/.env',
  });
});

test('loginAndPersistStorageState posts password login and writes storageState', async () => {
  const calls = [];
  const fakeRequestContext = {
    post: async (path, options) => {
      calls.push({ path, options });
      return {
        ok: () => true,
        status: () => 200,
        json: async () => ({ data: { csrf_token: 'csrf-token' } }),
      };
    },
    storageState: async ({ path }) => {
      calls.push({ storageStatePath: path });
    },
    dispose: async () => {
      calls.push({ dispose: true });
    },
  };

  const result = await loginAndPersistStorageState({
    playwright: {
      request: {
        newContext: async () => fakeRequestContext,
      },
    },
    apiBaseUrl: 'http://127.0.0.1:7800',
    account: 'root',
    password: 'change-me',
    storageStatePath: '/tmp/page-debug/storage-state.json',
  });

  assert.equal(result.authenticated, true);
  assert.equal(result.storageStatePath, '/tmp/page-debug/storage-state.json');
  assert.deepEqual(calls[0], {
    path: '/api/public/auth/providers/password-local/sign-in',
    options: {
      data: {
        identifier: 'root',
        password: 'change-me',
      },
    },
  });
});

test('loginAndPersistStorageState surfaces not_authenticated guidance on 401', async () => {
  await assert.rejects(
    () =>
      loginAndPersistStorageState({
        playwright: {
          request: {
            newContext: async () => ({
              post: async () => ({
                ok: () => false,
                status: () => 401,
                text: async () => 'not_authenticated',
              }),
              dispose: async () => {},
            }),
          },
        },
        apiBaseUrl: 'http://127.0.0.1:7800',
        account: 'root',
        password: 'wrong',
        storageStatePath: '/tmp/page-debug/storage-state.json',
      }),
    /root 凭据无效|not_authenticated/u
  );
});

test('loginAndPersistStorageState skips storage export when storageStatePath is null', async () => {
  let storageStateCalled = false;

  const result = await loginAndPersistStorageState({
    playwright: {
      request: {
        newContext: async () => ({
          post: async () => ({
            ok: () => true,
            status: () => 200,
            json: async () => ({ data: {} }),
          }),
          storageState: async () => {
            storageStateCalled = true;
          },
          dispose: async () => {},
        }),
      },
    },
    apiBaseUrl: 'http://127.0.0.1:7800',
    account: 'root',
    password: 'change-me',
    storageStatePath: null,
  });

  assert.equal(result.authenticated, true);
  assert.equal(result.storageStatePath, null);
  assert.equal(storageStateCalled, false);
});
```

- [x] **Step 2: Run the auth tests and verify they fail**

Run:

```bash
node --test scripts/node/page-debug/_tests/auth.test.js
```

Expected:

- FAIL with `Cannot find module '../auth.js'`

- [x] **Step 3: Write the minimal auth implementation**

```js
// scripts/node/page-debug/auth.js
const { buildServiceEnv, getServiceDefinitions } = require('../dev-up/core.js');

function loadRootCredentials({
  repoRoot,
  accountOverride,
  passwordOverride,
  getServiceDefinitions: getDefinitions = getServiceDefinitions,
  buildServiceEnv: buildEnv = buildServiceEnv,
  sourceEnv = process.env,
}) {
  const apiService = getDefinitions(repoRoot)['api-server'];
  const env = buildEnv(apiService, sourceEnv);
  const account = accountOverride || env.BOOTSTRAP_ROOT_ACCOUNT || 'root';
  const password = passwordOverride || env.BOOTSTRAP_ROOT_PASSWORD;

  if (!password) {
    throw new Error(`缺少 root 密码，请检查 ${apiService.envFile}`);
  }

  return {
    account,
    password,
    envFilePath: apiService.envFile,
  };
}

async function loginAndPersistStorageState({
  playwright,
  apiBaseUrl,
  account,
  password,
  storageStatePath,
}) {
  const requestContext = await playwright.request.newContext({
    baseURL: apiBaseUrl,
    ignoreHTTPSErrors: true,
  });

  try {
    const response = await requestContext.post('/api/public/auth/providers/password-local/sign-in', {
      data: {
        identifier: account,
        password,
      },
    });

    if (!response.ok()) {
      const body = typeof response.text === 'function' ? await response.text() : '';
      throw new Error(`root 凭据无效，登录失败：${response.status()} ${body}`.trim());
    }

    if (storageStatePath) {
      await requestContext.storageState({ path: storageStatePath });
    }
    return {
      authenticated: true,
      storageStatePath: storageStatePath ?? null,
    };
  } finally {
    await requestContext.dispose();
  }
}

module.exports = {
  loadRootCredentials,
  loginAndPersistStorageState,
};
```

```js
// scripts/node/page-debug/core.js
const { loadRootCredentials } = require('./auth.js');
```

- [x] **Step 4: Run the auth tests and verify they pass**

Run:

```bash
node --test scripts/node/page-debug/_tests/auth.test.js
```

Expected:

- PASS with `4 tests` and `0 failures`

- [x] **Step 5: Commit the auth boundary**

```bash
git add scripts/node/page-debug/core.js scripts/node/page-debug/auth.js scripts/node/page-debug/_tests/auth.test.js
git commit -m "feat: add page debug auth bootstrap"
```

Execution note (`2026-04-18 11:41 +0800`):

- Red: `rtk node --test scripts/node/page-debug/_tests/auth.test.js` failed with `Cannot find module '../auth.js'`
- Green: `rtk node --test scripts/node/page-debug/_tests/auth.test.js` passed with `4 tests` and `0 failures`

## Task 3: Add Page Readiness Contract And Evidence Writers

**Files:**
- Create: `scripts/node/page-debug/readiness.js`
- Create: `scripts/node/page-debug/evidence.js`
- Create: `scripts/node/page-debug/_tests/readiness.test.js`
- Create: `scripts/node/page-debug/_tests/evidence.test.js`
- Modify: `scripts/node/page-debug/core.js`

- [x] **Step 1: Write the failing readiness and evidence tests**

```js
// scripts/node/page-debug/_tests/readiness.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { assertReadyNavigation } = require('../readiness.js');

test('assertReadyNavigation rejects sign-in fallback', () => {
  assert.throws(
    () =>
      assertReadyNavigation({
        requestedUrl: '/settings',
        finalUrl: 'http://127.0.0.1:3100/sign-in',
        waitForUrl: null,
      }),
    /sign-in/u
  );
});

test('assertReadyNavigation honors explicit wait-for-url', () => {
  assert.deepEqual(
    assertReadyNavigation({
      requestedUrl: '/settings',
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      waitForUrl: 'http://127.0.0.1:3100/settings/members',
    }),
    {
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      readyState: 'ready_with_url',
    }
  );
});
```

```js
// scripts/node/page-debug/_tests/evidence.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { serializeConsoleEntries } = require('../evidence.js');

test('serializeConsoleEntries writes ndjson for console and pageerror events', () => {
  const payload = serializeConsoleEntries([
    {
      timestamp: '2026-04-18T12:00:00.000Z',
      eventType: 'console',
      level: 'error',
      text: 'boom',
      url: 'http://127.0.0.1:3100/src/main.tsx',
      lineNumber: 10,
      columnNumber: 2,
    },
    {
      timestamp: '2026-04-18T12:00:01.000Z',
      eventType: 'pageerror',
      level: 'error',
      text: 'ReferenceError: missingVar',
      url: null,
      lineNumber: null,
      columnNumber: null,
    },
  ]);

  assert.match(payload, /"eventType":"console"/u);
  assert.match(payload, /"eventType":"pageerror"/u);
  assert.equal(payload.trim().split('\n').length, 2);
});
```

- [x] **Step 2: Run the readiness and evidence tests and verify they fail**

Run:

```bash
node --test scripts/node/page-debug/_tests/readiness.test.js scripts/node/page-debug/_tests/evidence.test.js
```

Expected:

- FAIL with missing `readiness.js` / `evidence.js`

- [x] **Step 3: Write the readiness and evidence implementation**

```js
// scripts/node/page-debug/readiness.js
function assertReadyNavigation({ requestedUrl, finalUrl, waitForUrl }) {
  const final = new URL(finalUrl);
  if (final.pathname === '/sign-in') {
    throw new Error(`页面回跳到 /sign-in，认证态未生效：${finalUrl}`);
  }

  if (waitForUrl && finalUrl !== waitForUrl) {
    throw new Error(`最终 URL 不匹配 wait-for-url：expected=${waitForUrl} actual=${finalUrl}`);
  }

  return {
    finalUrl,
    readyState: waitForUrl ? 'ready_with_url' : 'ready',
  };
}

async function waitForPageReady({ page, requestedUrl, waitForUrl, waitForSelector, timeout }) {
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.waitForFunction(() => document.readyState === 'complete', { timeout });
  await page.waitForFunction(
    () => !document.body?.innerText?.includes('正在恢复会话...'),
    { timeout }
  );

  const baseResult = assertReadyNavigation({
    requestedUrl,
    finalUrl: page.url(),
    waitForUrl,
  });

  if (waitForSelector) {
    await page.locator(waitForSelector).first().waitFor({
      state: 'visible',
      timeout,
    });
    return {
      finalUrl: page.url(),
      readyState: 'ready_with_selector',
    };
  }

  return baseResult;
}

module.exports = {
  assertReadyNavigation,
  waitForPageReady,
};
```

```js
// scripts/node/page-debug/evidence.js
const fs = require('node:fs');

function createConsoleCollector(now = () => new Date().toISOString()) {
  const entries = [];

  return {
    entries,
    attach(page) {
      page.on('console', async (message) => {
        const location = typeof message.location === 'function' ? message.location() : {};
        entries.push({
          timestamp: now(),
          eventType: 'console',
          level: typeof message.type === 'function' ? message.type() : 'log',
          text: typeof message.text === 'function' ? message.text() : '',
          url: location.url ?? null,
          lineNumber: location.lineNumber ?? null,
          columnNumber: location.columnNumber ?? null,
        });
      });

      page.on('pageerror', (error) => {
        entries.push({
          timestamp: now(),
          eventType: 'pageerror',
          level: 'error',
          text: error instanceof Error ? error.stack || error.message : String(error),
          url: null,
          lineNumber: null,
          columnNumber: null,
        });
      });
    },
  };
}

function serializeConsoleEntries(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : '');
}

async function writeEvidence({ page, screenshotPath, consoleLogPath, collector }) {
  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(consoleLogPath, serializeConsoleEntries(collector.entries), 'utf8');
}

module.exports = {
  createConsoleCollector,
  serializeConsoleEntries,
  writeEvidence,
};
```

- [x] **Step 4: Run the readiness and evidence tests and verify they pass**

Run:

```bash
node --test scripts/node/page-debug/_tests/readiness.test.js scripts/node/page-debug/_tests/evidence.test.js
```

Expected:

- PASS with `3 tests` and `0 failures`

- [x] **Step 5: Commit the readiness and evidence helpers**

```bash
git add scripts/node/page-debug/readiness.js scripts/node/page-debug/evidence.js scripts/node/page-debug/_tests/readiness.test.js scripts/node/page-debug/_tests/evidence.test.js
git commit -m "feat: add page debug readiness and evidence writers"
```

Execution note (`2026-04-18 11:42 +0800`):

- Red: `rtk node --test scripts/node/page-debug/_tests/readiness.test.js scripts/node/page-debug/_tests/evidence.test.js` failed with missing `readiness.js` / `evidence.js`
- Green: `rtk node --test scripts/node/page-debug/_tests/readiness.test.js scripts/node/page-debug/_tests/evidence.test.js` passed with `3 tests` and `0 failures`

## Task 4: Add Snapshot Resource Rewriting And Meta Writers

**Files:**
- Create: `scripts/node/page-debug/snapshot.js`
- Create: `scripts/node/page-debug/_tests/snapshot.test.js`
- Modify: `scripts/node/page-debug/core.js`

- [x] **Step 1: Write the failing snapshot tests**

```js
// scripts/node/page-debug/_tests/snapshot.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assignInlineArtifactPaths,
  assignLocalResourcePaths,
  buildMetaPayload,
  rewriteCssUrls,
  rewriteSnapshotHtml,
} = require('../snapshot.js');

test('rewriteCssUrls converts relative stylesheet urls to absolute source urls', () => {
  assert.equal(
    rewriteCssUrls('.hero{background:url("../assets/hero.png")}', 'http://127.0.0.1:3100/src/app.css'),
    '.hero{background:url("http://127.0.0.1:3100/assets/hero.png")}'
  );
});

test('rewriteSnapshotHtml swaps external urls and inline placeholders for local artifacts', () => {
  const html = [
    '<html><head>',
    '<link rel="stylesheet" href="http://127.0.0.1:3100/src/app.css">',
    '<link rel="stylesheet" href="__PAGE_DEBUG_INLINE_STYLE_1__">',
    '</head><body>',
    '<script src="http://127.0.0.1:3100/src/main.tsx"></script>',
    '<script src="__PAGE_DEBUG_INLINE_SCRIPT_1__"></script>',
    '</body></html>',
  ].join('');

  assert.equal(
    rewriteSnapshotHtml(html, {
      externalStyles: [{ originalUrl: 'http://127.0.0.1:3100/src/app.css', localPath: 'css/001-app.css' }],
      externalScripts: [{ originalUrl: 'http://127.0.0.1:3100/src/main.tsx', localPath: 'js/001-main.js' }],
      inlineStyles: [{ placeholder: '__PAGE_DEBUG_INLINE_STYLE_1__', localPath: 'css/002-inline.css' }],
      inlineScripts: [{ placeholder: '__PAGE_DEBUG_INLINE_SCRIPT_1__', localPath: 'js/002-inline.js' }],
    }),
    '<html><head><link rel="stylesheet" href="css/001-app.css"><link rel="stylesheet" href="css/002-inline.css"></head><body><script src="js/001-main.js"></script><script src="js/002-inline.js"></script></body></html>'
  );
});

test('assignLocalResourcePaths numbers stylesheet and script outputs separately', () => {
  assert.deepEqual(
    assignLocalResourcePaths([
      { kind: 'stylesheet', originalUrl: 'http://127.0.0.1:3100/src/app.css', body: 'body{}' },
      { kind: 'script', originalUrl: 'http://127.0.0.1:3100/src/main.tsx', body: 'console.log(1);' },
    ]),
    [
      {
        kind: 'stylesheet',
        originalUrl: 'http://127.0.0.1:3100/src/app.css',
        body: 'body{}',
        localPath: 'css/001-app.css',
      },
      {
        kind: 'script',
        originalUrl: 'http://127.0.0.1:3100/src/main.tsx',
        body: 'console.log(1);',
        localPath: 'js/001-main.js',
      },
    ]
  );
});

test('buildMetaPayload records evidence counts and artifact paths', () => {
  assert.deepEqual(
    buildMetaPayload({
      requestedUrl: '/settings',
      finalUrl: 'http://127.0.0.1:3100/settings/members',
      webBaseUrl: 'http://127.0.0.1:3100',
      apiBaseUrl: 'http://127.0.0.1:7800',
      account: 'root',
      readyState: 'ready_with_selector',
      storageStatePath: '/tmp/run/storage-state.json',
      screenshotPath: '/tmp/run/page.png',
      consoleLogPath: '/tmp/run/console.ndjson',
      consoleEntries: [{ eventType: 'console' }],
      resources: [{ kind: 'stylesheet', localPath: 'css/001-app.css' }],
      warnings: [],
    }).pageErrorCount,
    0
  );
});
```

- [x] **Step 2: Run the snapshot tests and verify they fail**

Run:

```bash
node --test scripts/node/page-debug/_tests/snapshot.test.js
```

Expected:

- FAIL with `Cannot find module '../snapshot.js'`

- [x] **Step 3: Write the snapshot helpers**

```js
// scripts/node/page-debug/snapshot.js
const fs = require('node:fs');
const path = require('node:path');

const INLINE_STYLE_PREFIX = '__PAGE_DEBUG_INLINE_STYLE_';
const INLINE_SCRIPT_PREFIX = '__PAGE_DEBUG_INLINE_SCRIPT_';

function slugFromUrl(resourceUrl, fallback) {
  const pathname = new URL(resourceUrl).pathname;
  const basename = path.basename(pathname).replace(/\.[^.]+$/u, '');
  return basename.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '') || fallback;
}

function rewriteCssUrls(source, stylesheetUrl) {
  return source.replace(/url\((['"]?)([^)'"]+)\1\)/gu, (_match, quote, rawUrl) => {
    if (/^(data:|https?:|blob:|#)/u.test(rawUrl)) {
      return `url(${quote}${rawUrl}${quote})`;
    }

    return `url(${quote}${new URL(rawUrl, stylesheetUrl).toString()}${quote})`;
  });
}

function rewriteSnapshotHtml(html, { externalStyles, externalScripts, inlineStyles, inlineScripts }) {
  let next = html;

  for (const style of externalStyles) {
    next = next.split(style.originalUrl).join(style.localPath);
  }
  for (const script of externalScripts) {
    next = next.split(script.originalUrl).join(script.localPath);
  }
  for (const inlineStyle of inlineStyles) {
    next = next.split(inlineStyle.placeholder).join(inlineStyle.localPath);
  }
  for (const inlineScript of inlineScripts) {
    next = next.split(inlineScript.placeholder).join(inlineScript.localPath);
  }

  return next;
}

function assignLocalResourcePaths(records) {
  let styleIndex = 0;
  let scriptIndex = 0;

  return records.map((record) => {
    if (record.kind === 'stylesheet') {
      styleIndex += 1;
      return {
        ...record,
        localPath: `css/${String(styleIndex).padStart(3, '0')}-${slugFromUrl(record.originalUrl, 'style')}.css`,
      };
    }

    if (record.kind === 'script') {
      scriptIndex += 1;
      return {
        ...record,
        localPath: `js/${String(scriptIndex).padStart(3, '0')}-${slugFromUrl(record.originalUrl, 'script')}.js`,
      };
    }

    return record;
  });
}

function assignInlineArtifactPaths({ inlineStyles, inlineScripts, externalStyles, externalScripts }) {
  return {
    inlineStyles: inlineStyles.map((entry, index) => ({
      ...entry,
      localPath: `css/${String(externalStyles.length + index + 1).padStart(3, '0')}-inline.css`,
    })),
    inlineScripts: inlineScripts.map((entry, index) => ({
      ...entry,
      localPath: `js/${String(externalScripts.length + index + 1).padStart(3, '0')}-inline.js`,
    })),
  };
}

function buildMetaPayload({
  requestedUrl,
  finalUrl,
  webBaseUrl,
  apiBaseUrl,
  account,
  readyState,
  storageStatePath,
  screenshotPath,
  consoleLogPath,
  consoleEntries,
  resources,
  warnings,
}) {
  return {
    requestedUrl,
    finalUrl,
    capturedAt: new Date().toISOString(),
    webBaseUrl,
    apiBaseUrl,
    account,
    readyState,
    storageStatePath,
    screenshotPath,
    consoleLogPath,
    consoleEntryCount: consoleEntries.length,
    pageErrorCount: consoleEntries.filter((entry) => entry.eventType === 'pageerror').length,
    resources,
    warnings,
  };
}

function writeSnapshotArtifacts({
  runDir,
  htmlPath,
  metaPath,
  html,
  meta,
  externalStyles,
  externalScripts,
  inlineStyles,
  inlineScripts,
}) {
  fs.mkdirSync(path.join(runDir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'js'), { recursive: true });

  for (const style of externalStyles) {
    fs.writeFileSync(path.join(runDir, style.localPath), rewriteCssUrls(style.body, style.originalUrl), 'utf8');
  }
  for (const script of externalScripts) {
    fs.writeFileSync(path.join(runDir, script.localPath), script.body, 'utf8');
  }
  for (const inlineStyle of inlineStyles) {
    fs.writeFileSync(path.join(runDir, inlineStyle.localPath), inlineStyle.content, 'utf8');
  }
  for (const inlineScript of inlineScripts) {
    fs.writeFileSync(path.join(runDir, inlineScript.localPath), inlineScript.content, 'utf8');
  }

  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
}

module.exports = {
  INLINE_SCRIPT_PREFIX,
  INLINE_STYLE_PREFIX,
  assignInlineArtifactPaths,
  assignLocalResourcePaths,
  buildMetaPayload,
  rewriteCssUrls,
  rewriteSnapshotHtml,
  writeSnapshotArtifacts,
};
```

- [x] **Step 4: Run the snapshot tests and verify they pass**

Run:

```bash
node --test scripts/node/page-debug/_tests/snapshot.test.js
```

Expected:

- PASS with `4 tests` and `0 failures`

- [x] **Step 5: Commit the snapshot boundary**

```bash
git add scripts/node/page-debug/snapshot.js scripts/node/page-debug/_tests/snapshot.test.js
git commit -m "feat: add page debug snapshot writers"
```

Execution note (`2026-04-18 11:44 +0800`):

- Red: `rtk node --test scripts/node/page-debug/_tests/snapshot.test.js` failed with `Cannot find module '../snapshot.js'`
- Green: `rtk node --test scripts/node/page-debug/_tests/snapshot.test.js` passed with `4 tests` and `0 failures`

## Task 5: Integrate Playwright Runtime Flow, JSON Output, And Manual Smoke Checks

**Files:**
- Modify: `scripts/node/page-debug/core.js`

- [x] **Step 1: Add the failing runtime orchestration test**

```js
// append to scripts/node/page-debug/_tests/core.test.js
test('runPageDebug login mode returns structured json without launching a browser', async () => {
  const writes = [];
  const result = await require('../core.js').runPageDebug({
    help: false,
    mode: 'login',
    target: null,
    webBaseUrl: 'http://127.0.0.1:3100',
    apiBaseUrl: 'http://127.0.0.1:7800',
    outDir: null,
    headless: true,
    timeout: 15000,
    account: 'root',
    password: 'change-me',
    waitForSelector: null,
    waitForUrl: null,
  }, {
    repoRoot: '/repo',
    playwright: {
      request: {
        newContext: async () => ({
          post: async () => ({ ok: () => true, status: () => 200, json: async () => ({ data: {} }) }),
          storageState: async () => {},
          dispose: async () => {},
        }),
      },
    },
    loadRootCredentials: () => ({ account: 'root', password: 'change-me', envFilePath: '/repo/.env' }),
    writeStdoutJson: (payload) => writes.push(payload),
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'login');
  assert.equal(result.outputDir, null);
  assert.equal(writes[0].mode, 'login');
});
```

- [x] **Step 2: Run the core tests and verify the new orchestration case fails**

Run:

```bash
node --test scripts/node/page-debug/_tests/core.test.js
```

Expected:

- FAIL with `runPageDebug is not a function`

- [x] **Step 3: Implement the end-to-end orchestration in `core.js`**

```js
// scripts/node/page-debug/core.js
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { loadRootCredentials, loginAndPersistStorageState } = require('./auth.js');
const { createConsoleCollector, writeEvidence } = require('./evidence.js');
const { waitForPageReady } = require('./readiness.js');
const {
  INLINE_SCRIPT_PREFIX,
  INLINE_STYLE_PREFIX,
  assignInlineArtifactPaths,
  assignLocalResourcePaths,
  buildMetaPayload,
  rewriteCssUrls,
  rewriteSnapshotHtml,
  writeSnapshotArtifacts,
} = require('./snapshot.js');

function loadPlaywright(repoRoot) {
  const webRequire = createRequire(path.join(repoRoot, 'web', 'package.json'));
  return webRequire('playwright');
}

function writeStdoutJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function runPageDebug(options, deps = {}) {
  const repoRoot = deps.repoRoot || getRepoRoot();
  const playwright = deps.playwright || loadPlaywright(repoRoot);
  const credentials = (deps.loadRootCredentials || loadRootCredentials)({
    repoRoot,
    accountOverride: options.account,
    passwordOverride: options.password,
  });
  const artifacts = createRunArtifacts({
    repoRoot,
    mode: options.mode,
    outDir: options.outDir,
  });

  if (artifacts.runDir) {
    fs.mkdirSync(artifacts.runDir, { recursive: true });
  }

  if (options.mode === 'login') {
    await loginAndPersistStorageState({
      playwright,
      apiBaseUrl: options.apiBaseUrl,
      account: credentials.account,
      password: credentials.password,
      storageStatePath: null,
    });

    const result = createSuccessResult({
      mode: 'login',
      requestedUrl: null,
      finalUrl: null,
      authenticated: true,
      readyState: 'authenticated_only',
      artifacts,
      warnings: [],
    });
    (deps.writeStdoutJson || writeStdoutJson)(result);
    return result;
  }

  await loginAndPersistStorageState({
    playwright,
    apiBaseUrl: options.apiBaseUrl,
    account: credentials.account,
    password: credentials.password,
    storageStatePath: artifacts.storageStatePath,
  });

  const browser = await playwright.chromium.launch({ headless: options.headless });
  const context = await browser.newContext({ storageState: artifacts.storageStatePath });
  const page = await context.newPage();
  const collector = createConsoleCollector();
  collector.attach(page);
  const resourceRecords = [];
  page.on('response', async (response) => {
    const resourceType = response.request().resourceType();
    if (!['stylesheet', 'script'].includes(resourceType) || !response.ok()) {
      return;
    }

    resourceRecords.push({
      kind: resourceType,
      originalUrl: response.url(),
      body: await response.text(),
    });
  });

  const requestedUrl = resolveTargetUrl(options.webBaseUrl, options.target);
  await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: options.timeout });
  const ready = await waitForPageReady({
    page,
    requestedUrl: options.target,
    waitForUrl: options.waitForUrl,
    waitForSelector: options.waitForSelector,
    timeout: options.timeout,
  });

  await writeEvidence({
    page,
    screenshotPath: artifacts.screenshotPath,
    consoleLogPath: artifacts.consoleLogPath,
    collector,
  });

  if (options.mode === 'snapshot') {
    const externalRecords = assignLocalResourcePaths(resourceRecords);
    const externalStyles = externalRecords.filter((entry) => entry.kind === 'stylesheet');
    const externalScripts = externalRecords.filter((entry) => entry.kind === 'script');
    const domSnapshot = await page.evaluate(({ stylePrefix, scriptPrefix }) => {
      const clone = document.documentElement.cloneNode(true);
      const inlineStyles = [];
      const inlineScripts = [];

      clone.querySelectorAll('style').forEach((node, index) => {
        const placeholder = `${stylePrefix}${index + 1}__`;
        inlineStyles.push({ placeholder, content: node.textContent || '' });
        const link = document.createElement('link');
        link.setAttribute('rel', 'stylesheet');
        link.setAttribute('href', placeholder);
        node.replaceWith(link);
      });

      clone.querySelectorAll('script:not([src])').forEach((node, index) => {
        const placeholder = `${scriptPrefix}${index + 1}__`;
        inlineScripts.push({ placeholder, content: node.textContent || '' });
        const script = document.createElement('script');
        script.setAttribute('src', placeholder);
        node.replaceWith(script);
      });

      return {
        html: '<!DOCTYPE html>\n' + clone.outerHTML,
        inlineStyles,
        inlineScripts,
      };
    }, {
      stylePrefix: INLINE_STYLE_PREFIX,
      scriptPrefix: INLINE_SCRIPT_PREFIX,
    });

    const inlineArtifacts = assignInlineArtifactPaths({
      inlineStyles: domSnapshot.inlineStyles,
      inlineScripts: domSnapshot.inlineScripts,
      externalStyles,
      externalScripts,
    });
    const html = rewriteSnapshotHtml(domSnapshot.html, {
      externalStyles,
      externalScripts,
      inlineStyles: inlineArtifacts.inlineStyles,
      inlineScripts: inlineArtifacts.inlineScripts,
    });
    const meta = buildMetaPayload({
      requestedUrl: options.target,
      finalUrl: ready.finalUrl,
      webBaseUrl: options.webBaseUrl,
      apiBaseUrl: options.apiBaseUrl,
      account: credentials.account,
      readyState: ready.readyState,
      storageStatePath: artifacts.storageStatePath,
      screenshotPath: artifacts.screenshotPath,
      consoleLogPath: artifacts.consoleLogPath,
      consoleEntries: collector.entries,
      resources: [...externalRecords, ...inlineArtifacts.inlineStyles, ...inlineArtifacts.inlineScripts],
      warnings: [],
    });
    writeSnapshotArtifacts({
      runDir: artifacts.runDir,
      htmlPath: artifacts.htmlPath,
      metaPath: artifacts.metaPath,
      html,
      meta,
      externalStyles,
      externalScripts,
      inlineStyles: inlineArtifacts.inlineStyles,
      inlineScripts: inlineArtifacts.inlineScripts,
    });
  }

  const result = createSuccessResult({
    mode: options.mode,
    requestedUrl: options.target,
    finalUrl: ready.finalUrl,
    authenticated: true,
    readyState: ready.readyState,
    artifacts,
    warnings: [],
  });

  (deps.writeStdoutJson || writeStdoutJson)(result);
  if (options.mode !== 'open') {
    await browser.close();
  }
  return result;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write('用法：node scripts/node/page-debug.js [snapshot|open|login] <route-or-url>\n');
    return 0;
  }

  const result = await runPageDebug(options);
  return result.ok ? 0 : 1;
}

module.exports = {
  DEFAULT_API_BASE_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_WEB_BASE_URL,
  createRunArtifacts,
  createSuccessResult,
  getRepoRoot,
  main,
  parseCliArgs,
  resolveTargetUrl,
  runPageDebug,
};
```

- [x] **Step 4: Run automated tests and manual smoke checks**

Run:

```bash
node --test \
  scripts/node/page-debug/_tests/core.test.js \
  scripts/node/page-debug/_tests/auth.test.js \
  scripts/node/page-debug/_tests/readiness.test.js \
  scripts/node/page-debug/_tests/evidence.test.js \
  scripts/node/page-debug/_tests/snapshot.test.js
```

Expected:

- PASS with `0 failures`

Run:

```bash
node scripts/node/page-debug.js login
```

Expected:

- stdout 输出单行 JSON
- `ok: true`
- `mode: "login"`

Run:

```bash
node scripts/node/page-debug.js snapshot /settings \
  --wait-for-url http://127.0.0.1:3100/settings/members \
  --wait-for-selector '[data-testid="section-page-layout"]'
```

Expected:

- stdout 输出单行 JSON
- `ok: true`
- `mode: "snapshot"`
- `htmlPath`、`storageStatePath`、`screenshotPath`、`consoleLogPath` 均为非空
- 对应目录下存在 `meta.json`、`storage-state.json`、`index.html`、`page.png`、`console.ndjson`、`css/`、`js/`

Run:

```bash
node scripts/node/page-debug.js open /me/profile \
  --wait-for-selector '[data-testid="section-page-layout"]'
```

Expected:

- 打开有头浏览器
- stdout 输出单行 JSON
- 运行目录下存在 `storage-state.json`、`page.png`、`console.ndjson`

- [x] **Step 5: Commit the integrated page-debug script**

```bash
git add scripts/node/page-debug.js scripts/node/page-debug
git commit -m "feat: add page debug automation script"
```

Execution note (`2026-04-18 11:50 +0800`):

- Red: `rtk node --test scripts/node/page-debug/_tests/core.test.js` failed with `runPageDebug is not a function`
- Green: `rtk node --test scripts/node/page-debug/_tests/core.test.js scripts/node/page-debug/_tests/auth.test.js scripts/node/page-debug/_tests/readiness.test.js scripts/node/page-debug/_tests/evidence.test.js scripts/node/page-debug/_tests/snapshot.test.js` passed with `17 tests` and `0 failures`
- Smoke: `rtk node scripts/node/page-debug.js login` returned single-line JSON with `ok: true` and `mode: "login"`
- Smoke: `rtk node scripts/node/page-debug.js snapshot /settings --wait-for-selector '[data-testid="section-page-layout"]'` succeeded and落盘 `meta.json`、`storage-state.json`、`index.html`、`page.png`、`console.ndjson`、`css/`、`js/`
- Smoke: current app 实际会把 `/settings` 归一化到 `http://127.0.0.1:3100/settings/docs`；原计划里的 `.../settings/members` 已不再匹配当前运行态
- Fix during smoke: 新增 `waitForPageReady` 红灯测试后，改为在 `waitForUrl` 场景先 `page.waitForURL(...)`，随后 `rtk node scripts/node/page-debug.js snapshot /settings --wait-for-url http://127.0.0.1:3100/settings/docs --wait-for-selector '[data-testid="section-page-layout"]'` 成功
- Smoke: `rtk node scripts/node/page-debug.js open /me/profile --wait-for-selector '[data-testid="section-page-layout"]'` 输出单行 JSON，并在运行目录写出 `meta.json`、`storage-state.json`、`page.png`、`console.ndjson`
