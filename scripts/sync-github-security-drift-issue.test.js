const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_ISSUE_MARKER,
  buildIssueHistory,
  buildIssueBody,
  buildIssueSyncSummaryLines,
  buildIssueSyncStepOutputs,
  buildIssueStateFingerprint,
  buildIssueTrackingState,
  hasIssueTrackingStateChanged,
  hasExternalBlocker,
  parseIssueHistoryLines,
  parseIssueStateMetadata,
  parseArgs,
  syncIssueFromReport,
  writeStepSummary,
} = require('./sync-github-security-drift-issue');

function createReport(overrides = {}) {
  return {
    generatedAt: '2026-03-26T07:34:37.000Z',
    repository: { owner: 'taichuy', repo: '7flows' },
    defaultBranch: 'taichuy_dev',
    conclusion: {
      kind: 'alerts_unavailable',
      summary: '当前 workflow token 无法读取 Dependabot alerts；请补充 DEPENDABOT_ALERTS_TOKEN。',
    },
    dependabotAlerts: {
      unavailable: true,
      openAlertCount: 0,
      actionableAlertCount: 0,
      alerts: [],
    },
    repositorySecurityAndAnalysis: {
      checkedAt: '2026-03-26T07:34:31.191Z',
      dependencyGraphStatus: null,
      automaticDependencySubmissionStatus: null,
      dependabotSecurityUpdatesStatus: null,
      missingFields: ['dependency_graph', 'automatic_dependency_submission'],
      manualVerificationRequired: true,
      manualVerificationReason: 'missing_dependency_graph_fields',
    },
    dependencySubmissionEvidence: {
      runId: 23582800642,
      htmlUrl: 'https://github.com/taichuy/7flows/actions/runs/23582800642',
      repositoryBlocker:
        'GitHub `Dependency graph` 未开启；workflow 已保留证据并降级为 warning，而不是把当前代码事实误判成实现失败。',
      repositoryBlockerEvidence: {
        kind: 'dependency_graph_disabled',
        status: 404,
        rootLabels: ['api', 'services/compat-dify', 'web'],
        message: 'The Dependency graph is disabled for this repository. Please enable it before submitting snapshots.',
      },
      dependencyGraphVisibility: {
        checkedAt: '2026-03-26T07:34:31.011Z',
        manifestCount: 0,
        visibleRoots: [],
        missingRoots: ['api', 'services/compat-dify', 'web'],
      },
    },
    recommendedActions: [
      {
        priority: 1,
        audience: 'repository_admin',
        code: 'enable_dependency_graph',
        summary: '在 `Settings -> Security & analysis` 启用 `Dependency graph`。',
        rationale: 'submission API 已返回 404 blocker。',
        roots: ['api', 'services/compat-dify', 'web'],
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
        audience: 'repository_admin',
        code: 'configure_dependabot_alerts_token',
        summary: '配置 `DEPENDABOT_ALERTS_TOKEN`。',
        rationale: '恢复 workflow 内的 alert 对照。',
        roots: [],
        href: 'https://github.com/taichuy/7flows/settings/secrets/actions',
        hrefLabel: '打开 Actions secrets',
      },
    ],
    ...overrides,
  };
}

test('hasExternalBlocker returns true for alerts_unavailable conclusion', () => {
  assert.equal(hasExternalBlocker(createReport()), true);
});

test('hasExternalBlocker returns true for repository-blocked alerts conclusion', () => {
  const report = createReport({
    conclusion: {
      kind: 'repository_blocked_and_alerts_unavailable',
      summary: '仓库设置 blocker 与 alerts token 缺口同时存在。',
    },
    recommendedActions: [],
  });

  assert.equal(hasExternalBlocker(report), true);
});

test('hasExternalBlocker returns true when recommended actions still require external blocker work', () => {
  const report = createReport({
    conclusion: {
      kind: 'actionable_alerts',
      summary: '仍有真实依赖问题。',
    },
  });

  assert.equal(hasExternalBlocker(report), true);
});

