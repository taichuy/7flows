const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DependencySubmissionError,
  buildDependencyGraphVisibilityReport,
  buildPnpmResolvedDependencies,
  buildSubmissionReport,
  buildSubmissionSummary,
  buildSubmissionStepOutputs,
  buildSnapshotPayload,
  buildUvResolvedDependencies,
  collectDirectDependencyScopes,
  parseArgs,
  selectRoots,
  submitSnapshot,
} = require('./submit-dependency-snapshots');

test('collectDirectDependencyScopes prefers runtime over development for duplicated names', () => {
  const scopes = collectDirectDependencyScopes({
    dependencies: {
      react: '^19.0.0',
    },
    devDependencies: {
      react: '^19.0.0',
      vitest: '^3.2.4',
    },
    optionalDependencies: {
      sharp: '^0.34.5',
    },
  });

  assert.equal(scopes.get('react'), 'runtime');
  assert.equal(scopes.get('vitest'), 'development');
  assert.equal(scopes.get('sharp'), 'runtime');
});

test('buildPnpmResolvedDependencies keeps direct/runtime and indirect/development facts stable', () => {
  const resolved = buildPnpmResolvedDependencies(
    {
      dependencies: {
        next: {
          version: '15.5.14',
          dependencies: {
            react: {
              version: '19.2.4',
            },
            flatted: {
              version: '3.4.2',
            },
          },
        },
        vitest: {
          version: '3.2.4',
          dependencies: {
            react: {
              version: '19.2.4',
            },
            chai: {
              version: '5.2.1',
            },
          },
        },
      },
    },
    {
      dependencies: {
        next: '^15.5.14',
      },
      devDependencies: {
        vitest: '^3.2.4',
      },
    },
  );

  assert.deepEqual(resolved['next@15.5.14'], {
    package_url: 'pkg:/npm/next@15.5.14',
    relationship: 'direct',
    scope: 'runtime',
    dependencies: ['flatted@3.4.2', 'react@19.2.4'],
  });
  assert.deepEqual(resolved['vitest@3.2.4'], {
    package_url: 'pkg:/npm/vitest@3.2.4',
    relationship: 'direct',
    scope: 'development',
    dependencies: ['chai@5.2.1', 'react@19.2.4'],
  });
  assert.deepEqual(resolved['react@19.2.4'], {
    package_url: 'pkg:/npm/react@19.2.4',
    relationship: 'indirect',
    scope: 'runtime',
    dependencies: [],
  });
  assert.deepEqual(resolved['chai@5.2.1'], {
    package_url: 'pkg:/npm/chai@5.2.1',
    relationship: 'indirect',
    scope: 'development',
    dependencies: [],
  });
});

test('buildSnapshotPayload uses lockfile manifest and stable correlator', () => {
  const payload = buildSnapshotPayload({
    root: {
      rootDir: 'web',
      rootLabel: 'web',
      manifestPath: 'web/package.json',
      lockfilePath: 'web/pnpm-lock.yaml',
    },
    runtimeTree: {
      dependencies: {
        next: {
          version: '15.5.14',
        },
      },
    },
    developmentTree: {
      dependencies: {
        vitest: {
          version: '3.2.4',
        },
      },
    },
    repository: {
      owner: 'taichuy',
      repo: '7flows',
    },
    sha: 'abc123',
    ref: 'refs/heads/taichuy_dev',
  });

  assert.equal(payload.version, 0);
  assert.equal(payload.sha, 'abc123');
  assert.equal(payload.ref, 'refs/heads/taichuy_dev');
  assert.equal(payload.job.correlator, '7flows-dependency-submission:web');
  assert.equal(payload.detector.name, '7flows-dependency-submission');
  assert.deepEqual(payload.manifests, {
    'web/pnpm-lock.yaml': {
      name: 'web/pnpm-lock.yaml',
      file: {
        source_location: 'web/pnpm-lock.yaml',
      },
      resolved: {
        'next@15.5.14': {
          package_url: 'pkg:/npm/next@15.5.14',
          relationship: 'direct',
          scope: 'runtime',
          dependencies: [],
        },
        'vitest@3.2.4': {
          package_url: 'pkg:/npm/vitest@3.2.4',
          relationship: 'direct',
          scope: 'development',
          dependencies: [],
        },
      },
    },
  });
});

