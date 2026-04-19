const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseCliArgs,
  buildFrontendCommand,
  collectFrontendCoverageFailures,
  buildBackendCommands,
  collectBackendCoverageFailures,
  ensureCargoLlvmCovInstalled,
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
    total: {
      lines: { pct: 91 },
      functions: { pct: 90 },
      statements: { pct: 92 },
      branches: { pct: 80 },
    },
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
    '/repo/web/app/src/features/dashboard/pages/DashboardPage.tsx': {
      lines: { pct: 10 },
      functions: { pct: 10 },
      statements: { pct: 10 },
      branches: { pct: 10 },
    },
  };

  assert.deepEqual(collectFrontendCoverageFailures(summary), []);
});

test('buildBackendCommands emits one cargo llvm-cov command per protected package', () => {
  const repoRoot = '/repo-root';

  assert.deepEqual(buildBackendCommands({ repoRoot, cargoParallelism: 4 }), [
    {
      label: 'backend-coverage-control-plane',
      command: 'cargo',
      args: [
        'llvm-cov',
        '--package',
        'control-plane',
        '--json',
        '--summary-only',
        '--output-path',
        '/repo-root/tmp/test-governance/coverage/backend/control-plane.json',
      ],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4' },
    },
    {
      label: 'backend-coverage-storage-pg',
      command: 'cargo',
      args: [
        'llvm-cov',
        '--package',
        'storage-pg',
        '--json',
        '--summary-only',
        '--output-path',
        '/repo-root/tmp/test-governance/coverage/backend/storage-pg.json',
      ],
      cwd: 'api',
      env: { CARGO_BUILD_JOBS: '4' },
    },
    {
      label: 'backend-coverage-api-server',
      command: 'cargo',
      args: [
        'llvm-cov',
        '--package',
        'api-server',
        '--json',
        '--summary-only',
        '--output-path',
        '/repo-root/tmp/test-governance/coverage/backend/api-server.json',
      ],
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
