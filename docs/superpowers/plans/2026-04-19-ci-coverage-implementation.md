# CI And Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-owned coverage gates and GitHub Actions CI so `1flowbase` can enforce high-risk coverage thresholds through the same `scripts/node/*` entrypoints used locally.

**Architecture:** Keep `scripts/node/*` as the single verification control plane. `verify-coverage` owns coverage execution, artifact paths, and threshold evaluation; `verify-ci` composes `verify-repo` plus `verify-coverage all`; GitHub Actions only prepares toolchains and delegates to the repo wrapper instead of re-encoding verification logic in YAML.

**Tech Stack:** Node.js CLI wrappers, `node:test`, Vitest coverage v8, Rust `cargo-llvm-cov`, GitHub Actions YAML, Markdown docs

---

## File Structure

**Create**
- `scripts/node/testing/coverage-thresholds.js`
- `scripts/node/verify-coverage.js`
- `scripts/node/verify-coverage/_tests/cli.test.js`
- `scripts/node/verify-ci.js`
- `scripts/node/verify-ci/_tests/cli.test.js`
- `.github/workflows/verify.yml`
- `docs/superpowers/plans/2026-04-19-ci-coverage-implementation.md`

**Modify**
- `README.md`
- `web/package.json`
- `web/app/package.json`
- `web/app/vite.config.ts`
- `web/pnpm-lock.yaml`

**Notes**
- Coverage stays separate from `verify-repo`; do not fold coverage into the existing repo full gate.
- Warning output remains advisory-only and must continue to land under `tmp/test-governance/`.
- Frontend thresholds apply only to `src/features/agent-flow/**` and `src/features/settings/**`.
- Backend thresholds apply only to `control-plane`, `storage-pg`, and `api-server`.
- GitHub Actions must call `node scripts/node/verify-ci.js` and must not duplicate `lint/test/coverage` command logic inline.

### Task 1: Create Shared Coverage Config And Frontend Coverage Gate

**Files:**
- Create: `scripts/node/testing/coverage-thresholds.js`
- Create: `scripts/node/verify-coverage.js`
- Create: `scripts/node/verify-coverage/_tests/cli.test.js`
- Modify: `web/package.json`
- Modify: `web/app/package.json`
- Modify: `web/app/vite.config.ts`
- Modify: `web/pnpm-lock.yaml`

- [ ] **Step 1: Write failing `node:test` coverage tests for CLI defaults, frontend command shape, and high-risk path aggregation**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  parseCliArgs,
  buildFrontendCommand,
  collectFrontendCoverageFailures,
} = require('../../verify-coverage.js');

test('parseCliArgs defaults to all coverage gates', () => {
  assert.deepEqual(parseCliArgs([]), { help: false, target: 'all' });
});

test('buildFrontendCommand runs Vitest coverage through the app package', () => {
  const repoRoot = '/repo-root';

  assert.deepEqual(buildFrontendCommand({ repoRoot }), {
    label: 'frontend-coverage',
    command: 'pnpm',
    args: ['--dir', 'web/app', 'test:coverage'],
    cwd: repoRoot,
  });
});

test('collectFrontendCoverageFailures only checks configured high-risk prefixes', () => {
  const summary = {
    total: { lines: { pct: 91 }, functions: { pct: 90 }, statements: { pct: 92 }, branches: { pct: 80 } },
    '/repo/web/app/src/features/agent-flow/pages/AgentFlowEditorPage.tsx': {
      lines: { pct: 74 },
      functions: { pct: 73 },
      statements: { pct: 71 },
      branches: { pct: 59 },
    },
    '/repo/web/app/src/features/settings/components/RolePermissionPanel.tsx': {
      lines: { pct: 68 },
      functions: { pct: 67 },
      statements: { pct: 68 },
      branches: { pct: 52 },
    },
  };

  assert.deepEqual(collectFrontendCoverageFailures(summary), []);
});
```

- [ ] **Step 2: Run the new CLI test file and verify RED**

Run:

```bash
rtk node --test scripts/node/verify-coverage/_tests/cli.test.js
```

Expected:

- FAIL with `Cannot find module '../../verify-coverage.js'` or missing export errors because the new coverage entrypoint does not exist yet.

- [ ] **Step 3: Add the shared threshold registry**

```js
const COVERAGE_ROOT = 'tmp/test-governance/coverage';

