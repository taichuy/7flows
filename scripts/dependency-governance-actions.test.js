const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildRecommendedActionsOutputs,
  writeGitHubOutputs,
} = require('./dependency-governance-actions');

test('buildRecommendedActionsOutputs keeps priority order and top action stable', () => {
  const outputs = buildRecommendedActionsOutputs([
    {
      priority: 2,
      audience: 'workflow_maintainer',
      code: 'rerun_dependency_graph_submission',
      summary: '重跑 workflow。',
      rationale: '需要最新 artifact。',
      roots: ['api'],
    },
    {
      priority: 1,
      audience: 'repository_admin',
      code: 'enable_dependency_graph',
      summary: '启用 Dependency graph。',
      rationale: '仓库设置阻塞。',
      roots: ['api', 'web'],
    },
  ]);

  assert.equal(outputs.recommended_actions_count, '2');
  assert.equal(outputs.primary_recommended_action_priority, '1');
  assert.equal(outputs.primary_recommended_action_audience, 'repository_admin');
  assert.equal(outputs.primary_recommended_action_code, 'enable_dependency_graph');
  assert.equal(outputs.primary_recommended_action_summary, '启用 Dependency graph。');
  assert.equal(outputs.primary_recommended_action_rationale, '仓库设置阻塞。');
  assert.equal(outputs.primary_recommended_action_roots_json, JSON.stringify(['api', 'web']));
  assert.deepEqual(JSON.parse(outputs.recommended_actions_json), [
    {
      priority: 1,
      audience: 'repository_admin',
      code: 'enable_dependency_graph',
      summary: '启用 Dependency graph。',
      rationale: '仓库设置阻塞。',
      roots: ['api', 'web'],
    },
    {
      priority: 2,
      audience: 'workflow_maintainer',
      code: 'rerun_dependency_graph_submission',
      summary: '重跑 workflow。',
      rationale: '需要最新 artifact。',
      roots: ['api'],
    },
  ]);
});

test('writeGitHubOutputs writes multiline-safe output entries', () => {
  const outputPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-governance-actions-')),
    'github-output.txt',
  );

  writeGitHubOutputs(
    {
      recommended_actions_count: '1',
      primary_recommended_action_summary: '第一行\n第二行',
    },
    outputPath,
  );

  const content = fs.readFileSync(outputPath, 'utf8');
  assert.match(content, /recommended_actions_count<<EOF_RECOMMENDED_ACTIONS_COUNT/);
  assert.match(content, /primary_recommended_action_summary<<EOF_PRIMARY_RECOMMENDED_ACTION_SUMMARY/);
  assert.match(content, /第一行\n第二行/);
});