test('parseArgs and selectRoots support explicit root selection', () => {
  const options = parseArgs([
    '--root',
    'web',
    '--dry-run',
    '--output',
    'tmp/snapshot.json',
    '--report-output',
    'tmp/report.json',
  ]);
  assert.equal(options.dryRun, true);
  assert.equal(options.outputPath, 'tmp/snapshot.json');
  assert.equal(options.reportOutputPath, 'tmp/report.json');
  assert.deepEqual(options.requestedRoots, ['web']);

  const selected = selectRoots(
    [
      { rootDir: 'web', rootLabel: 'web' },
      { rootDir: 'docs/demo', rootLabel: 'docs/demo' },
    ],
    ['web'],
  );
  assert.deepEqual(selected, [{ rootDir: 'web', rootLabel: 'web' }]);
});

test('buildUvResolvedDependencies keeps runtime and development facts stable', () => {
  const resolved = buildUvResolvedDependencies(`version = 1

[[package]]
name = "sevenflows-api"
version = "0.1.0"
source = { editable = "." }
dependencies = [
    { name = "fastapi" },
    { name = "pydantic-settings" },
]

[package.optional-dependencies]
dev = [
    { name = "pytest" },
]

[[package]]
name = "fastapi"
version = "0.135.1"
source = { registry = "https://pypi.org/simple" }
dependencies = [
    { name = "pydantic" },
    { name = "starlette" },
]

[[package]]
name = "pydantic-settings"
version = "2.13.1"
source = { registry = "https://pypi.org/simple" }
dependencies = [
    { name = "pydantic" },
    { name = "python-dotenv" },
]

[[package]]
name = "pytest"
version = "8.4.2"
source = { registry = "https://pypi.org/simple" }
dependencies = [
    { name = "pluggy" },
]

[[package]]
name = "pydantic"
version = "2.12.5"
source = { registry = "https://pypi.org/simple" }
dependencies = [
    { name = "annotated-types" },
]

[[package]]
name = "starlette"
version = "1.0.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "python-dotenv"
version = "1.2.2"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "pluggy"
version = "1.6.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "annotated-types"
version = "0.7.0"
source = { registry = "https://pypi.org/simple" }
`);

  assert.deepEqual(resolved['fastapi@0.135.1'], {
    package_url: 'pkg:pypi/fastapi@0.135.1',
    relationship: 'direct',
    scope: 'runtime',
    dependencies: ['pydantic@2.12.5', 'starlette@1.0.0'],
  });
  assert.deepEqual(resolved['pydantic-settings@2.13.1'], {
    package_url: 'pkg:pypi/pydantic-settings@2.13.1',
    relationship: 'direct',
    scope: 'runtime',
    dependencies: ['pydantic@2.12.5', 'python-dotenv@1.2.2'],
  });
  assert.deepEqual(resolved['pytest@8.4.2'], {
    package_url: 'pkg:pypi/pytest@8.4.2',
    relationship: 'direct',
    scope: 'development',
    dependencies: ['pluggy@1.6.0'],
  });
  assert.deepEqual(resolved['pydantic@2.12.5'], {
    package_url: 'pkg:pypi/pydantic@2.12.5',
    relationship: 'indirect',
    scope: 'runtime',
    dependencies: ['annotated-types@0.7.0'],
  });
  assert.deepEqual(resolved['pluggy@1.6.0'], {
    package_url: 'pkg:pypi/pluggy@1.6.0',
    relationship: 'indirect',
    scope: 'development',
    dependencies: [],
  });
});

test('submitSnapshot classifies disabled dependency graph as repository blocker', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({
      message: 'The Dependency graph is disabled for this repository. Please enable it before submitting snapshots.',
    }),
  });

  await assert.rejects(
    submitSnapshot(
      {
        owner: 'taichuy',
        repo: '7flows',
      },
      {
        version: 0,
      },
      'token',
    ),
    (error) => {
      assert.ok(error instanceof DependencySubmissionError);
      assert.equal(error.kind, 'dependency_graph_disabled');
      assert.match(error.message, /HTTP 404/);
      assert.match(error.hint, /Dependency graph/);
      return true;
    },
  );

  global.fetch = originalFetch;
});