const frontendThresholds = [
  {
    key: 'agent-flow',
    prefix: 'src/features/agent-flow/',
    thresholds: {
      lines: 70,
      functions: 70,
      statements: 70,
      branches: 55,
    },
  },
  {
    key: 'settings',
    prefix: 'src/features/settings/',
    thresholds: {
      lines: 65,
      functions: 65,
      statements: 65,
      branches: 50,
    },
  },
];

const backendThresholds = [
  { key: 'control-plane', packageName: 'control-plane', line: 70 },
  { key: 'storage-pg', packageName: 'storage-pg', line: 65 },
  { key: 'api-server', packageName: 'api-server', line: 60 },
];

module.exports = {
  COVERAGE_ROOT,
  frontendThresholds,
  backendThresholds,
};
```

- [ ] **Step 4: Implement the frontend half of `verify-coverage.js`**

```js
function parseCliArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    return { help: true, target: 'all' };
  }

  const [target = 'all'] = argv;

  if (!new Set(['frontend', 'backend', 'all']).has(target)) {
    throw new Error(`Unknown coverage target: ${target}`);
  }

  return { help: false, target };
}

function buildFrontendCommand({ repoRoot }) {
  return {
    label: 'frontend-coverage',
    command: 'pnpm',
    args: ['--dir', 'web/app', 'test:coverage'],
    cwd: repoRoot,
  };
}

function collectFrontendCoverageFailures(summary) {
  // Read coverage-summary.json entries, aggregate only matching prefixes,
  // and compare against frontendThresholds.
}
```

- [ ] **Step 5: Wire Vitest coverage scripts and reporter output into the frontend**

```json
{
  "scripts": {
    "test:coverage": "vitest --run --coverage --maxWorkers=50% --minWorkers=1"
  }
}
```

```ts
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: './src/test/setup.ts',
  coverage: {
    provider: 'v8',
    reporter: ['text-summary', 'json-summary', 'html'],
    reportsDirectory: '../../tmp/test-governance/coverage/frontend',
  },
}
```

```json
{
  "scripts": {
    "coverage:frontend": "node ../scripts/node/verify-coverage.js frontend"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^3.2.4"
  }
}
```

- [ ] **Step 6: Refresh the frontend lockfile**

Run:

```bash
rtk pnpm install --dir web
```

Expected:

- `web/pnpm-lock.yaml` updates to include `@vitest/coverage-v8`.

- [ ] **Step 7: Re-run the coverage CLI unit tests and verify GREEN**

Run:

```bash
rtk node --test scripts/node/verify-coverage/_tests/cli.test.js
```

Expected:

- PASS for the CLI default and frontend aggregation assertions.

### Task 2: Extend `verify-coverage` With Backend Coverage Commands And Threshold Enforcement

**Files:**
- Modify: `scripts/node/verify-coverage.js`
- Modify: `scripts/node/verify-coverage/_tests/cli.test.js`

- [ ] **Step 1: Add failing tests for backend command composition, local tool preflight, and package threshold parsing**

```js
const {
  buildBackendCommands,
  collectBackendCoverageFailures,
  ensureCargoLlvmCovInstalled,
} = require('../../verify-coverage.js');

test('buildBackendCommands emits one cargo llvm-cov command per protected package', () => {
  const repoRoot = '/repo-root';

  assert.deepEqual(buildBackendCommands({ repoRoot, cargoParallelism: 4 }), [
    {
      label: 'backend-coverage-control-plane',
      command: 'cargo',
      args: ['llvm-cov', '--package', 'control-plane', '--json', '--summary-only', '--output-path', path.join(repoRoot, 'tmp', 'test-governance', 'coverage', 'backend', 'control-plane.json')],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4' },
    },
    {
      label: 'backend-coverage-storage-pg',
      command: 'cargo',
      args: ['llvm-cov', '--package', 'storage-pg', '--json', '--summary-only', '--output-path', path.join(repoRoot, 'tmp', 'test-governance', 'coverage', 'backend', 'storage-pg.json')],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4' },
    },
    {
      label: 'backend-coverage-api-server',
      command: 'cargo',
      args: ['llvm-cov', '--package', 'api-server', '--json', '--summary-only', '--output-path', path.join(repoRoot, 'tmp', 'test-governance', 'coverage', 'backend', 'api-server.json')],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4' },
    },
  ]);
});

