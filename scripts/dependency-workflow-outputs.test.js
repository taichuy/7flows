const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildDriftStepOutputs } = require('./check-dependabot-drift.js');
const { buildIssueSyncStepOutputs } = require('./sync-github-security-drift-issue');
const { buildSubmissionStepOutputs } = require('./submit-dependency-snapshots');

const repoRoot = path.resolve(__dirname, '..');

function readWorkflow(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function listWorkflowJobOutputKeys(workflowSource) {
  return [...workflowSource.matchAll(/^\s+([a-z0-9_]+): \$\{\{ steps\.[a-z0-9_]+\.outputs\.[^}]+ }}$/gm)]
    .map((match) => match[1])
    .sort();
}

test('GitHub Security Drift exposes every script step output at the job level', () => {
  const workflowSource = readWorkflow('.github/workflows/github-security-drift.yml');
  const outputKeys = listWorkflowJobOutputKeys(workflowSource);
  const expectedKeys = [
    'status',
    ...Object.keys(buildDriftStepOutputs({})),
    ...Object.keys(buildIssueSyncStepOutputs()),
  ].sort();

  assert.deepEqual(outputKeys, expectedKeys);
});

test('Dependency Graph Submission exposes every script step output at the job level', () => {
  const workflowSource = readWorkflow('.github/workflows/dependency-graph-submission.yml');
  const outputKeys = listWorkflowJobOutputKeys(workflowSource);
  const expectedKeys = ['status', ...Object.keys(buildSubmissionStepOutputs({}))].sort();

  assert.deepEqual(outputKeys, expectedKeys);
});

test('GitHub Security Drift keeps issue sync running after drift failures', () => {
  const workflowSource = readWorkflow('.github/workflows/github-security-drift.yml');

  assert.match(workflowSource, /issues:\s+write/);
  assert.match(workflowSource, /- name: Sync security drift tracking issue/);
  assert.match(workflowSource, /id: sync_issue/);
  assert.match(workflowSource, /if: always\(\) && hashFiles\('dependabot-drift\.json'\) != ''/);
  assert.match(workflowSource, /node scripts\/sync-github-security-drift-issue\.js --report dependabot-drift\.json/);
  assert.match(workflowSource, /tracking_issue_url: \$\{\{ steps\.sync_issue\.outputs\.tracking_issue_url }}?/);
});
