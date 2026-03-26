const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_ISSUE_MARKER,
  buildIssueBody,
  hasExternalBlocker,
  parseArgs,
  syncIssueFromReport,
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
  assert.match(body, /repo API 未返回字段：`dependency_graph`/);
  assert.match(body, /repo API 未返回字段：.*`automatic_dependency_submission`/);
  assert.match(body, /manual verification reason：`missing_dependency_graph_fields`/);
  assert.match(body, /gh api -X PATCH repos\/\{owner\}\/\{repo\}/);
  assert.match(body, /Enabling the dependency graph/);
  assert.match(body, /Configuring automatic dependency submission/);
  assert.match(body, /DEPENDABOT_ALERTS_TOKEN/);
  assert.match(body, new RegExp(escapedMarker));
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
  });
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
              body: `${DEFAULT_ISSUE_MARKER}\nold body`,
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
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/repos\/taichuy\/7flows\/issues\/7$/);
  assert.equal(calls[1].options.method, 'PATCH');
  const patchPayload = JSON.parse(calls[1].options.body);
  assert.equal(patchPayload.state, 'closed');
  assert.equal(patchPayload.state_reason, 'completed');
  assert.match(patchPayload.body, /已由自动化关闭/);
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
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/repos\/taichuy\/7flows\/issues\?state=all/);
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

test('parseArgs supports dry-run and custom title', () => {
  const options = parseArgs([
    '--report',
    'dependabot-drift.json',
    '--issue-title',
    'Custom Title',
    '--dry-run',
  ]);

  assert.equal(options.reportPath, 'dependabot-drift.json');
  assert.equal(options.issueTitle, 'Custom Title');
  assert.equal(options.dryRun, true);
});
