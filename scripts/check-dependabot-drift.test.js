const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildDriftReport,
  buildDriftStepOutputs,
  buildMarkdownSummary,
  buildWorkspaceManifestCoverage,
  buildWorkspaceManifestInventory,
  evaluateAlert,
  parseArgs,
  parseDependencySubmissionJsonReport,
  parseDependencySubmissionReport,
} = require('./check-dependabot-drift.js');

function createFixtureRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dependabot-drift-'));

  fs.mkdirSync(path.join(repoRoot, 'web'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'web', 'package.json'),
    JSON.stringify(
      {
        dependencies: {
          next: '^15.5.14',
        },
        pnpm: {
          overrides: {
            flatted: '3.4.2',
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'web', 'pnpm-lock.yaml'),
    ['packages:', '  next@15.5.14:', '  flatted@3.4.2:'].join('\n'),
    'utf8',
  );

  fs.mkdirSync(path.join(repoRoot, 'api'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'api', 'pyproject.toml'),
    [
      '[project]',
      'dependencies = [',
      '  "cryptography>=46.0.5,<47",',
      '  "httpx>=0.28.0,<1",',
      ']',
      '',
      '[project.optional-dependencies]',
      'dev = [',
      '  "pytest>=8.3.0,<9",',
      ']',
    ].join('\n'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(repoRoot, 'api', 'uv.lock'),
    [
      'version = 1',
      '',
      '[[package]]',
      'name = "cryptography"',
      'version = "46.0.5"',
      '',
      '[[package]]',
      'name = "httpx"',
      'version = "0.28.1"',
    ].join('\n'),
    'utf8',
  );

  return repoRoot;
}

test('buildWorkspaceManifestInventory groups pnpm and uv roots', () => {
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);

  assert.deepEqual(
    inventory.map((item) => ({
      rootLabel: item.rootLabel,
      ecosystem: item.ecosystem,
      dependencyGraphSupport: item.dependencyGraphSupport,
      manifestPath: item.manifestPath,
      lockfilePath: item.lockfilePath,
    })),
    [
      {
        rootLabel: 'api',
        ecosystem: 'uv',
        dependencyGraphSupport: 'dependency_submission',
        manifestPath: 'api/pyproject.toml',
        lockfilePath: 'api/uv.lock',
      },
      {
        rootLabel: 'web',
        ecosystem: 'pnpm',
        dependencyGraphSupport: 'native',
        manifestPath: 'web/package.json',
        lockfilePath: 'web/pnpm-lock.yaml',
      },
    ],
  );
});

test('buildWorkspaceManifestCoverage distinguishes native and submission-only graph roots', () => {
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);
  const manifestCoverage = buildWorkspaceManifestCoverage(inventory, [
    {
      filename: 'web/package.json',
      dependenciesCount: 10,
      parseable: true,
    },
  ]);

  assert.deepEqual(
    manifestCoverage.map((item) => ({
      rootLabel: item.rootLabel,
      dependencyGraphSupport: item.dependencyGraphSupport,
      dependencyGraphSupported: item.dependencyGraphSupported,
      graphVisible: item.graphVisible,
    })),
    [
      {
        rootLabel: 'api',
        dependencyGraphSupport: 'dependency_submission',
        dependencyGraphSupported: false,
        graphVisible: false,
      },
      {
        rootLabel: 'web',
        dependencyGraphSupport: 'native',
        dependencyGraphSupported: true,
        graphVisible: true,
      },
    ],
  );
});

test('evaluateAlert resolves pnpm and uv manifests via sibling lockfiles', () => {
  const repoRoot = createFixtureRepo();
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);

  const pythonAlert = {
    dependency: {
      manifest_path: 'api/pyproject.toml',
      package: {
        name: 'cryptography',
      },
    },
    security_vulnerability: {
      first_patched_version: {
        identifier: '46.0.5',
      },
    },
  };
  const nodeAlert = {
    dependency: {
      manifest_path: 'web/package.json',
      package: {
        name: 'next',
      },
    },
    security_vulnerability: {
      first_patched_version: {
        identifier: '15.5.14',
      },
    },
  };

  const pythonResult = evaluateAlert(pythonAlert, {
    baseRepoRoot: repoRoot,
    workspaceManifestInventory: inventory,
  });
  const nodeResult = evaluateAlert(nodeAlert, {
    baseRepoRoot: repoRoot,
    workspaceManifestInventory: inventory,
  });

  assert.equal(pythonResult.state, 'patched-locally');
  assert.deepEqual(pythonResult.localVersions, ['46.0.5']);
  assert.deepEqual(pythonResult.specifiers, ['cryptography>=46.0.5,<47']);
  assert.equal(pythonResult.specifierSourcePath, 'api/pyproject.toml');

  assert.equal(nodeResult.state, 'patched-locally');
  assert.deepEqual(nodeResult.localVersions, ['15.5.14']);
  assert.deepEqual(nodeResult.specifiers, ['^15.5.14']);
  assert.equal(nodeResult.specifierSourcePath, 'web/package.json');
});

