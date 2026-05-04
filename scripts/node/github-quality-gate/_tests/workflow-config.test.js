const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function readVerifyWorkflow() {
  return fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'verify.yml'), 'utf8');
}

function extractPushBranches(workflow) {
  const match = workflow.match(/push:\n\s+branches:\n(?<branches>(?:\s+- .+\n)+)/u);
  assert.ok(match, 'verify workflow must declare push branches');

  return match.groups.branches
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^- /u, ''))
    .filter(Boolean);
}

test('verify workflow runs and publishes quality reports on latest pushes', () => {
  const workflow = readVerifyWorkflow();

  assert.deepEqual(extractPushBranches(workflow), ['main', 'latest']);
  assert.match(workflow, /github\.ref == 'refs\/heads\/latest'/u);
});
