const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildGateCommand,
  buildIssueTitle,
  buildIssueLabels,
  parseBooleanInput,
  runQualityGate,
} = require('../core.js');

test('buildGateCommand maps supported scopes to repository verify scripts', () => {
  const repoRoot = '/repo';

  assert.deepEqual(buildGateCommand({ repoRoot, scope: 'ci' }), {
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts', 'node', 'verify-ci.js')],
    cwd: repoRoot,
  });

  assert.deepEqual(buildGateCommand({ repoRoot, scope: 'coverage' }), {
    command: process.execPath,
    args: [path.join(repoRoot, 'scripts', 'node', 'verify-coverage.js'), 'all'],
    cwd: repoRoot,
  });

  assert.throws(
    () => buildGateCommand({ repoRoot, scope: 'unknown' }),
    /Unknown quality gate scope: unknown/u
  );
});

test('parseBooleanInput accepts GitHub action boolean strings only', () => {
  assert.equal(parseBooleanInput('true'), true);
  assert.equal(parseBooleanInput('false'), false);
  assert.equal(parseBooleanInput(undefined), false);
  assert.throws(() => parseBooleanInput('yes'), /Expected boolean input/u);
});

test('issue title and labels describe one report run', () => {
  const title = buildIssueTitle({
    reportType: 'ci',
    timestamp: '2026-05-03 23:40',
    branch: 'main',
    shortSha: 'abc1234',
    status: 'failed',
    environment: '',
  });

  assert.equal(title, '[Quality Gate][CI] 2026-05-03 23:40 main abc1234 failed');
  assert.deepEqual(buildIssueLabels({ reportType: 'ci', status: 'failed' }), [
    'quality-gate',
    'ci-report',
    'failed',
  ]);
});

test('runQualityGate writes reports and does not create an issue when publishing is disabled', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-quality-gate-'));
  const createdIssues = [];

  const status = await runQualityGate({
    repoRoot,
    scope: 'backend',
    reportType: 'ci',
    publishIssue: false,
    env: {
      GITHUB_ACTOR: 'taichu',
      GITHUB_REF_NAME: 'main',
      GITHUB_REPOSITORY: 'taichuy/1flowbase',
      GITHUB_RUN_ID: '123',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: 'abcdef1234567890',
      GITHUB_WORKFLOW: 'manual quality gate',
    },
    spawnSyncImpl(command, args, options) {
      assert.equal(command, process.execPath);
      assert.deepEqual(args, [path.join(repoRoot, 'scripts', 'node', 'verify-backend.js')]);
      assert.equal(options.cwd, repoRoot);
      return {
        status: 0,
        stdout: 'backend passed\n',
        stderr: '',
      };
    },
    createIssueImpl(issue) {
      createdIssues.push(issue);
      return { html_url: 'https://github.com/taichuy/1flowbase/issues/1' };
    },
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status.exitCode, 0);
  assert.equal(status.status, 'passed');
  assert.equal(status.issueUrl, '');
  assert.equal(createdIssues.length, 0);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tmp', 'test-governance', 'quality-gate-report.md')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'tmp', 'test-governance', 'quality-gate-report.json')), true);
  assert.match(
    fs.readFileSync(path.join(repoRoot, 'tmp', 'test-governance', 'quality-gate.latest.log'), 'utf8'),
    /backend passed/u
  );
});