test('evaluateAlert also resolves alerts reported on lockfile paths', () => {
  const repoRoot = createFixtureRepo();
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);

  const pythonAlert = {
    dependency: {
      manifest_path: 'api/uv.lock',
      package: {
        name: 'cryptography',
      },
    },
    security_vulnerability: {
      first_patched_version: {
        identifier: '46.0.5',
      },
    },
  };
  const nodeAlert = {
    dependency: {
      manifest_path: 'web/pnpm-lock.yaml',
      package: {
        name: 'flatted',
      },
    },
    security_vulnerability: {
      first_patched_version: {
        identifier: '3.4.2',
      },
    },
  };

  const pythonResult = evaluateAlert(pythonAlert, {
    baseRepoRoot: repoRoot,
    workspaceManifestInventory: inventory,
  });
  const nodeResult = evaluateAlert(nodeAlert, {
    baseRepoRoot: repoRoot,
    workspaceManifestInventory: inventory,
  });

  assert.equal(pythonResult.state, 'patched-locally');
  assert.deepEqual(pythonResult.localVersions, ['46.0.5']);
  assert.deepEqual(pythonResult.specifiers, ['cryptography>=46.0.5,<47']);
  assert.equal(pythonResult.specifierSourcePath, 'api/pyproject.toml');

  assert.equal(nodeResult.state, 'patched-locally');
  assert.deepEqual(nodeResult.localVersions, ['3.4.2']);
  assert.deepEqual(nodeResult.specifiers, ['3.4.2']);
  assert.equal(nodeResult.specifierSourcePath, 'web/package.json');
});

test('buildMarkdownSummary highlights local roots missing from dependency graph', () => {
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'services/compat-dify/pyproject.toml',
    'services/compat-dify/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);
  const manifestCoverage = buildWorkspaceManifestCoverage(inventory, []);
  const summary = buildMarkdownSummary({
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    defaultBranch: 'taichuy_dev',
    manifestNodes: [],
    workspaceManifestInventory: inventory,
    manifestCoverage,
    openAlerts: [],
    results: [],
    actionableAlerts: [],
  });

  assert.match(summary, /本地 manifest roots：`3`/);
  assert.match(summary, /graph coverage 缺口：`web`（pnpm）/);
  assert.match(summary, /需 dependency submission 才能纳入 graph：`api`（uv）；`services\/compat-dify`（uv）/);
});

