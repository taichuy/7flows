const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildDriftStepOutputs } = require('./check-dependabot-drift.js');
const { buildSubmissionStepOutputs } = require('./submit-dependency-snapshots');

const repoRoot = path.resolve(__dirname, '..');

function readWorkflow(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

function listWorkflowJobOutputKeys(workflowSource, stepId) {
  return [...workflowSource.matchAll(new RegExp(`^\\s+([a-z0-9_]+): \\\${{ steps\\.${stepId}\\.outputs\\.[^}]+ }}$`, 'gm'))]
    .map((match) => match[1])
    .sort();
}

test('GitHub Security Drift exposes every script step output at the job level', () => {
  const workflowSource = readWorkflow('.github/workflows/github-security-drift.yml');
  const outputKeys = listWorkflowJobOutputKeys(workflowSource, 'drift');
  const expectedKeys = ['status', ...Object.keys(buildDriftStepOutputs({}))].sort();

  assert.deepEqual(outputKeys, expectedKeys);
});

test('Dependency Graph Submission exposes every script step output at the job level', () => {
  const workflowSource = readWorkflow('.github/workflows/dependency-graph-submission.yml');
  const outputKeys = listWorkflowJobOutputKeys(workflowSource, 'submit');
  const expectedKeys = ['status', ...Object.keys(buildSubmissionStepOutputs({}))].sort();

  assert.deepEqual(outputKeys, expectedKeys);
});