test('buildSubmissionSummary surfaces blocked repository settings explicitly', () => {
  const summary = buildSubmissionSummary(
    [
      {
        rootLabel: 'web',
        status: 'blocked',
        ecosystem: 'pnpm',
        manifestPath: 'web/package.json',
        lockfilePath: 'web/pnpm-lock.yaml',
        resolvedCount: 12,
        directCount: 3,
        runtimeCount: 10,
        developmentCount: 2,
        blockedReason:
          'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`。',
        blockedKind: 'dependency_graph_disabled',
        blockedStatus: 404,
        blockedMessage: 'Dependency graph is disabled for this repository.',
      },
    ],
    false,
  );

  assert.match(summary.join('\n'), /repository blocker: GitHub `Dependency graph` 未开启/);
  assert.match(summary.join('\n'), /blocker evidence: kind=`dependency_graph_disabled`, status=`404`, roots=`web`/);
  assert.match(summary.join('\n'), /blocker message: Dependency graph is disabled for this repository\./);
  assert.match(summary.join('\n'), /status: `blocked`/);
  assert.match(summary.join('\n'), /blocked reason: GitHub 仓库当前未开启/);
  assert.match(summary.join('\n'), /Recommended next steps/);
  assert.match(summary.join('\n'), /\[repository_admin\] `enable_dependency_graph`/);
});

test('buildSubmissionReport keeps machine-readable root evidence stable', () => {
  const report = buildSubmissionReport(
    [
      {
        rootLabel: 'web',
        status: 'submitted',
        ecosystem: 'pnpm',
        manifestPath: 'web/package.json',
        lockfilePath: 'web/pnpm-lock.yaml',
        resolvedCount: 12,
        directCount: 3,
        runtimeCount: 10,
        developmentCount: 2,
        snapshotId: 'snapshot-123',
        warning: '当前 pnpm lockfile-only snapshot 仍未暴露 development roots。',
      },
      {
        rootLabel: 'api',
        status: 'blocked',
        ecosystem: 'uv',
        manifestPath: 'api/pyproject.toml',
        lockfilePath: 'api/uv.lock',
        resolvedCount: 18,
        directCount: 5,
        runtimeCount: 12,
        developmentCount: 6,
        blockedReason:
          'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`。',
        blockedKind: 'dependency_graph_disabled',
        blockedStatus: 404,
        blockedMessage: 'Dependency graph is disabled for this repository.',
      },
    ],
    {
      repository: {
        owner: 'taichuy',
        repo: '7flows',
      },
      sha: 'abc123',
      ref: 'refs/heads/taichuy_dev',
    },
  );

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.mode, 'submission');
  assert.equal(report.repository.owner, 'taichuy');
  assert.equal(report.sha, 'abc123');
  assert.match(report.repositoryBlocker, /Dependency graph/);
  assert.deepEqual(report.repositoryBlockerEvidence, {
    kind: 'dependency_graph_disabled',
    status: 404,
    message: 'Dependency graph is disabled for this repository.',
    rootLabels: ['api'],
    consistentAcrossRoots: true,
  });
  assert.deepEqual(report.recommendedActions, [
    {
      priority: 1,
      audience: 'repository_admin',
      code: 'enable_dependency_graph',
      summary:
        '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
      rationale:
        'dependency submission API 已直接返回 `dependency_graph_disabled` / `404`，当前阻塞来自仓库设置而不是本地 lock 解析。',
      roots: ['api'],
    },
    {
      priority: 2,
      audience: 'workflow_maintainer',
      code: 'rerun_dependency_graph_submission',
      summary:
        '仓库设置更新后手动重跑 `Dependency Graph Submission` workflow，确认 `repositoryBlockerEvidence` 消失并刷新 `dependencyGraphVisibility`。',
      rationale:
        '只有重新提交 snapshot，才能验证 GitHub 是否开始接受当前 roots 并把 manifests 写入 dependency graph。',
      roots: ['api'],
    },
    {
      priority: 3,
      audience: 'workflow_maintainer',
      code: 'rerun_github_security_drift',
      summary:
        '待 submission 重新成功后重跑 `GitHub Security Drift`，确认 `dependabot-drift.json` 是否收口到最新 graph 事实。',
      rationale:
        'security drift 需要消费最新 dependency submission evidence，才能区分平台刷新延迟与真实依赖问题。',
      roots: [],
    },
  ]);
  assert.deepEqual(report.roots, [
    {
      rootLabel: 'web',
      status: 'submitted',
      ecosystem: 'pnpm',
      manifestPath: 'web/package.json',
      lockfilePath: 'web/pnpm-lock.yaml',
      resolvedCount: 12,
      directCount: 3,
      runtimeCount: 10,
      developmentCount: 2,
      snapshotId: 'snapshot-123',
      blockedReason: null,
      blockedKind: null,
      blockedStatus: null,
      blockedMessage: null,
      warning: '当前 pnpm lockfile-only snapshot 仍未暴露 development roots。',
    },
    {
      rootLabel: 'api',
      status: 'blocked',
      ecosystem: 'uv',
      manifestPath: 'api/pyproject.toml',
      lockfilePath: 'api/uv.lock',
      resolvedCount: 18,
      directCount: 5,
      runtimeCount: 12,
      developmentCount: 6,
      snapshotId: null,
      blockedReason:
        'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`。',
      blockedKind: 'dependency_graph_disabled',
      blockedStatus: 404,
      blockedMessage: 'Dependency graph is disabled for this repository.',
      warning: null,
    },
  ]);
});