test('parseDependencySubmissionReport extracts repository blocker evidence', () => {
  const report = `## Dependency snapshot submission

- repository blocker: GitHub \`Dependency graph\` 未开启；workflow 已保留证据并降级为 warning，而不是把当前代码事实误判成实现失败。
- blocker evidence: kind=\`dependency_graph_disabled\`, status=\`404\`, roots=\`api\`、\`web\`
- blocker message: Dependency graph is disabled for this repository.

- root: \`api\`
  - status: \`blocked\`
  - blocked reason: GitHub 仓库当前未开启 \`Dependency graph\`；请先到 \`Settings -> Security & analysis\` 启用 \`Dependency graph\`。
- root: \`web\`
  - status: \`blocked\`
  - warning: 当前 pnpm lockfile-only snapshot 仍未暴露 development roots。`;

  const parsed = parseDependencySubmissionReport(report);

  assert.match(parsed.repositoryBlocker, /Dependency graph/);
  assert.deepEqual(parsed.repositoryBlockerEvidence, {
    kind: 'dependency_graph_disabled',
    status: 404,
    message: 'Dependency graph is disabled for this repository.',
    rootLabels: ['api', 'web'],
    consistentAcrossRoots: true,
  });
  assert.deepEqual(
    parsed.blockedRoots.map((item) => ({
      rootLabel: item.rootLabel,
      status: item.status,
      blockedReason: item.blockedReason,
      warning: item.warning,
    })),
    [
      {
        rootLabel: 'api',
        status: 'blocked',
        blockedReason:
          'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`。',
        warning: null,
      },
      {
        rootLabel: 'web',
        status: 'blocked',
        blockedReason: null,
        warning: '当前 pnpm lockfile-only snapshot 仍未暴露 development roots。',
      },
    ],
  );
});

test('parseDependencySubmissionJsonReport extracts submitted and blocked roots', () => {
  const parsed = parseDependencySubmissionJsonReport(
    JSON.stringify({
      schemaVersion: 1,
      repositoryBlocker:
        'GitHub `Dependency graph` 未开启；workflow 已保留证据并降级为 warning，而不是把当前代码事实误判成实现失败。',
      repositoryBlockerEvidence: {
        kind: 'dependency_graph_disabled',
        status: 404,
        message: 'Dependency graph is disabled for this repository.',
        rootLabels: ['api'],
        consistentAcrossRoots: true,
      },
      roots: [
        {
          rootLabel: 'web',
          status: 'submitted',
          snapshotId: 'snapshot-123',
        },
        {
          rootLabel: 'api',
          status: 'blocked',
          blockedReason:
            'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`。',
          blockedKind: 'dependency_graph_disabled',
          blockedStatus: 404,
          blockedMessage: 'Dependency graph is disabled for this repository.',
        },
      ],
    }),
  );

  assert.match(parsed.repositoryBlocker, /Dependency graph/);
  assert.deepEqual(parsed.repositoryBlockerEvidence, {
    kind: 'dependency_graph_disabled',
    status: 404,
    message: 'Dependency graph is disabled for this repository.',
    rootLabels: ['api'],
    consistentAcrossRoots: true,
  });
  assert.deepEqual(parsed.submittedRoots, [
    {
      rootLabel: 'web',
      status: 'submitted',
      blockedReason: null,
      blockedKind: null,
      blockedStatus: null,
      blockedMessage: null,
      warning: null,
      snapshotId: 'snapshot-123',
    },
  ]);
  assert.deepEqual(parsed.blockedRoots, [
    {
      rootLabel: 'api',
      status: 'blocked',
      blockedReason:
        'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`。',
      blockedKind: 'dependency_graph_disabled',
      blockedStatus: 404,
      blockedMessage: 'Dependency graph is disabled for this repository.',
      warning: null,
      snapshotId: null,
    },
  ]);
});