test('collectBackendCoverageFailures compares line coverage per package only', () => {
  const summaries = {
    'control-plane': { data: [{ totals: { lines: { percent: 71 } } }] },
    'storage-pg': { data: [{ totals: { lines: { percent: 68 } } }] },
    'api-server': { data: [{ totals: { lines: { percent: 61 } } }] },
  };

  assert.deepEqual(collectBackendCoverageFailures(summaries), []);
});

test('ensureCargoLlvmCovInstalled throws an actionable error when the cargo subcommand is absent', () => {
  assert.throws(
    () => ensureCargoLlvmCovInstalled(() => ({ status: 101, stdout: '', stderr: 'no such command: llvm-cov' })),
    /cargo llvm-cov is required/u
  );
});
```

- [ ] **Step 2: Run the test file again and verify RED on the missing backend exports**

Run:

```bash
rtk node --test scripts/node/verify-coverage/_tests/cli.test.js
```

Expected:

- FAIL on missing backend helpers or mismatched command arrays.

- [ ] **Step 3: Implement backend command builders, JSON readers, and the `cargo llvm-cov` preflight**

```js
function ensureCargoLlvmCovInstalled(spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('cargo', ['llvm-cov', '--help'], {
    cwd: path.join(getRepoRoot(), 'api'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(
      'cargo llvm-cov is required for backend coverage. Install it with: cargo install cargo-llvm-cov --locked'
    );
  }
}

function buildBackendCommands({ repoRoot, cargoParallelism }) {
  return backendThresholds.map((entry) => ({
    label: `backend-coverage-${entry.key}`,
    command: 'cargo',
    args: [
      'llvm-cov',
      '--package',
      entry.packageName,
      '--json',
      '--summary-only',
      '--output-path',
      path.join(repoRoot, COVERAGE_ROOT, 'backend', `${entry.key}.json`),
    ],
    cwd: 'api',
    env: { CARGO_BUILD_JOBS: String(cargoParallelism) },
  }));
}
```

- [ ] **Step 4: Make `main()` support `frontend` / `backend` / `all` and evaluate threshold failures after command execution**

```js
function main(argv = [], deps = {}) {
  const options = parseCliArgs(argv);
  const repoRoot = deps.repoRoot || getRepoRoot();

  if (options.target === 'backend' || options.target === 'all') {
    ensureCargoLlvmCovInstalled(deps.preflightSpawnSyncImpl);
  }

  const commands = [];

  if (options.target === 'frontend' || options.target === 'all') {
    commands.push(buildFrontendCommand({ repoRoot }));
  }

  if (options.target === 'backend' || options.target === 'all') {
    commands.push(...buildBackendCommands({ repoRoot, cargoParallelism: getCargoParallelism() }));
  }

  const status = runCommandSequence({ repoRoot, scope: `verify-coverage-${options.target}`, commands, ...deps });

  if (status !== 0) {
    return status;
  }

  return reportCoverageThresholds({ repoRoot, target: options.target, writeStderr: deps.writeStderr });
}
```

- [ ] **Step 5: Re-run the coverage CLI unit tests and verify GREEN**

Run:

```bash
rtk node --test scripts/node/verify-coverage/_tests/cli.test.js
```

Expected:

- PASS for frontend and backend command/threshold assertions.

### Task 3: Add The CI Wrapper And GitHub Actions Workflow

**Files:**
- Create: `scripts/node/verify-ci.js`
- Create: `scripts/node/verify-ci/_tests/cli.test.js`
- Create: `.github/workflows/verify.yml`

- [ ] **Step 1: Write failing tests for repo CI command composition**

```js
const { buildCommands, main } = require('../../verify-ci.js');

test('buildCommands composes repo full gate and coverage gate', () => {
  const repoRoot = '/repo-root';

  assert.deepEqual(buildCommands({ repoRoot }), [
    {
      label: 'ci-verify-repo',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-repo.js')],
      cwd: repoRoot,
    },
    {
      label: 'ci-verify-coverage',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-coverage.js'), 'all'],
      cwd: repoRoot,
    },
  ]);
});
```

- [ ] **Step 2: Run the CI wrapper tests and verify RED**

Run:

```bash
rtk node --test scripts/node/verify-ci/_tests/cli.test.js
```

Expected:

- FAIL with `Cannot find module '../../verify-ci.js'`.

- [ ] **Step 3: Implement `verify-ci.js` on top of the shared warning runner**

```js
function buildCommands({ repoRoot }) {
  return [
    {
      label: 'ci-verify-repo',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-repo.js')],
      cwd: repoRoot,
    },
    {
      label: 'ci-verify-coverage',
      command: process.execPath,
      args: [path.join(repoRoot, 'scripts', 'node', 'verify-coverage.js'), 'all'],
      cwd: repoRoot,
    },
  ];
}
```

- [ ] **Step 4: Add the GitHub Actions workflow that installs toolchains and delegates to `verify-ci`**

```yaml
name: verify

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - run: pnpm --dir web install --frozen-lockfile
      - uses: dtolnay/rust-toolchain@stable
      - uses: taiki-e/install-action@cargo-llvm-cov
      - run: node scripts/node/verify-ci.js
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-governance-artifacts
          path: tmp/test-governance
```

- [ ] **Step 5: Re-run the CI wrapper unit tests and verify GREEN**

Run:

```bash
rtk node --test scripts/node/verify-ci/_tests/cli.test.js
```

Expected:

- PASS for the wrapper command ordering assertions.

### Task 4: Update Docs And Run Full Third-Phase Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-04-19-ci-coverage-implementation.md`

- [ ] **Step 1: Update the README verification section to document coverage and CI entrypoints**

````md
### Coverage

```bash
node scripts/node/verify-coverage.js frontend
node scripts/node/verify-coverage.js backend
node scripts/node/verify-coverage.js all
```

### CI

```bash
node scripts/node/verify-ci.js
```
````

- [ ] **Step 2: Run the wrapper unit tests together**

Run:

```bash
rtk node --test scripts/node/verify-coverage/_tests/cli.test.js scripts/node/verify-ci/_tests/cli.test.js
```

Expected:

- PASS for all CLI command-shape and threshold-evaluation tests.

- [ ] **Step 3: Run the frontend coverage gate for real**

Run:

```bash
rtk node scripts/node/verify-coverage.js frontend
```

Expected:

- PASS if the aggregated `agent-flow` and `settings` metrics meet the configured thresholds.
- Coverage artifacts appear under `tmp/test-governance/coverage/frontend/`.

- [ ] **Step 4: Install `cargo-llvm-cov` locally if it is missing**

Run:

```bash
rtk cargo llvm-cov --help
```

If the command fails with `no such command: llvm-cov`, run:

```bash
rtk cargo install cargo-llvm-cov --locked
```

Expected:

- `cargo llvm-cov --help` exits successfully before backend coverage verification.

- [ ] **Step 5: Run the backend coverage gate for real**

Run:

```bash
rtk node scripts/node/verify-coverage.js backend
```

Expected:

- PASS if `control-plane`, `storage-pg`, and `api-server` line coverage meet thresholds.
- JSON artifacts appear under `tmp/test-governance/coverage/backend/`.

- [ ] **Step 6: Run the repository CI wrapper for real**

Run:

```bash
rtk node scripts/node/verify-ci.js
```

Expected:

- PASS after executing `verify-repo` and `verify-coverage all` in sequence.

- [ ] **Step 7: Update this plan with the real verification results**

Add a `## Verification Results` section summarizing:

- wrapper `node:test` results
- frontend coverage gate result
- backend coverage gate result
- `verify-ci` result
- any local prerequisite installed during validation

- [ ] **Step 8: Commit the third-phase implementation**

Run:

```bash
rtk git add scripts/node/testing/coverage-thresholds.js \
  scripts/node/verify-coverage.js \
  scripts/node/verify-coverage/_tests/cli.test.js \
  scripts/node/verify-ci.js \
  scripts/node/verify-ci/_tests/cli.test.js \
  .github/workflows/verify.yml \
  README.md \
  web/package.json \
  web/app/package.json \
  web/app/vite.config.ts \
  web/pnpm-lock.yaml \
  docs/superpowers/plans/2026-04-19-ci-coverage-implementation.md
rtk git commit -m "feat(ci): add coverage and repository verify workflow"
```

Expected:

- A clean commit containing the coverage gate, CI wrapper, workflow, docs, and recorded verification results.
