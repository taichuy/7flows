const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildDriftReport,
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

- root: \`api\`
  - status: \`blocked\`
  - blocked reason: GitHub 仓库当前未开启 \`Dependency graph\`；请先到 \`Settings -> Security & analysis\` 启用 \`Dependency graph\`。
- root: \`web\`
  - status: \`blocked\`
  - warning: 当前 pnpm lockfile-only snapshot 仍未暴露 development roots。`;

  const parsed = parseDependencySubmissionReport(report);

  assert.match(parsed.repositoryBlocker, /Dependency graph/);
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
        },
      ],
    }),
  );

  assert.match(parsed.repositoryBlocker, /Dependency graph/);
  assert.deepEqual(parsed.submittedRoots, [
    {
      rootLabel: 'web',
      status: 'submitted',
      blockedReason: null,
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
  assert.match(summary, /blocked roots: `api`、`web`/);
  assert.match(summary, /submitted roots: `services\/compat-dify`（snapshot: `snapshot-compat`）/);
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
      report: {
        repositoryBlocker:
          'GitHub `Dependency graph` 未开启；workflow 已保留证据并降级为 warning，而不是把当前代码事实误判成实现失败。',
        roots: [
          { rootLabel: 'api', status: 'blocked' },
          { rootLabel: 'web', status: 'blocked' },
        ],
        blockedRoots: [
          { rootLabel: 'api', status: 'blocked' },
          { rootLabel: 'web', status: 'blocked' },
        ],
        submittedRoots: [],
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
  assert.match(report.dependencySubmissionEvidence.repositoryBlocker, /Dependency graph/);
  assert.deepEqual(
    report.dependencySubmissionEvidence.blockedRoots.map((item) => item.rootLabel),
    ['api', 'web'],
  );
  assert.equal(report.conclusion.exitCode, 2);
  assert.equal(report.conclusion.kind, 'platform_drift');
});