test('buildMarkdownSummary surfaces latest dependency submission blocker evidence', () => {
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);
  const manifestCoverage = buildWorkspaceManifestCoverage(inventory, []);
  const summary = buildMarkdownSummary({
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    defaultBranch: 'taichuy_dev',
    manifestNodes: [],
    workspaceManifestInventory: inventory,
    manifestCoverage,
    openAlerts: [],
    results: [],
    actionableAlerts: [],
    dependencySubmissionEvidence: {
      workflowConfigured: true,
      runAvailable: true,
      runId: 23504251554,
      status: 'completed',
      conclusion: 'success',
      event: 'push',
      htmlUrl: 'https://github.com/taichuy/7flows/actions/runs/23504251554',
      report: {
        repositoryBlocker:
          'GitHub `Dependency graph` 未开启；workflow 已保留证据并降级为 warning，而不是把当前代码事实误判成实现失败。',
        repositoryBlockerEvidence: {
          kind: 'dependency_graph_disabled',
          status: 404,
          message: 'Dependency graph is disabled for this repository.',
          rootLabels: ['api', 'web'],
          consistentAcrossRoots: true,
        },
        recommendedActions: [
          {
            priority: 1,
            audience: 'repository_admin',
            code: 'enable_dependency_graph',
            summary:
              '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
            rationale:
              'dependency submission API 已直接返回 `dependency_graph_disabled` / `404`，当前阻塞来自仓库设置而不是本地 lock 解析。',
            roots: ['api', 'web'],
          },
        ],
        roots: [
          { rootLabel: 'services/compat-dify', status: 'submitted', snapshotId: 'snapshot-compat' },
          { rootLabel: 'api', status: 'blocked' },
          { rootLabel: 'web', status: 'blocked' },
        ],
        blockedRoots: [
          { rootLabel: 'api', status: 'blocked' },
          { rootLabel: 'web', status: 'blocked' },
        ],
        submittedRoots: [{ rootLabel: 'services/compat-dify', status: 'submitted', snapshotId: 'snapshot-compat' }],
      },
    },
  });

  assert.match(summary, /Latest dependency submission evidence/);
  assert.match(summary, /23504251554/);
  assert.match(summary, /repository blocker: GitHub `Dependency graph` 未开启/);
  assert.match(summary, /repository blocker API evidence: kind: `dependency_graph_disabled`，status: `404`，roots: `api`、`web`/);
  assert.match(summary, /repository blocker API message: Dependency graph is disabled for this repository\./);
  assert.match(summary, /blocked roots: `api`、`web`/);
  assert.match(summary, /submitted roots: `services\/compat-dify`（snapshot: `snapshot-compat`）/);
});

test('buildMarkdownSummary hints actions read permission when submission evidence fetch is blocked', () => {
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);
  const manifestCoverage = buildWorkspaceManifestCoverage(inventory, []);
  const summary = buildMarkdownSummary({
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    defaultBranch: 'taichuy_dev',
    manifestNodes: [],
    workspaceManifestInventory: inventory,
    manifestCoverage,
    openAlerts: [],
    results: [],
    actionableAlerts: [],
    dependencySubmissionEvidence: {
      workflowConfigured: true,
      fetchError:
        'gh: Resource not accessible by integration (HTTP 403) while requesting repos/taichuy/7flows/actions/workflows/dependency-graph-submission.yml/runs?per_page=1&branch=taichuy_dev',
    },
  });

  assert.match(summary, /Resource not accessible by integration/);
  assert.match(summary, /actions: read/);
});

test('parseArgs accepts report output path', () => {
  assert.deepEqual(parseArgs(['--report-output', 'dependabot-drift.json']), {
    reportOutputPath: 'dependabot-drift.json',
  });
  assert.throws(() => parseArgs(['--report-output']), /需要路径参数/);
  assert.throws(() => parseArgs(['--unknown']), /未知参数/);
});