test('hasExternalBlocker returns false when report is already resolved and no external action remains', () => {
  const report = createReport({
    conclusion: {
      kind: 'actionable_alerts',
      summary: '仍有真实依赖问题。',
    },
    recommendedActions: [
      {
        priority: 1,
        audience: 'dependency_owner',
        code: 'upgrade_dependency',
        summary: '升级依赖。',
        roots: ['web'],
      },
    ],
  });

  assert.equal(hasExternalBlocker(report), false);
});

test('buildIssueBody renders blocker evidence and recommended actions', () => {
  const escapedMarker = DEFAULT_ISSUE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = buildIssueBody(createReport(), { issueMarker: DEFAULT_ISSUE_MARKER });

  assert.match(body, /GitHub Security Drift 外部阻塞跟踪/);
  assert.match(body, /dependency_graph_disabled/);
  assert.match(body, /打开仓库安全设置/);
  assert.match(body, /仅支持人工操作（`github_settings_ui`）/);
  assert.match(body, /`api`、`services\/compat-dify`、`web`/);
  assert.match(body, /repo API 未返回字段：`dependency_graph`、`automatic_dependency_submission`/);
  assert.match(body, /manual verification reason：`missing_dependency_graph_fields`/);
  assert.match(body, /gh api -X PATCH repos\/\{owner\}\/\{repo\}/);
  assert.match(body, /Enabling the dependency graph/);
  assert.match(body, /Configuring automatic dependency submission/);
  assert.match(body, /DEPENDABOT_ALERTS_TOKEN/);
  assert.match(body, new RegExp(escapedMarker));
  assert.match(body, /## 状态轨迹/);
  assert.match(body, /外部阻塞持续存在/);
});

test('issue state helpers keep semantic fingerprint stable across timestamp-only changes', () => {
  const baseReport = createReport();
  const timestampOnlyChangedReport = createReport({
    generatedAt: '2026-03-26T08:40:00.000Z',
    repositorySecurityAndAnalysis: {
      ...baseReport.repositorySecurityAndAnalysis,
      checkedAt: '2026-03-26T08:39:50.000Z',
    },
    dependencySubmissionEvidence: {
      ...baseReport.dependencySubmissionEvidence,
      dependencyGraphVisibility: {
        ...baseReport.dependencySubmissionEvidence.dependencyGraphVisibility,
        checkedAt: '2026-03-26T08:39:45.000Z',
      },
    },
  });

  assert.equal(
    buildIssueStateFingerprint(baseReport, { resolved: false }),
    buildIssueStateFingerprint(timestampOnlyChangedReport, { resolved: false }),
  );
});

test('buildIssueHistory appends new entry only when semantic blocker state changes', () => {
  const previousReport = createReport();
  const previousState = {
    fingerprint: buildIssueStateFingerprint(previousReport, { resolved: false }),
    resolved: false,
  };
  const previousHistoryLines = buildIssueHistory(previousReport, { resolved: false });

  const unchangedHistory = buildIssueHistory(
    createReport({ generatedAt: '2026-03-26T08:41:00.000Z' }),
    {
      resolved: false,
      previousState,
      previousHistoryLines,
    },
  );
  assert.equal(unchangedHistory.length, 1);

  const changedHistory = buildIssueHistory(
    createReport({
      conclusion: {
        kind: 'repository_blocked_and_alerts_unavailable',
        summary: '仓库设置 blocker 与 token 缺口并存。',
      },
      recommendedActions: [
        {
          priority: 1,
          audience: 'repository_admin',
          code: 'configure_dependabot_alerts_token',
          summary: '配置 `DEPENDABOT_ALERTS_TOKEN`。',
          rationale: '恢复 workflow 内的 alert 对照。',
          roots: [],
        },
      ],
    }),
    {
      resolved: false,
      previousState,
      previousHistoryLines,
    },
  );
  assert.equal(changedHistory.length, 2);
  assert.match(changedHistory[0], /primary_action=`configure_dependabot_alerts_token`/);
});

test('buildIssueBody embeds parseable state metadata and history markers', () => {
  const report = createReport();
  const body = buildIssueBody(report, { issueMarker: DEFAULT_ISSUE_MARKER });
  const parsedState = parseIssueStateMetadata(body);
  const parsedHistory = parseIssueHistoryLines(body);

  assert.deepEqual(parsedState, {
    fingerprint: buildIssueStateFingerprint(report, { resolved: false }),
    resolved: false,
  });
  assert.equal(parsedHistory.length, 1);
  assert.match(parsedHistory[0], /external|外部阻塞/);
});

test('hasIssueTrackingStateChanged only flips when blocker semantics change', () => {
  const report = createReport();
  const sameState = buildIssueTrackingState(report, { resolved: false });

  assert.equal(hasIssueTrackingStateChanged(sameState, sameState), false);
  assert.equal(
    hasIssueTrackingStateChanged(
      sameState,
      buildIssueTrackingState(
        createReport({
          recommendedActions: [
            {
              priority: 1,
              audience: 'repository_admin',
              code: 'configure_dependabot_alerts_token',
              summary: '配置 `DEPENDABOT_ALERTS_TOKEN`。',
              roots: [],
            },
          ],
        }),
        { resolved: false },
      ),
    ),
    true,
  );
  assert.equal(hasIssueTrackingStateChanged(null, sameState), true);
});

test('buildIssueBody treats missing dependency graph fields as manual verification even without explicit flag', () => {
  const body = buildIssueBody(
    createReport({
      repositorySecurityAndAnalysis: {
        checkedAt: '2026-03-26T08:15:00.000Z',
        dependencyGraphStatus: null,
        automaticDependencySubmissionStatus: null,
        dependabotSecurityUpdatesStatus: 'disabled',
        missingFields: ['dependency_graph'],
      },
    }),
  );

  assert.match(body, /repo API 未返回字段：`dependency_graph`/);
  assert.match(body, /manual verification reason：`missing_dependency_graph_fields`/);
  assert.match(body, /不应把缺失误判成“已开启”/);
  assert.match(body, /Settings -> Security & analysis/);
});

test('syncIssueFromReport skips issue mutation outside the default branch', async () => {
  const result = await syncIssueFromReport(createReport(), {
    currentRefName: 'feature/manual-check',
  });

  assert.deepEqual(result, {
    action: 'skipped_non_default_branch',
    issueNumber: null,
    shouldTrack: true,
    currentRefName: 'feature/manual-check',
    defaultBranch: 'taichuy_dev',
    trackingState: buildIssueTrackingState(createReport(), { resolved: false }),
    trackingStateChanged: false,
  });
});

test('syncIssueFromReport supports dry-run without GitHub lookup', async () => {
  const result = await syncIssueFromReport(createReport(), {
    dryRun: true,
  });

  assert.equal(result.action, 'dry_run_track');
  assert.equal(result.issueNumber, null);
  assert.equal(result.shouldTrack, true);
  assert.deepEqual(result.trackingState, buildIssueTrackingState(createReport(), { resolved: false }));
  assert.equal(result.trackingStateChanged, true);
  assert.match(result.body, /GitHub Security Drift 外部阻塞跟踪/);
  assert.match(result.body, /外部阻塞状态：仍阻塞 shared GitHub security drift 闭环/);
});

test('buildIssueSyncStepOutputs expose tracking issue metadata for workflow consumers', () => {
  const outputs = buildIssueSyncStepOutputs(
    {
      action: 'created',
      issueNumber: 42,
      shouldTrack: true,
      trackingState: buildIssueTrackingState(createReport(), { resolved: false }),
      trackingStateChanged: true,
    },
    createReport(),
  );

  assert.deepEqual(outputs, {
    tracking_issue_action: 'created',
    tracking_issue_number: '42',
    tracking_issue_url: 'https://github.com/taichuy/7flows/issues/42',
    tracking_issue_should_track: 'true',
    tracking_issue_current_ref: '',
    tracking_issue_default_branch: 'taichuy_dev',
    tracking_issue_state_fingerprint: buildIssueStateFingerprint(createReport(), { resolved: false }),
    tracking_issue_resolved: 'false',
    tracking_issue_state_changed: 'true',
    tracking_issue_primary_action_priority: '1',
    tracking_issue_primary_action_code: 'enable_dependency_graph',
    tracking_issue_primary_action_audience: 'repository_admin',
    tracking_issue_primary_action_summary: '在 `Settings -> Security & analysis` 启用 `Dependency graph`。',
    tracking_issue_primary_action_rationale: 'submission API 已返回 404 blocker。',
    tracking_issue_primary_action_roots_json: '["api","services/compat-dify","web"]',
    tracking_issue_primary_action_href: 'https://github.com/taichuy/7flows/settings/security_analysis',
    tracking_issue_primary_action_href_label: '打开仓库安全设置',
    tracking_issue_primary_action_manual_only: 'true',
    tracking_issue_primary_action_manual_only_reason: 'github_settings_ui',
    tracking_issue_primary_action_documentation_href:
      'https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph',
    tracking_issue_primary_action_documentation_href_label: '查看官方 Dependency graph 指引',
  });
});

test('buildIssueSyncStepOutputs keep non-default branch skip facts machine-readable', () => {
  const outputs = buildIssueSyncStepOutputs(
    {
      action: 'skipped_non_default_branch',
      issueNumber: null,
      shouldTrack: true,
      currentRefName: 'feature/manual-check',
      defaultBranch: 'taichuy_dev',
      trackingState: buildIssueTrackingState(createReport(), { resolved: false }),
      trackingStateChanged: false,
    },
    createReport(),
  );

  assert.deepEqual(outputs, {
    tracking_issue_action: 'skipped_non_default_branch',
    tracking_issue_number: '',
    tracking_issue_url: '',
    tracking_issue_should_track: 'true',
    tracking_issue_current_ref: 'feature/manual-check',
    tracking_issue_default_branch: 'taichuy_dev',
    tracking_issue_state_fingerprint: buildIssueStateFingerprint(createReport(), { resolved: false }),
    tracking_issue_resolved: 'false',
    tracking_issue_state_changed: 'false',
    tracking_issue_primary_action_priority: '1',
    tracking_issue_primary_action_code: 'enable_dependency_graph',
    tracking_issue_primary_action_audience: 'repository_admin',
    tracking_issue_primary_action_summary: '在 `Settings -> Security & analysis` 启用 `Dependency graph`。',
    tracking_issue_primary_action_rationale: 'submission API 已返回 404 blocker。',
    tracking_issue_primary_action_roots_json: '["api","services/compat-dify","web"]',
    tracking_issue_primary_action_href: 'https://github.com/taichuy/7flows/settings/security_analysis',
    tracking_issue_primary_action_href_label: '打开仓库安全设置',
    tracking_issue_primary_action_manual_only: 'true',
    tracking_issue_primary_action_manual_only_reason: 'github_settings_ui',
    tracking_issue_primary_action_documentation_href:
      'https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph',
    tracking_issue_primary_action_documentation_href_label: '查看官方 Dependency graph 指引',
  });
});

test('buildIssueSyncSummaryLines surface unchanged blocker state and primary manual handoff', () => {
  const lines = buildIssueSyncSummaryLines(
    {
      action: 'updated',
      issueNumber: 9,
      shouldTrack: true,
      trackingState: buildIssueTrackingState(createReport(), { resolved: false }),
      trackingStateChanged: false,
    },
    createReport(),
  );

  const summary = lines.join('\n');
  assert.match(summary, /## Security drift tracking issue/);
  assert.match(summary, /issue sync action：`updated`/);
  assert.match(summary, /tracking issue：\[#9\]\(https:\/\/github.com\/taichuy\/7flows\/issues\/9\)/);
  assert.match(summary, /外部 blocker 语义未变化/);
  assert.match(summary, /### Primary handoff/);
  assert.match(summary, /\[repository_admin\] `enable_dependency_graph`/);
  assert.match(summary, /仅支持人工操作（`github_settings_ui`）/);
  assert.match(summary, /查看官方 Dependency graph 指引/);
});

test('buildIssueSyncSummaryLines explain non-default branch skip without mutating issue', () => {
  const lines = buildIssueSyncSummaryLines(
    {
      action: 'skipped_non_default_branch',
      issueNumber: null,
      shouldTrack: true,
      currentRefName: 'feature/manual-check',
      defaultBranch: 'taichuy_dev',
      trackingState: buildIssueTrackingState(createReport(), { resolved: false }),
      trackingStateChanged: false,
    },
    createReport(),
  );

  const summary = lines.join('\n');
  assert.match(summary, /tracking issue：本轮没有可写回的 issue 变更/);
  assert.match(summary, /当前 ref：`feature\/manual-check`；默认分支：`taichuy_dev`/);
  assert.match(summary, /本轮只保留 artifact \/ summary/);
});

test('writeStepSummary appends summary block to GITHUB_STEP_SUMMARY compatible file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-drift-summary-'));
  const summaryPath = path.join(tempDir, 'summary.md');

  writeStepSummary(['## Security drift tracking issue', '- issue sync action：`noop`'], summaryPath);

  assert.equal(
    fs.readFileSync(summaryPath, 'utf8'),
    '\n## Security drift tracking issue\n- issue sync action：`noop`\n',
  );
});

test('syncIssueFromReport creates tracking issue when blocker persists', async (t) => {
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => '[]',
      };
    }

    return {
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ number: 42 }),
    };
  };

  const result = await syncIssueFromReport(createReport(), { token: 'test-token' });

  assert.equal(result.action, 'created');
  assert.equal(result.issueNumber, 42);
  assert.equal(result.shouldTrack, true);
  assert.equal(result.trackingStateChanged, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/repos\/taichuy\/7flows\/issues\?state=all/);
  assert.equal(calls[0].options.method || 'GET', 'GET');
  assert.match(calls[1].url, /\/repos\/taichuy\/7flows\/issues$/);
  assert.equal(calls[1].options.method, 'POST');
  const createPayload = JSON.parse(calls[1].options.body);
  assert.equal(createPayload.title, 'GitHub Security Drift: external blocker');
  assert.match(createPayload.body, /GitHub Security Drift 外部阻塞跟踪/);
});

