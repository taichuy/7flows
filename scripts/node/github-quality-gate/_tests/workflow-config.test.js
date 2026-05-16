const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function readVerifyWorkflow() {
  return fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'verify.yml'), 'utf8');
}

function readQualityGateWorkflow() {
  return fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'quality-gate.yml'), 'utf8');
}

function readQualityGateAction() {
  return fs.readFileSync(path.join(repoRoot, '.github', 'actions', 'quality-gate', 'action.yml'), 'utf8');
}

function readGitHubReadme() {
  return fs.readFileSync(path.join(repoRoot, '.github', 'README.md'), 'utf8');
}

function extractPushBranches(workflow) {
  const match = workflow.match(/push:\n\s+branches:\n(?<branches>(?:\s+- .+\n)+)/u);
  assert.ok(match, 'verify workflow must declare push branches');

  return match.groups.branches
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^- /u, ''))
    .filter(Boolean);
}

test('verify workflow runs on main and latest but only publishes quality reports on latest pushes', () => {
  const workflow = readVerifyWorkflow();

  assert.deepEqual(extractPushBranches(workflow), ['main', 'latest']);
  assert.match(workflow, /concurrency:\n\s+group: verify-\$\{\{ github\.ref_name \}\}\n\s+cancel-in-progress: true/u);
  assert.match(
    workflow,
    /INPUT_PUBLISH_ISSUE: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/latest' \}\}/u
  );
  assert.doesNotMatch(workflow, /INPUT_PUBLISH_ISSUE: .+refs\/heads\/main/u);
});

test('verify workflow runs quality gate scopes in parallel before one aggregate report', () => {
  const workflow = readVerifyWorkflow();

  assert.match(workflow, /repo-gate:\n\s+runs-on: ubuntu-latest/u);
  assert.match(workflow, /backend-consistency-gate:\n\s+runs-on: ubuntu-latest/u);
  assert.match(workflow, /coverage-gate:\n\s+runs-on: ubuntu-latest/u);
  assert.match(workflow, /verify:\n\s+needs:\n\s+- repo-gate\n\s+- backend-consistency-gate\n\s+- coverage-gate/u);
  assert.match(workflow, /scope: repo/u);
  assert.match(workflow, /scope: backend-consistency/u);
  assert.match(workflow, /scope: coverage/u);
  assert.match(workflow, /name: test-governance-repo/u);
  assert.match(workflow, /name: test-governance-backend-consistency/u);
  assert.match(workflow, /name: test-governance-coverage/u);
  assert.match(workflow, /merge-multiple: false/u);
  assert.match(workflow, /node scripts\/node\/github-quality-gate-aggregate\.js/u);
});