test('buildDriftReport emits machine-readable drift evidence', () => {
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);
  const manifestCoverage = buildWorkspaceManifestCoverage(inventory, []);
  const openAlerts = [
    {
      number: 3,
      dependency: {
        manifest_path: 'web/pnpm-lock.yaml',
        package: { name: 'next' },
      },
      security_vulnerability: {
        first_patched_version: { identifier: '15.5.14' },
      },
    },
  ];
  const results = [
    {
      packageName: 'next',
      manifestPath: 'web/pnpm-lock.yaml',
      patchedVersion: '15.5.14',
      localVersions: ['15.5.14'],
      specifiers: ['^15.5.14'],
      specifierSourcePath: 'web/package.json',
      state: 'patched-locally',
      reason: '本地锁文件中的解析版本已达到或超过 patched version。',
    },
  ];

  const report = buildDriftReport({
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    defaultBranch: 'taichuy_dev',
    manifestNodes: [],
    workspaceManifestInventory: inventory,
    manifestCoverage,
    openAlerts,
    results,
    actionableAlerts: [],
    dependencySubmissionEvidence: {
      workflowConfigured: true,
      runAvailable: true,
      runId: 23505567063,
      status: 'completed',
      conclusion: 'success',
      event: 'workflow_dispatch',
      htmlUrl: 'https://github.com/taichuy/7flows/actions/runs/23505567063',
      createdAt: '2026-03-25T02:45:00.000Z',
      report: {
        repositoryBlocker:
          'GitHub `Dependency graph` 未开启；workflow 已保留证据并降级为 warning，而不是把当前代码事实误判成实现失败。',
        repositoryBlockerEvidence: {
          kind: 'dependency_graph_disabled',
          status: 404,
          message: 'Dependency graph is disabled for this repository.',
          rootLabels: ['api', 'web'],
          consistentAcrossRoots: true,
        },
        recommendedActions: [
          {
            priority: 1,
            audience: 'repository_admin',
            code: 'enable_dependency_graph',
            summary:
              '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
            rationale:
              'dependency submission API 已直接返回 `dependency_graph_disabled` / `404`，当前阻塞来自仓库设置而不是本地 lock 解析。',
            roots: ['api', 'web'],
          },
        ],
        roots: [
          {
            rootLabel: 'api',
            status: 'blocked',
            blockedKind: 'dependency_graph_disabled',
            blockedStatus: 404,
            blockedMessage: 'Dependency graph is disabled for this repository.',
          },
          {
            rootLabel: 'web',
            status: 'blocked',
            blockedKind: 'dependency_graph_disabled',
            blockedStatus: 404,
            blockedMessage: 'Dependency graph is disabled for this repository.',
          },
        ],
        blockedRoots: [
          {
            rootLabel: 'api',
            status: 'blocked',
            blockedKind: 'dependency_graph_disabled',
            blockedStatus: 404,
            blockedMessage: 'Dependency graph is disabled for this repository.',
          },
          {
            rootLabel: 'web',
            status: 'blocked',
            blockedKind: 'dependency_graph_disabled',
            blockedStatus: 404,
            blockedMessage: 'Dependency graph is disabled for this repository.',
          },
        ],
        submittedRoots: [],
        dependencyGraphVisibility: {
          checkedAt: '2026-03-25T02:46:00.000Z',
          defaultBranch: 'taichuy_dev',
          manifestCount: 1,
          visibleRoots: ['web'],
          missingRoots: ['api'],
        },
      },
    },
    conclusion: {
      exitCode: 2,
      kind: 'platform_drift',
      summary: '所有 open alerts 都已被当前锁文件修复，但 GitHub 依赖图 / 告警状态仍未收口。',
    },
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.repository.owner, 'taichuy');
  assert.equal(report.manifestGraph.localRootCount, 2);
  assert.deepEqual(report.manifestGraph.missingNativeGraphRoots, ['web']);
  assert.deepEqual(report.manifestGraph.dependencySubmissionRoots, ['api']);
  assert.equal(report.dependabotAlerts.openAlertCount, 1);
  assert.equal(report.dependabotAlerts.actionableAlertCount, 0);
  assert.deepEqual(report.dependabotAlerts.alerts, [
    {
      number: 3,
      packageName: 'next',
      manifestPath: 'web/pnpm-lock.yaml',
      patchedVersion: '15.5.14',
      localVersions: ['15.5.14'],
      specifiers: ['^15.5.14'],
      specifierSourcePath: 'web/package.json',
      verdict: 'patched-locally',
      note: '本地锁文件中的解析版本已达到或超过 patched version。',
    },
  ]);
  assert.equal(report.dependencySubmissionEvidence.runId, 23505567063);
  assert.equal(report.dependencySubmissionEvidence.createdAt, '2026-03-25T02:45:00.000Z');
  assert.match(report.dependencySubmissionEvidence.repositoryBlocker, /Dependency graph/);
  assert.deepEqual(report.dependencySubmissionEvidence.repositoryBlockerEvidence, {
    kind: 'dependency_graph_disabled',
    status: 404,
    message: 'Dependency graph is disabled for this repository.',
    rootLabels: ['api', 'web'],
    consistentAcrossRoots: true,
  });
  assert.deepEqual(report.dependencySubmissionEvidence.recommendedActions, [
    {
      priority: 1,
      audience: 'repository_admin',
      code: 'enable_dependency_graph',
      summary:
        '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
      rationale:
        'dependency submission API 已直接返回 `dependency_graph_disabled` / `404`，当前阻塞来自仓库设置而不是本地 lock 解析。',
      roots: ['api', 'web'],
    },
  ]);
  assert.deepEqual(
    report.dependencySubmissionEvidence.blockedRoots.map((item) => item.rootLabel),
    ['api', 'web'],
  );
  assert.equal(report.dependencySubmissionEvidence.dependencyGraphVisibility.defaultBranch, 'taichuy_dev');
  assert.deepEqual(report.dependencySubmissionEvidence.dependencyGraphVisibility.visibleRoots, ['web']);
  assert.deepEqual(report.dependencySubmissionEvidence.dependencyGraphVisibility.missingRoots, ['api']);
  assert.deepEqual(report.recommendedActions, [
    {
      priority: 1,
      audience: 'repository_admin',
      code: 'enable_dependency_graph',
      summary:
        '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
      rationale:
        '最新 submission evidence 已明确把 manifests 缺席归类为仓库设置阻塞，而不是 inventory / lock 解析错误。',
      roots: ['api', 'web'],
    },
    {
      priority: 2,
      audience: 'workflow_maintainer',
      code: 'rerun_dependency_graph_submission',
      summary:
        '仓库设置更新后重跑 `Dependency Graph Submission` workflow，确认 blocker evidence 是否消失并刷新 manifests。',
      rationale:
        '只有新的 submission run 才能证明 roots 是否开始在 GitHub dependency graph 中可见。',
      roots: ['api', 'web'],
    },
    {
      priority: 3,
      audience: 'workflow_maintainer',
      code: 'rerun_github_security_drift',
      summary:
        'submission evidence 刷新后重跑 `GitHub Security Drift`，确认 `dependabot-drift.json` 是否开始收口到最新 graph / alert 事实。',
      rationale:
        'drift 结论需要依赖最新 submission artifact 与 dependencyGraphManifests visibility。',
      roots: [],
    },
    {
      priority: 4,
      audience: 'dependency_owner',
      code: 'preserve_platform_drift_evidence',
      summary:
        '保留当前 drift artifact，不要直接 dismiss alert；先等待 GitHub dependency graph / alert 状态自动收口后再复验。',
      rationale: '当前 open alerts 已被本地锁文件修复，剩余差异主要来自平台事实刷新。',
      roots: [],
    },
  ]);
  assert.equal(report.conclusion.exitCode, 2);
  assert.equal(report.conclusion.kind, 'platform_drift');
});