test('syncIssueFromReport closes tracked issue after blocker resolves', async (t) => {
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              number: 7,
              state: 'open',
              title: 'GitHub Security Drift: external blocker',
              body: buildIssueBody(createReport(), { issueMarker: DEFAULT_ISSUE_MARKER }),
            },
          ]),
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ number: 7 }),
    };
  };

  const resolvedReport = createReport({
    conclusion: {
      kind: 'no_open_alerts',
      summary: '当前没有 open alert。',
    },
    recommendedActions: [],
  });

  const result = await syncIssueFromReport(resolvedReport, { token: 'test-token' });

  assert.equal(result.action, 'closed');
  assert.equal(result.issueNumber, 7);
  assert.equal(result.shouldTrack, false);
  assert.equal(result.trackingStateChanged, true);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/repos\/taichuy\/7flows\/issues\/7$/);
  assert.equal(calls[1].options.method, 'PATCH');
  const patchPayload = JSON.parse(calls[1].options.body);
  assert.equal(patchPayload.state, 'closed');
  assert.equal(patchPayload.state_reason, 'completed');
  assert.match(patchPayload.body, /已由自动化关闭/);
  const resolvedHistory = parseIssueHistoryLines(patchPayload.body);
  assert.equal(resolvedHistory.length, 2);
  assert.match(resolvedHistory[0], /外部阻塞已解除/);
});