test('verify workflow runs React Doctor as a frontend quality gate', () => {
  const workflow = readVerifyWorkflow();

  assert.match(workflow, /react-doctor-gate:\n\s+runs-on: ubuntu-latest/u);
  assert.match(workflow, /fetch-depth: 0/u);
  assert.match(workflow, /git show-ref --verify --quiet refs\/heads\/main \|\| git branch main origin\/main/u);
  assert.match(workflow, /uses: millionco\/react-doctor@main/u);
  assert.match(workflow, /directory: web\/app/u);
  assert.match(workflow, /diff: main/u);
  assert.match(workflow, /fail-on: warning/u);
  assert.match(workflow, /offline: "true"/u);
  assert.match(workflow, /node-version: 24/u);
  assert.doesNotMatch(workflow, /github-token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
  assert.match(workflow, /verify:\n\s+needs:\n\s+- repo-gate\n\s+- backend-consistency-gate\n\s+- coverage-gate\n\s+- react-doctor-gate/u);
});

test('GitHub automation docs describe latest-only issue publishing', () => {
  const readme = readGitHubReadme();

  assert.match(readme, /push` to `latest`/u);
  assert.match(
    readme,
    /INPUT_PUBLISH_ISSUE: \$\{\{ github\.event_name == 'push' && github\.ref == 'refs\/heads\/latest' \}\}/u
  );
  assert.match(readme, /creates a GitHub Issue only for `latest` branch pushes/u);
  assert.doesNotMatch(readme, /main branch push failures/u);
  assert.doesNotMatch(readme, /refs\/heads\/main/u);
});

test('GitHub automation docs describe the React Doctor frontend gate', () => {
  const readme = readGitHubReadme();

  assert.match(readme, /React Doctor frontend gates/u);
  assert.match(readme, /directory: web\/app/u);
  assert.match(readme, /diff: main/u);
  assert.match(readme, /fail-on: warning/u);
  assert.match(readme, /offline: "true"/u);
});

test('quality gate workflow supports dispatch targets and nightly latest CI defaults', () => {
  const workflow = readQualityGateWorkflow();

  assert.match(workflow, /name: quality gate/u);
  assert.match(workflow, /target_branch:\n\s+description: Target branch\n\s+type: choice\n\s+default: latest\n\s+options:\n\s+- latest\n\s+- main/u);
  assert.match(
    workflow,
    /concurrency:\n\s+group: quality-gate-\$\{\{ github\.event_name \}\}-\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.target_branch \|\| 'latest' \}\}\n\s+cancel-in-progress: true/u
  );
  assert.match(workflow, /schedule:\n(?:\s+# .+\n)?\s+- cron: '0 18 \* \* \*'/u);
  assert.match(workflow, /QUALITY_GATE_TARGET_BRANCH: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.target_branch \|\| 'latest' \}\}/u);
  assert.match(workflow, /QUALITY_GATE_SCOPE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.scope \|\| 'ci' \}\}/u);
  assert.match(workflow, /QUALITY_GATE_REPORT_TYPE: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.report_type \|\| 'ci' \}\}/u);
  assert.match(workflow, /QUALITY_GATE_SCHEDULED_ENVIRONMENT: nightly-latest/u);
  assert.match(workflow, /GITHUB_REF_NAME: \$\{\{ env\.QUALITY_GATE_TARGET_BRANCH \}\}/u);
  assert.match(workflow, /GITHUB_SHA: \$\{\{ env\.QUALITY_GATE_TARGET_SHA \}\}/u);
  assert.match(workflow, /environment: \$\{\{ github\.event_name == 'schedule' && env\.QUALITY_GATE_SCHEDULED_ENVIRONMENT \|\| inputs\.environment \}\}/u);
});

test('quality gate workflow runs ci scope as parallel component gates before one published aggregate report', () => {
  const workflow = readQualityGateWorkflow();

  assert.match(workflow, /repo-gate:\n\s+if: \$\{\{ github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.scope == 'ci'\) \}\}/u);
  assert.match(workflow, /backend-consistency-gate:\n\s+if: \$\{\{ github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.scope == 'ci'\) \}\}/u);
  assert.match(workflow, /coverage-gate:\n\s+if: \$\{\{ github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.scope == 'ci'\) \}\}/u);
  assert.match(workflow, /aggregate:\n\s+if: \$\{\{ always\(\) && \(github\.event_name == 'schedule' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.scope == 'ci'\)\) \}\}/u);
  assert.match(workflow, /aggregate:\n(?:.*\n)*?\s+needs:\n\s+- repo-gate\n\s+- backend-consistency-gate\n\s+- coverage-gate/u);
  assert.match(workflow, /scope: repo/u);
  assert.match(workflow, /scope: backend-consistency/u);
  assert.match(workflow, /scope: coverage/u);
  assert.match(workflow, /publish_issue: "false"/u);
  assert.match(workflow, /INPUT_PUBLISH_ISSUE: "true"/u);
  assert.match(workflow, /node scripts\/node\/github-quality-gate-aggregate\.js/u);
  assert.match(workflow, /name: test-governance-repo/u);
  assert.match(workflow, /name: test-governance-backend-consistency/u);
  assert.match(workflow, /name: test-governance-coverage/u);
  assert.match(workflow, /name: test-governance-artifacts/u);
});

test('quality gate workflow keeps non-ci dispatch scopes on a single targeted job', () => {
  const workflow = readQualityGateWorkflow();

  assert.match(workflow, /single-scope-gate:\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.scope != 'ci' \}\}/u);
  assert.match(workflow, /scope: \$\{\{ env\.QUALITY_GATE_SCOPE \}\}/u);
  assert.match(workflow, /publish_issue: "true"/u);
});

test('quality gate action clears stale middleware containers before starting postgres', () => {
  const action = readQualityGateAction();

  assert.match(action, /docker compose -f docker\/docker-compose\.middleware\.yaml down --remove-orphans/u);
  assert.match(action, /docker-compose -f docker\/docker-compose\.middleware\.yaml down --remove-orphans/u);
});