test('buildDependencyGraphVisibilityReport maps visible and missing roots after submission', () => {
  const visibility = buildDependencyGraphVisibilityReport(
    [
      {
        rootDir: 'api',
        rootLabel: 'api',
        ecosystem: 'uv',
        dependencyGraphSupport: 'dependency_submission',
        manifestPath: 'api/pyproject.toml',
        lockfilePath: 'api/uv.lock',
      },
      {
        rootDir: 'web',
        rootLabel: 'web',
        ecosystem: 'pnpm',
        dependencyGraphSupport: 'native',
        manifestPath: 'web/package.json',
        lockfilePath: 'web/pnpm-lock.yaml',
      },
    ],
    [
      {
        filename: 'web/package.json',
        dependenciesCount: 17,
        parseable: true,
        exceedsMaxSize: false,
      },
    ],
    'taichuy_dev',
  );

  assert.equal(visibility.defaultBranch, 'taichuy_dev');
  assert.equal(visibility.manifestCount, 1);
  assert.deepEqual(visibility.visibleRoots, ['web']);
  assert.deepEqual(visibility.missingRoots, ['api']);
  assert.deepEqual(visibility.coverage, [
    {
      rootLabel: 'api',
      ecosystem: 'uv',
      manifestPath: 'api/pyproject.toml',
      lockfilePath: 'api/uv.lock',
      dependencyGraphSupport: 'dependency_submission',
      graphVisible: false,
      matchedGraphFilenames: [],
    },
    {
      rootLabel: 'web',
      ecosystem: 'pnpm',
      manifestPath: 'web/package.json',
      lockfilePath: 'web/pnpm-lock.yaml',
      dependencyGraphSupport: 'native',
      graphVisible: true,
      matchedGraphFilenames: ['web/package.json'],
    },
  ]);
});