test('syncIssueFromReport keeps a single history entry when only snapshot timestamps change', async (t) => {
  const baseBody = buildIssueBody(createReport(), { issueMarker: DEFAULT_ISSUE_MARKER });
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              number: 9,
              state: 'open',
              title: 'GitHub Security Drift: external blocker',
              body: baseBody,
            },
          ]),
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ number: 9 }),
    };
  };

  const result = await syncIssueFromReport(
    createReport({
      generatedAt: '2026-03-26T08:48:00.000Z',
      repositorySecurityAndAnalysis: {
        ...createReport().repositorySecurityAndAnalysis,
        checkedAt: '2026-03-26T08:47:51.000Z',
      },
      dependencySubmissionEvidence: {
        ...createReport().dependencySubmissionEvidence,
        dependencyGraphVisibility: {
          ...createReport().dependencySubmissionEvidence.dependencyGraphVisibility,
          checkedAt: '2026-03-26T08:47:49.000Z',
        },
      },
    }),
    { token: 'test-token' },
  );

  assert.equal(result.action, 'updated');
  const patchPayload = JSON.parse(calls[1].options.body);
  const historyLines = parseIssueHistoryLines(patchPayload.body);
  assert.equal(historyLines.length, 1);
});

test('syncIssueFromReport keeps noop when tracked issue already matches the latest blocker snapshot', async (t) => {
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const trackedBody = buildIssueBody(createReport(), {
    issueMarker: DEFAULT_ISSUE_MARKER,
    resolved: false,
  });

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            number: 9,
            state: 'open',
            title: 'GitHub Security Drift: external blocker',
            body: trackedBody,
          },
        ]),
    };
  };

  const result = await syncIssueFromReport(createReport(), { token: 'test-token' });

  assert.deepEqual(result, {
    action: 'noop',
    issueNumber: 9,
    shouldTrack: true,
    trackingState: buildIssueTrackingState(createReport(), { resolved: false }),
    trackingStateChanged: false,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/repos\/taichuy\/7flows\/issues\?state=all/);
});

