const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildDriftRecommendedActions,
  buildRepositorySecurityAndAnalysisMarkdownLines,
  buildRecommendedActionsOutputs,
  normalizeRepositorySecurityAndAnalysis,
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
      href: 'https://github.com/taichuy/7flows/settings/security_analysis',
      hrefLabel: '打开仓库安全设置',
      documentationHref:
        'https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph',
      documentationHrefLabel: '查看官方 Dependency graph 指引',
      manualOnly: true,
      manualOnlyReason: 'github_settings_ui',
    },
  ]);

  assert.equal(outputs.recommended_actions_count, '2');
  assert.equal(outputs.primary_recommended_action_priority, '1');
  assert.equal(outputs.primary_recommended_action_audience, 'repository_admin');
  assert.equal(outputs.primary_recommended_action_code, 'enable_dependency_graph');
  assert.equal(outputs.primary_recommended_action_summary, '启用 Dependency graph。');
  assert.equal(outputs.primary_recommended_action_rationale, '仓库设置阻塞。');
  assert.equal(outputs.primary_recommended_action_roots_json, JSON.stringify(['api', 'web']));
  assert.equal(
    outputs.primary_recommended_action_href,
    'https://github.com/taichuy/7flows/settings/security_analysis',
  );
  assert.equal(outputs.primary_recommended_action_href_label, '打开仓库安全设置');
  assert.equal(outputs.primary_recommended_action_manual_only, 'true');
  assert.equal(outputs.primary_recommended_action_manual_only_reason, 'github_settings_ui');
  assert.equal(
    outputs.primary_recommended_action_documentation_href,
    'https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph',
  );
  assert.equal(
    outputs.primary_recommended_action_documentation_href_label,
    '查看官方 Dependency graph 指引',
  );
  assert.deepEqual(JSON.parse(outputs.recommended_actions_json), [
    {
      priority: 1,
      audience: 'repository_admin',
      code: 'enable_dependency_graph',
      summary: '启用 Dependency graph。',
      rationale: '仓库设置阻塞。',
      roots: ['api', 'web'],
      href: 'https://github.com/taichuy/7flows/settings/security_analysis',
      hrefLabel: '打开仓库安全设置',
      documentationHref:
        'https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph',
      documentationHrefLabel: '查看官方 Dependency graph 指引',
      manualOnly: true,
      manualOnlyReason: 'github_settings_ui',
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

test('normalizeRepositorySecurityAndAnalysis preserves missing setting fields explicitly', () => {
  const normalized = normalizeRepositorySecurityAndAnalysis({
    checkedAt: '2026-03-25T05:10:00.000Z',
    raw: {
      dependabot_security_updates: { status: 'disabled' },
      secret_scanning: { status: 'disabled' },
    },
  });

  assert.deepEqual(normalized, {
    checkedAt: '2026-03-25T05:10:00.000Z',
    checkError: null,
    dependencyGraphStatus: null,
    automaticDependencySubmissionStatus: null,
    dependabotSecurityUpdatesStatus: 'disabled',
    availableFields: ['dependabot_security_updates', 'secret_scanning'],
    missingFields: [
      'dependency_graph',
      'automatic_dependency_submission',
      'secret_scanning_non_provider_patterns',
      'secret_scanning_push_protection',
      'secret_scanning_validity_checks',
    ],
    manualVerificationRequired: true,
    manualVerificationReason: 'missing_dependency_graph_fields',
    raw: {
      dependabot_security_updates: { status: 'disabled' },
      secret_scanning: { status: 'disabled' },
    },
  });
});

test('buildRepositorySecurityAndAnalysisMarkdownLines explains missing dependency graph fields', () => {
  const lines = buildRepositorySecurityAndAnalysisMarkdownLines({
    checkedAt: '2026-03-25T05:10:00.000Z',
    raw: {
      dependabot_security_updates: { status: 'disabled' },
      secret_scanning: { status: 'disabled' },
    },
  });

  assert.match(lines.join('\n'), /Repository security & analysis snapshot/);
  assert.match(lines.join('\n'), /dependency graph: `unknown`/);
  assert.match(lines.join('\n'), /automatic dependency submission: `unknown`/);
  assert.match(lines.join('\n'), /dependabot security updates: `disabled`/);
  assert.match(lines.join('\n'), /repo API 未返回字段：`dependency_graph`、`automatic_dependency_submission`/);
  assert.match(lines.join('\n'), /manual verification reason：`missing_dependency_graph_fields`/);
  assert.match(lines.join('\n'), /最终仍以 dependency submission blocker 与 manifest visibility 证据为准/);
  assert.match(lines.join('\n'), /gh api -X PATCH repos\/\{owner\}\/\{repo\}/);
  assert.match(lines.join('\n'), /仍需到 `Settings -> Security & analysis` 人工确认/);
  assert.match(lines.join('\n'), /Enabling the dependency graph/);
  assert.match(lines.join('\n'), /Configuring automatic dependency submission/);
});

test('buildRepositorySecurityAndAnalysisMarkdownLines accepts normalized report payloads', () => {
  const lines = buildRepositorySecurityAndAnalysisMarkdownLines({
    checkedAt: '2026-03-26T07:34:31.191Z',
    dependencyGraphStatus: null,
    automaticDependencySubmissionStatus: null,
    dependabotSecurityUpdatesStatus: null,
    availableFields: [],
    missingFields: ['dependency_graph', 'automatic_dependency_submission'],
    manualVerificationRequired: true,
    manualVerificationReason: 'missing_dependency_graph_fields',
  });

  assert.match(lines.join('\n'), /dependency graph: `unknown`/);
  assert.match(lines.join('\n'), /automatic dependency submission: `unknown`/);
  assert.match(lines.join('\n'), /dependabot security updates: `unknown`/);
  assert.match(lines.join('\n'), /manual verification reason：`missing_dependency_graph_fields`/);
  assert.match(lines.join('\n'), /repo API 缺失这些字段时/);
});

test('buildDriftRecommendedActions prioritizes dependency graph blocker ahead of alerts token setup', () => {
  const actions = buildDriftRecommendedActions({
    missingNativeGraphRoots: [{ rootLabel: 'web', ecosystem: 'pnpm' }],
    dependencySubmissionRoots: [
      { rootLabel: 'api', ecosystem: 'uv' },
      { rootLabel: 'services/compat-dify', ecosystem: 'uv' },
    ],
    alertsUnavailable: true,
    repository: { owner: 'taichuy', repo: '7flows' },
    dependencySubmissionEvidence: {
      report: {
        repositoryBlockerEvidence: {
          kind: 'dependency_graph_disabled',
          rootLabels: ['api', 'services/compat-dify', 'web'],
        },
      },
    },
  });

  assert.deepEqual(
    actions.map((action) => action.code),
    [
      'enable_dependency_graph',
      'configure_dependabot_alerts_token',
      'rerun_dependency_graph_submission',
      'rerun_github_security_drift',
    ],
  );
  assert.match(actions[1].rationale, /submission evidence 已先证明仓库设置阻塞/);
  assert.equal(actions[0].manualOnly, true);
  assert.equal(actions[0].manualOnlyReason, 'github_settings_ui');
  assert.equal(
    actions[0].documentationHref,
    'https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph',
  );
});

test('buildDriftRecommendedActions keeps alerts token first when no repository blocker evidence exists', () => {
  const actions = buildDriftRecommendedActions({
    missingNativeGraphRoots: [{ rootLabel: 'web', ecosystem: 'pnpm' }],
    alertsUnavailable: true,
    repository: { owner: 'taichuy', repo: '7flows' },
  });

  assert.equal(actions[0].code, 'configure_dependabot_alerts_token');
});