test('buildSubmissionSummary and report include dependency graph visibility evidence', () => {
  const dependencyGraphVisibility = {
    checkedAt: '2026-03-25T02:30:00.000Z',
    defaultBranch: 'taichuy_dev',
    manifestCount: 1,
    manifests: [
      {
        filename: 'web/package.json',
        dependenciesCount: 17,
        parseable: true,
        exceedsMaxSize: false,
      },
    ],
    coverage: [],
    visibleRoots: ['web'],
    missingRoots: ['api'],
  };

  const summary = buildSubmissionSummary(
    [
      {
        rootLabel: 'web',
        status: 'submitted',
        ecosystem: 'pnpm',
        manifestPath: 'web/package.json',
        lockfilePath: 'web/pnpm-lock.yaml',
        resolvedCount: 17,
        directCount: 3,
        runtimeCount: 11,
        developmentCount: 6,
        snapshotId: 'snapshot-web',
      },
    ],
    false,
    dependencyGraphVisibility,
  ).join('\n');

  assert.match(summary, /Dependency graph manifest visibility/);
  assert.match(summary, /visible roots now: `web`/);
  assert.match(summary, /roots not yet visible: `api`/);
  assert.match(summary, /\[workflow_maintainer\] `recheck_dependency_graph_visibility`/);

  const report = buildSubmissionReport(
    [
      {
        rootLabel: 'web',
        status: 'submitted',
        ecosystem: 'pnpm',
        manifestPath: 'web/package.json',
        lockfilePath: 'web/pnpm-lock.yaml',
        resolvedCount: 17,
        directCount: 3,
        runtimeCount: 11,
        developmentCount: 6,
        snapshotId: 'snapshot-web',
      },
    ],
    {
      repository: { owner: 'taichuy', repo: '7flows' },
      sha: 'abc123',
      ref: 'refs/heads/taichuy_dev',
      dependencyGraphVisibility,
    },
  );

  assert.equal(report.dependencyGraphVisibility.manifestCount, 1);
  assert.deepEqual(report.dependencyGraphVisibility.visibleRoots, ['web']);
  assert.deepEqual(report.dependencyGraphVisibility.missingRoots, ['api']);
  assert.deepEqual(report.recommendedActions, [
    {
      priority: 1,
      audience: 'workflow_maintainer',
      code: 'recheck_dependency_graph_visibility',
      summary:
        '保留当前 artifact，稍后重跑 `Dependency Graph Submission` 或等待 GitHub 刷新，再确认 `missingRoots` 是否消失。',
      rationale:
        '当前 submission 已成功提交，但仍有 roots 暂未在 `dependencyGraphManifests` 中可见，需要继续区分平台刷新延迟与持续缺席。',
      roots: ['api'],
    },
  ]);
});

test('buildSubmissionStepOutputs expose stable blocker and follow-up fields', () => {
  const report = buildSubmissionReport(
    [
      {
        rootLabel: 'web',
        status: 'submitted',
        ecosystem: 'pnpm',
        manifestPath: 'web/package.json',
        lockfilePath: 'web/pnpm-lock.yaml',
        resolvedCount: 17,
        directCount: 3,
        runtimeCount: 11,
        developmentCount: 6,
        snapshotId: 'snapshot-web',
      },
      {
        rootLabel: 'api',
        status: 'blocked',
        ecosystem: 'uv',
        manifestPath: 'api/pyproject.toml',
        lockfilePath: 'api/uv.lock',
        resolvedCount: 18,
        directCount: 5,
        runtimeCount: 12,
        developmentCount: 6,
        blockedReason:
          'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`。',
        blockedKind: 'dependency_graph_disabled',
        blockedStatus: 404,
        blockedMessage: 'Dependency graph is disabled for this repository.',
      },
    ],
    {
      repository: { owner: 'taichuy', repo: '7flows' },
      sha: 'abc123',
      ref: 'refs/heads/taichuy_dev',
      dependencyGraphVisibility: {
        checkedAt: '2026-03-25T02:30:00.000Z',
        defaultBranch: 'taichuy_dev',
        manifestCount: 1,
        manifests: [],
        coverage: [],
        visibleRoots: ['web'],
        missingRoots: ['api'],
      },
    },
  );

  const outputs = buildSubmissionStepOutputs(report);

  assert.equal(outputs.submission_mode, 'submission');
  assert.equal(outputs.recommended_actions_count, '3');
  assert.equal(outputs.primary_recommended_action_code, 'enable_dependency_graph');
  assert.equal(outputs.primary_recommended_action_audience, 'repository_admin');
  assert.equal(outputs.repository_blocker_kind, 'dependency_graph_disabled');
  assert.equal(outputs.repository_blocker_status, '404');
  assert.equal(outputs.repository_blocker_roots_json, JSON.stringify(['api']));
  assert.equal(outputs.dependency_graph_visible_roots_json, JSON.stringify(['web']));
  assert.equal(outputs.dependency_graph_missing_roots_json, JSON.stringify(['api']));
  assert.equal(outputs.dependency_graph_check_error, '');
});