test('syncIssueFromReport marks state_changed false when only freshness fields change', async (t) => {
  const baseBody = buildIssueBody(createReport(), { issueMarker: DEFAULT_ISSUE_MARKER });
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              number: 9,
              state: 'open',
              title: 'GitHub Security Drift: external blocker',
              body: baseBody,
            },
          ]),
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ number: 9 }),
    };
  };

  const result = await syncIssueFromReport(
    createReport({
      generatedAt: '2026-03-26T08:48:00.000Z',
      repositorySecurityAndAnalysis: {
        ...createReport().repositorySecurityAndAnalysis,
        checkedAt: '2026-03-26T08:47:51.000Z',
      },
      dependencySubmissionEvidence: {
        ...createReport().dependencySubmissionEvidence,
        dependencyGraphVisibility: {
          ...createReport().dependencySubmissionEvidence.dependencyGraphVisibility,
          checkedAt: '2026-03-26T08:47:49.000Z',
        },
      },
    }),
    { token: 'test-token' },
  );

  assert.equal(result.action, 'updated');
  assert.equal(result.trackingStateChanged, false);
});

test('syncIssueFromReport reopens closed tracked issue when blocker returns', async (t) => {
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              number: 11,
              state: 'closed',
              title: 'GitHub Security Drift: external blocker',
              body: `${DEFAULT_ISSUE_MARKER}\nresolved body`,
            },
          ]),
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ number: 11 }),
    };
  };

  const result = await syncIssueFromReport(createReport(), { token: 'test-token' });

  assert.deepEqual(result, {
    action: 'reopened',
    issueNumber: 11,
    shouldTrack: true,
    trackingState: buildIssueTrackingState(createReport(), { resolved: false }),
    trackingStateChanged: true,
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/repos\/taichuy\/7flows\/issues\/11$/);
  assert.equal(calls[1].options.method, 'PATCH');
  const patchPayload = JSON.parse(calls[1].options.body);
  assert.equal(patchPayload.state, 'open');
  assert.match(patchPayload.body, /GitHub Security Drift 外部阻塞跟踪/);
});

test('buildIssueBody renders resolved snapshot when blocker is gone', () => {
  const body = buildIssueBody(
    createReport({
      conclusion: {
        kind: 'no_open_alerts',
        summary: '当前没有 open alert。',
      },
      recommendedActions: [],
    }),
    { issueMarker: DEFAULT_ISSUE_MARKER, resolved: true },
  );

  assert.match(body, /已由自动化关闭/);
  assert.match(body, /外部阻塞状态：已解除或已转入本地依赖修复/);
});

test('parseArgs supports dry-run, custom title, and current ref override', () => {
  const options = parseArgs([
    '--report',
    'dependabot-drift.json',
    '--issue-title',
    'Custom Title',
    '--current-ref-name',
    'feature/manual-check',
    '--dry-run',
  ]);

  assert.equal(options.reportPath, 'dependabot-drift.json');
  assert.equal(options.issueTitle, 'Custom Title');
  assert.equal(options.currentRefName, 'feature/manual-check');
  assert.equal(options.dryRun, true);
});