test('buildDriftReport keeps actions read blockers machine-readable', () => {
  const report = buildDriftReport({
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    defaultBranch: 'taichuy_dev',
    manifestNodes: [],
    workspaceManifestInventory: [],
    manifestCoverage: [],
    openAlerts: [],
    results: [],
    actionableAlerts: [],
    dependencySubmissionEvidence: {
      workflowConfigured: true,
      runAvailable: false,
      fetchError:
        'gh: Resource not accessible by integration (HTTP 403) while requesting repos/taichuy/7flows/actions/workflows/dependency-graph-submission.yml/runs?per_page=1&branch=taichuy_dev',
      reportDownloadError:
        'gh: Resource not accessible by integration (HTTP 403) while downloading artifact dependency-submission-report',
    },
    conclusion: {
      exitCode: 3,
      kind: 'alerts_unavailable',
      summary: '当前 workflow token 无法读取 Dependabot alerts；请补充 DEPENDABOT_ALERTS_TOKEN 或使用具备权限的 gh 凭证。',
    },
  });

  assert.equal(report.dependencySubmissionEvidence.fetchBlockedByActionsReadPermission, true);
  assert.equal(report.dependencySubmissionEvidence.reportDownloadBlockedByActionsReadPermission, true);
  assert.deepEqual(report.recommendedActions, [
    {
      priority: 1,
      audience: 'workflow_maintainer',
      code: 'grant_actions_read',
      summary:
        '为 `GitHub Security Drift` workflow 保留 `actions: read`，确保能读取最新 dependency submission run / artifact。',
      rationale:
        '当前读取 workflow run 或 artifact 时出现 `Resource not accessible by integration`，这会切断 drift 与 submission 的证据链。',
      roots: [],
    },
  ]);
});

