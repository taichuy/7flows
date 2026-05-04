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