test('runQualityGate creates a new issue when publishing is enabled even if the gate fails', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-quality-gate-'));
  const createdIssues = [];

  const status = await runQualityGate({
    repoRoot,
    scope: 'repo',
    reportType: 'cd',
    environmentName: 'staging',
    publishIssue: true,
    githubToken: 'token',
    env: {
      GITHUB_ACTOR: 'taichu',
      GITHUB_REF_NAME: 'release',
      GITHUB_REPOSITORY: 'taichuy/1flowbase',
      GITHUB_RUN_ID: '456',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: '1234567890abcdef',
      GITHUB_WORKFLOW: 'manual quality gate',
    },
    spawnSyncImpl() {
      return {
        status: 1,
        stdout: 'repo failed\n',
        stderr: 'failure detail\n',
      };
    },
    createIssueImpl(issue) {
      createdIssues.push(issue);
      return { html_url: 'https://github.com/taichuy/1flowbase/issues/2' };
    },
    listOpenQualityGateIssuesImpl() {
      return [];
    },
    nowImpl: () => new Date('2026-05-03T15:40:00Z'),
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status.exitCode, 1);
  assert.equal(status.status, 'failed');
  assert.equal(status.issueUrl, 'https://github.com/taichuy/1flowbase/issues/2');
  assert.equal(createdIssues.length, 1);
  assert.equal(createdIssues[0].title, '[Quality Gate][CD] 2026-05-03 15:40 staging 1234567 failed');
  assert.deepEqual(createdIssues[0].labels, ['quality-gate', 'cd-report', 'failed']);
  assert.match(createdIssues[0].body, /Status: failed/u);
  assert.match(createdIssues[0].body, /Environment: staging/u);
  assert.match(createdIssues[0].body, /## Failure Excerpt/u);
  assert.match(createdIssues[0].body, /failure detail/u);
});

test('runQualityGate publishes a complete passed report with coverage details', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-quality-gate-complete-'));
  const createdIssues = [];

  const writeJson = (relativePath, value) => {
    const filePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  };

  const frontendSummary = {
    total: {
      lines: { total: 100, covered: 82, pct: 82 },
      functions: { total: 40, covered: 32, pct: 80 },
      statements: { total: 100, covered: 82, pct: 82 },
      branches: { total: 50, covered: 39, pct: 78 },
    },
  };
  const backendSummary = {
    data: [{
      totals: {
        lines: { count: 1000, covered: 930, percent: 93 },
        functions: { count: 120, covered: 108, percent: 90 },
        branches: { count: 80, covered: 64, percent: 80 },
        regions: { count: 1500, covered: 1350, percent: 90 },
      },
    }],
  };

  const status = await runQualityGate({
    repoRoot,
    scope: 'ci',
    reportType: 'ci',
    publishIssue: true,
    githubToken: 'token',
    env: {
      GITHUB_ACTOR: 'taichu',
      GITHUB_REF_NAME: 'latest',
      GITHUB_REPOSITORY: 'taichuy/1flowbase',
      GITHUB_RUN_ID: '791',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: 'abcdef1234567890',
      GITHUB_WORKFLOW: 'verify',
    },
    spawnSyncImpl() {
      writeJson('tmp/test-governance/coverage/frontend/coverage-summary.json', frontendSummary);
      writeJson('tmp/test-governance/coverage/backend/api-server.json', backendSummary);
      return {
        status: 0,
        stdout: 'repo passed\nCoverage thresholds passed for all.\n',
        stderr: '',
      };
    },
    createIssueImpl(issue) {
      createdIssues.push(issue);
      return { html_url: 'https://github.com/taichuy/1flowbase/issues/5' };
    },
    listOpenQualityGateIssuesImpl() {
      return [];
    },
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status.status, 'passed');
  assert.equal(createdIssues.length, 1);
  assert.match(createdIssues[0].body, /## Result Summary/u);
  assert.match(createdIssues[0].body, /- Status: passed/u);
  assert.match(createdIssues[0].body, /- Exit code: 0/u);
  assert.match(createdIssues[0].body, /## Warnings/u);
  assert.match(createdIssues[0].body, /No warning logs were captured/u);
  assert.match(createdIssues[0].body, /## Coverage/u);
  assert.match(createdIssues[0].body, /frontend total: lines 82\.00%, functions 80\.00%, statements 82\.00%, branches 78\.00%/u);
  assert.match(createdIssues[0].body, /api-server: lines 93\.00%, functions 90\.00%, branches 80\.00%, regions 90\.00%/u);
  assert.match(createdIssues[0].body, /## Evidence/u);
  assert.match(createdIssues[0].body, /tmp\/test-governance\/quality-gate\.latest\.log/u);
});

test('runQualityGate closes older open quality gate issues after publishing the latest report', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-quality-gate-'));
  const closedIssues = [];

  const status = await runQualityGate({
    repoRoot,
    scope: 'repo',
    reportType: 'ci',
    publishIssue: true,
    githubToken: 'token',
    env: {
      GITHUB_ACTOR: 'taichu',
      GITHUB_REF_NAME: 'main',
      GITHUB_REPOSITORY: 'taichuy/1flowbase',
      GITHUB_RUN_ID: '457',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: '1234567890abcdef',
      GITHUB_WORKFLOW: 'manual quality gate',
    },
    spawnSyncImpl() {
      return {
        status: 0,
        stdout: 'repo passed\n',
        stderr: '',
      };
    },
    createIssueImpl() {
      return {
        html_url: 'https://github.com/taichuy/1flowbase/issues/12',
        number: 12,
      };
    },
    listOpenQualityGateIssuesImpl() {
      return [
        { number: 10, html_url: 'https://github.com/taichuy/1flowbase/issues/10' },
        { number: 11, html_url: 'https://github.com/taichuy/1flowbase/issues/11' },
        { number: 12, html_url: 'https://github.com/taichuy/1flowbase/issues/12' },
      ];
    },
    closeIssueImpl(issue) {
      closedIssues.push(issue.number);
      return {};
    },
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(status.issueUrl, 'https://github.com/taichuy/1flowbase/issues/12');
  assert.deepEqual(closedIssues, [10, 11]);
});

test('runQualityGate strips ANSI control sequences from published failure excerpts', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-quality-gate-'));
  const createdIssues = [];

  await runQualityGate({
    repoRoot,
    scope: 'ci',
    reportType: 'ci',
    publishIssue: true,
    githubToken: 'token',
    env: {
      GITHUB_ACTOR: 'taichu',
      GITHUB_REF_NAME: 'main',
      GITHUB_REPOSITORY: 'taichuy/1flowbase',
      GITHUB_RUN_ID: '789',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: 'abcdef1234567890',
      GITHUB_WORKFLOW: 'verify',
    },
    spawnSyncImpl() {
      return {
        status: 1,
        stdout: '\u001b[2mdist/\u001b[22m\u001b[36masset.js\u001b[39m\n',
        stderr: '\u001b[31mDiff in api/apps/api-server/src/_tests/config_tests.rs:77\u001b[39m\n',
      };
    },
    createIssueImpl(issue) {
      createdIssues.push(issue);
      return { html_url: 'https://github.com/taichuy/1flowbase/issues/3' };
    },
    listOpenQualityGateIssuesImpl() {
      return [];
    },
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(createdIssues.length, 1);
  assert.doesNotMatch(createdIssues[0].body, /\u001b\[/u);
  assert.match(createdIssues[0].body, /dist\/asset\.js/u);
  assert.match(createdIssues[0].body, /Diff in api\/apps\/api-server\/src\/_tests\/config_tests\.rs:77/u);
});

test('runQualityGate publishes the rust failure block when cargo stderr hides it at the tail', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oneflowbase-quality-gate-'));
  const createdIssues = [];
  const compileTail = Array.from({ length: 100 }, (_, index) => `Compiling crate-${index}`).join('\n');

  await runQualityGate({
    repoRoot,
    scope: 'ci',
    reportType: 'ci',
    publishIssue: true,
    githubToken: 'token',
    env: {
      GITHUB_ACTOR: 'taichu',
      GITHUB_REF_NAME: 'main',
      GITHUB_REPOSITORY: 'taichuy/1flowbase',
      GITHUB_RUN_ID: '790',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: 'abcdef1234567890',
      GITHUB_WORKFLOW: 'verify',
    },
    spawnSyncImpl() {
      return {
        status: 1,
        stdout: [
          'test _tests::workspace_routes::workspaces_route_lists_accessible_workspaces_with_current_marker ... FAILED',
          '',
          'failures:',
          '',
          "thread '_tests::workspace_routes::workspaces_route_lists_accessible_workspaces_with_current_marker' panicked at apps/api-server/src/_tests/support/auth.rs:83:10:",
          'called `Result::unwrap()` on an `Err` value: PoolTimedOut',
          '',
          'test result: FAILED. 68 passed; 111 failed; 0 ignored; 0 measured; 0 filtered out; finished in 3330.75s',
        ].join('\n'),
        stderr: `${compileTail}\nerror: test failed, to rerun pass \`-p api-server --lib\`\n`,
      };
    },
    createIssueImpl(issue) {
      createdIssues.push(issue);
      return { html_url: 'https://github.com/taichuy/1flowbase/issues/4' };
    },
    listOpenQualityGateIssuesImpl() {
      return [];
    },
    writeStdout() {},
    writeStderr() {},
  });

  assert.equal(createdIssues.length, 1);
  assert.match(createdIssues[0].body, /PoolTimedOut/u);
  assert.match(createdIssues[0].body, /test result: FAILED\. 68 passed; 111 failed/u);
  assert.doesNotMatch(createdIssues[0].body, /Compiling crate-99/u);
});