test('parseDependencySubmissionJsonReport keeps dependency graph visibility evidence', () => {
  const parsed = parseDependencySubmissionJsonReport(
    JSON.stringify({
      repositoryBlocker: null,
      recommendedActions: [
        {
          priority: 1,
          audience: 'workflow_maintainer',
          code: 'recheck_dependency_graph_visibility',
          summary: '保留当前 artifact，稍后重跑 `Dependency Graph Submission`。',
          rationale: 'roots 仍未可见。',
          roots: ['api'],
        },
      ],
      roots: [
        {
          rootLabel: 'web',
          status: 'submitted',
          snapshotId: 'snapshot-web',
        },
      ],
      dependencyGraphVisibility: {
        checkedAt: '2026-03-25T02:30:00.000Z',
        defaultBranch: 'taichuy_dev',
        manifestCount: 1,
        visibleRoots: ['web'],
        missingRoots: ['api'],
      },
    }),
  );

  assert.equal(parsed.dependencyGraphVisibility.defaultBranch, 'taichuy_dev');
  assert.equal(parsed.dependencyGraphVisibility.manifestCount, 1);
  assert.deepEqual(parsed.dependencyGraphVisibility.visibleRoots, ['web']);
  assert.deepEqual(parsed.dependencyGraphVisibility.missingRoots, ['api']);
  assert.deepEqual(parsed.recommendedActions, [
    {
      priority: 1,
      audience: 'workflow_maintainer',
      code: 'recheck_dependency_graph_visibility',
      summary: '保留当前 artifact，稍后重跑 `Dependency Graph Submission`。',
      rationale: 'roots 仍未可见。',
      roots: ['api'],
    },
  ]);
});

test('buildDriftStepOutputs expose top follow-up and blocker facts', () => {
  const report = buildDriftReport({
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    defaultBranch: 'taichuy_dev',
    manifestNodes: [],
    workspaceManifestInventory: buildWorkspaceManifestInventory([
      'api/pyproject.toml',
      'api/uv.lock',
      'web/package.json',
      'web/pnpm-lock.yaml',
    ]),
    manifestCoverage: buildWorkspaceManifestCoverage(
      buildWorkspaceManifestInventory([
        'api/pyproject.toml',
        'api/uv.lock',
        'web/package.json',
        'web/pnpm-lock.yaml',
      ]),
      [],
    ),
    openAlerts: [
      {
        number: 3,
        dependency: {
          manifest_path: 'web/pnpm-lock.yaml',
          package: { name: 'next' },
        },
        security_vulnerability: {
          first_patched_version: { identifier: '15.5.14' },
        },
      },
    ],
    results: [
      {
        packageName: 'next',
        manifestPath: 'web/pnpm-lock.yaml',
        patchedVersion: '15.5.14',
        localVersions: ['15.5.14'],
        specifiers: ['^15.5.14'],
        specifierSourcePath: 'web/package.json',
        state: 'patched-locally',
        reason: '本地锁文件中的解析版本已达到或超过 patched version。',
      },
    ],
    actionableAlerts: [],
    dependencySubmissionEvidence: {
      workflowConfigured: true,
      runAvailable: true,
      report: {
        repositoryBlockerEvidence: {
          kind: 'dependency_graph_disabled',
          status: 404,
          message: 'Dependency graph is disabled for this repository.',
          rootLabels: ['api', 'web'],
          consistentAcrossRoots: true,
        },
        dependencyGraphVisibility: {
          checkedAt: '2026-03-25T02:46:00.000Z',
          defaultBranch: 'taichuy_dev',
          manifestCount: 1,
          visibleRoots: ['web'],
          missingRoots: ['api'],
        },
      },
    },
    conclusion: {
      exitCode: 2,
      kind: 'platform_drift',
      summary: '所有 open alerts 都已被当前锁文件修复，但 GitHub 依赖图 / 告警状态仍未收口。',
    },
  });

  const outputs = buildDriftStepOutputs(report);

  assert.equal(outputs.conclusion_kind, 'platform_drift');
  assert.equal(outputs.conclusion_exit_code, '2');
  assert.equal(outputs.recommended_actions_count, '4');
  assert.equal(outputs.primary_recommended_action_code, 'enable_dependency_graph');
  assert.equal(outputs.primary_recommended_action_audience, 'repository_admin');
  assert.equal(outputs.repository_blocker_kind, 'dependency_graph_disabled');
  assert.equal(outputs.repository_blocker_status, '404');
  assert.equal(outputs.dependency_submission_run_available, 'true');
  assert.equal(outputs.dependency_graph_missing_roots_json, JSON.stringify(['api']));
});

test('buildMarkdownSummary surfaces submission-time manifest visibility evidence', () => {
  const inventory = buildWorkspaceManifestInventory([
    'api/pyproject.toml',
    'api/uv.lock',
    'web/package.json',
    'web/pnpm-lock.yaml',
  ]);
  const manifestCoverage = buildWorkspaceManifestCoverage(inventory, []);
  const summary = buildMarkdownSummary({
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    defaultBranch: 'taichuy_dev',
    manifestNodes: [],
    workspaceManifestInventory: inventory,
    manifestCoverage,
    openAlerts: [],
    results: [],
    actionableAlerts: [],
    dependencySubmissionEvidence: {
      workflowConfigured: true,
      runAvailable: true,
      runId: 23509999999,
      status: 'completed',
      conclusion: 'success',
      event: 'workflow_dispatch',
      htmlUrl: 'https://github.com/taichuy/7flows/actions/runs/23509999999',
      report: {
        repositoryBlocker: null,
        roots: [{ rootLabel: 'web', status: 'submitted', snapshotId: 'snapshot-web' }],
        blockedRoots: [],
        submittedRoots: [{ rootLabel: 'web', status: 'submitted', snapshotId: 'snapshot-web' }],
        dependencyGraphVisibility: {
          checkedAt: '2026-03-25T02:30:00.000Z',
          defaultBranch: 'taichuy_dev',
          manifestCount: 1,
          visibleRoots: ['web'],
          missingRoots: ['api'],
        },
      },
    },
  });

  assert.match(summary, /manifests observed after submission: `1`/);
  assert.match(summary, /visible roots now: `web`/);
  assert.match(summary, /roots not yet visible: `api`/);
  assert.match(summary, /Recommended next steps/);
  assert.match(summary, /\[workflow_maintainer\] `recheck_dependency_submission_visibility`/);
});
