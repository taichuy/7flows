const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildWorkspaceManifestCoverage } = require('./check-dependabot-drift');
const {
  buildRecommendedActionsOutputs,
  buildRecommendedActionsMarkdownLines,
  buildSubmissionRecommendedActions,
  normalizeRecommendedActions,
  writeGitHubOutputs,
} = require('./dependency-governance-actions');

const {
  buildWorkspaceManifestInventory,
  collectTrackedFiles,
  normalizePythonPackageName,
} = require('./check-dependabot-drift');

const repoRoot = path.resolve(__dirname, '..');
const detectorName = '7flows-dependency-submission';
const detectorVersion = '0.2.0';
const developmentOptionalDependencyGroups = new Set(['ci', 'dev', 'docs', 'lint', 'test', 'tests']);
const dependencyGraphDisabledPattern = /dependency graph is disabled/i;
const dependencyGraphSettingsHint =
  'GitHub 仓库当前未开启 `Dependency graph`；请先到 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时再检查 `Automatic dependency submission`。';
const repositoryBlockerSummary =
  'GitHub `Dependency graph` 未开启；workflow 已保留证据并降级为 warning，而不是把当前代码事实误判成实现失败。';

class DependencySubmissionError extends Error {
  constructor({ kind, status, message, hint = null, responseMessage = null }) {
    super(message);
    this.name = 'DependencySubmissionError';
    this.kind = kind;
    this.status = status;
    this.hint = hint;
    this.responseMessage = responseMessage;
  }
}

function buildRepositoryBlockerEvidence(items) {
  const blockedItems = items.filter(
    (item) => item.status === 'blocked' && (item.blockedKind || item.blockedStatus || item.blockedMessage),
  );
  if (blockedItems.length === 0) {
    return null;
  }

  const rootLabels = blockedItems.map((item) => item.rootLabel).filter(Boolean);
  const firstItem = blockedItems[0];
  const consistentAcrossRoots = blockedItems.every(
    (item) =>
      item.blockedKind === firstItem.blockedKind &&
      item.blockedStatus === firstItem.blockedStatus &&
      item.blockedMessage === firstItem.blockedMessage,
  );

  return {
    kind: consistentAcrossRoots ? firstItem.blockedKind || null : null,
    status:
      consistentAcrossRoots && Number.isInteger(firstItem.blockedStatus) ? firstItem.blockedStatus : null,
    message: consistentAcrossRoots ? firstItem.blockedMessage || null : null,
    rootLabels,
    consistentAcrossRoots,
  };
}

function run(command, args, baseRepoRoot = repoRoot) {
  return execFileSync(command, args, {
    cwd: baseRepoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseRemoteRepository(remoteUrl) {
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/(.+?)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  throw new Error(`无法解析 remote.origin.url: ${remoteUrl}`);
}

function resolveRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    if (owner && repo) {
      return { owner, repo };
    }
  }

  return parseRemoteRepository(run('git', ['remote', 'get-url', 'origin']));
}

function resolveSha() {
  return process.env.GITHUB_SHA || run('git', ['rev-parse', 'HEAD']);
}

function resolveRef() {
  if (process.env.GITHUB_REF) {
    return process.env.GITHUB_REF;
  }

  const branch = run('git', ['branch', '--show-current']);
  if (!branch) {
    throw new Error('无法解析当前 ref，请在 GitHub Actions 中运行或设置 GITHUB_REF。');
  }

  return `refs/heads/${branch}`;
}

function encodeNpmPackageName(packageName) {
  return packageName.startsWith('@') ? `%40${packageName.slice(1)}` : packageName;
}

function buildNpmPackageUrl(packageName, version) {
  return `pkg:/npm/${encodeNpmPackageName(packageName)}@${version}`;
}

function buildPythonPackageUrl(packageName, version) {
  return `pkg:pypi/${normalizePythonPackageName(packageName)}@${version}`;
}

function buildDependencyKey(packageName, version) {
  return `${packageName}@${version}`;
}

function collectInlineTableDependencyNames(blockText) {
  return [...String(blockText || '').matchAll(/\{\s*name\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
}

function extractArrayBody(blockText, key) {
  const pattern = new RegExp(`^${key}\\s*=\\s*\\[([\\s\\S]*?)^\\]`, 'm');
  const match = String(blockText || '').match(pattern);
  return match ? match[1] : '';
}

function parseUvOptionalDependencyGroups(blockText) {
  const groups = new Map();
  const lines = String(blockText || '').replace(/\r\n/g, '\n').split('\n');
  let insideOptionalDependencies = false;
  let currentGroup = null;
  let currentBody = '';

  function flushGroup() {
    if (!currentGroup) {
      return;
    }
    groups.set(currentGroup, collectInlineTableDependencyNames(currentBody));
    currentGroup = null;
    currentBody = '';
  }

  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (!insideOptionalDependencies) {
      if (trimmedLine === '[package.optional-dependencies]') {
        insideOptionalDependencies = true;
      }
      return;
    }

    if (!trimmedLine) {
      return;
    }

    if (trimmedLine.startsWith('[')) {
      flushGroup();
      insideOptionalDependencies = false;
      return;
    }

    const groupMatch = trimmedLine.match(/^([A-Za-z0-9_.-]+)\s*=\s*\[(.*)$/);
    if (groupMatch) {
      flushGroup();
      currentGroup = groupMatch[1];
      currentBody = groupMatch[2];
      if (trimmedLine.includes(']')) {
        flushGroup();
      }
      return;
    }

    if (!currentGroup) {
      return;
    }

    currentBody = `${currentBody}\n${trimmedLine}`;
    if (trimmedLine.includes(']')) {
      flushGroup();
    }
  });

  flushGroup();
  return groups;
}

function parseUvLockPackages(lockfileText) {
  const blocks = String(lockfileText || '')
    .replace(/\r\n/g, '\n')
    .split('\n[[package]]\n')
    .map((block, index) => (index === 0 ? block.replace(/^\[\[package\]\]\n/, '') : block))
    .filter((block) => block.includes('name = '));

  const packages = new Map();
  let editableRoot = null;

  blocks.forEach((block) => {
    const nameMatch = block.match(/^name = "([^"]+)"$/m);
    const versionMatch = block.match(/^version = "([^"]+)"$/m);

    if (!nameMatch || !versionMatch) {
      return;
    }

    const packageName = nameMatch[1];
    const normalizedName = normalizePythonPackageName(packageName);
    const dependencyKey = buildDependencyKey(normalizedName, versionMatch[1]);
    const dependencies = collectInlineTableDependencyNames(extractArrayBody(block, 'dependencies')).map(
      normalizePythonPackageName,
    );
    const optionalDependencies = new Map(
      [...parseUvOptionalDependencyGroups(block).entries()].map(([groupName, dependencyNames]) => [
        groupName,
        dependencyNames.map(normalizePythonPackageName),
      ]),
    );
    const entry = {
      name: packageName,
      normalizedName,
      version: versionMatch[1],
      dependencyKey,
      packageUrl: buildPythonPackageUrl(packageName, versionMatch[1]),
      dependencies,
      optionalDependencies,
      editable: /^source = \{ editable = "\." \}$/m.test(block),
    };

    packages.set(normalizedName, entry);
    if (entry.editable) {
      editableRoot = entry;
    }
  });

  return { packages, editableRoot };
}

function resolveUvOptionalDependencyScope(groupName) {
  return developmentOptionalDependencyGroups.has(String(groupName || '').toLowerCase())
    ? 'development'
    : 'runtime';
}

function registerUvDependency({ packageName, packageMap, scope, relationship, state }) {
  const normalizedName = normalizePythonPackageName(packageName);
  const packageEntry = packageMap.get(normalizedName);

  if (!packageEntry) {
    throw new Error(`uv lock 缺少依赖 ${packageName} 的 package block，无法构建 dependency snapshot。`);
  }

  const childDependencyKeys = packageEntry.dependencies
    .map((childName) =>
      registerUvDependency({
        packageName: childName,
        packageMap,
        scope,
        relationship: 'indirect',
        state,
      }),
    )
    .filter(Boolean);

  upsertResolvedDependency(state, packageEntry.dependencyKey, {
    package_url: packageEntry.packageUrl,
    relationship,
    scope,
    dependencies: [...new Set(childDependencyKeys)].sort(),
  });

  return packageEntry.dependencyKey;
}

function buildUvResolvedDependencies(lockfileText) {
  const { packages, editableRoot } = parseUvLockPackages(lockfileText);
  if (!editableRoot) {
    throw new Error('uv lock 缺少 editable root package，无法识别 direct dependencies。');
  }

  const state = new Map();
  editableRoot.dependencies.forEach((dependencyName) => {
    registerUvDependency({
      packageName: dependencyName,
      packageMap: packages,
      scope: 'runtime',
      relationship: 'direct',
      state,
    });
  });

  editableRoot.optionalDependencies.forEach((dependencyNames, groupName) => {
    const scope = resolveUvOptionalDependencyScope(groupName);
    dependencyNames.forEach((dependencyName) => {
      registerUvDependency({
        packageName: dependencyName,
        packageMap: packages,
        scope,
        relationship: 'direct',
        state,
      });
    });
  });

  return finalizeResolvedDependencies(state);
}

function mergeDependencyScope(currentScope, nextScope) {
  return currentScope === 'runtime' || nextScope === 'runtime' ? 'runtime' : 'development';
}

function mergeDependencyRelationship(currentRelationship, nextRelationship) {
  return currentRelationship === 'direct' || nextRelationship === 'direct' ? 'direct' : 'indirect';
}

function collectDirectDependencyScopes(packageJson) {
  const scopes = new Map();

  Object.keys(packageJson.devDependencies || {}).forEach((dependencyName) => {
    scopes.set(dependencyName, 'development');
  });

  Object.keys(packageJson.optionalDependencies || {}).forEach((dependencyName) => {
    scopes.set(dependencyName, 'runtime');
  });

  Object.keys(packageJson.dependencies || {}).forEach((dependencyName) => {
    scopes.set(dependencyName, 'runtime');
  });

  return scopes;
}

function upsertResolvedDependency(state, dependencyKey, entry) {
  const current = state.get(dependencyKey);
  if (!current) {
    state.set(dependencyKey, {
      package_url: entry.package_url,
      relationship: entry.relationship,
      scope: entry.scope,
      dependencies: [...entry.dependencies],
    });
    return;
  }

  current.relationship = mergeDependencyRelationship(current.relationship, entry.relationship);
  current.scope = mergeDependencyScope(current.scope, entry.scope);
  current.dependencies = [...new Set([...current.dependencies, ...entry.dependencies])].sort();
}

function registerPnpmDependency({ dependencyName, dependencyNode, scope, relationship, state }) {
  if (!dependencyNode || typeof dependencyNode !== 'object') {
    return null;
  }

  if (!dependencyNode.version) {
    throw new Error(`pnpm tree node ${dependencyName} 缺少 version 字段。`);
  }

  const dependencyKey = buildDependencyKey(dependencyName, dependencyNode.version);
  const dependencyEntries = Object.entries(dependencyNode.dependencies || {});
  const childDependencyKeys = dependencyEntries
    .map(([childName, childNode]) =>
      registerPnpmDependency({
        dependencyName: childName,
        dependencyNode: childNode,
        scope,
        relationship: 'indirect',
        state,
      }),
    )
    .filter(Boolean);

  upsertResolvedDependency(state, dependencyKey, {
    package_url: buildNpmPackageUrl(dependencyName, dependencyNode.version),
    relationship,
    scope,
    dependencies: [...new Set(childDependencyKeys)].sort(),
  });

  return dependencyKey;
}

function buildPnpmResolvedDependencies(pnpmListTree, packageJson) {
  if (!pnpmListTree || typeof pnpmListTree !== 'object') {
    throw new Error('pnpm 依赖树为空，无法构建 dependency snapshot。');
  }

  const state = new Map();
  const directScopes = collectDirectDependencyScopes(packageJson);

  Object.entries(pnpmListTree.dependencies || {}).forEach(([dependencyName, dependencyNode]) => {
    registerPnpmDependency({
      dependencyName,
      dependencyNode,
      scope: directScopes.get(dependencyName) || 'runtime',
      relationship: 'direct',
      state,
    });
  });

  return Object.fromEntries(
    [...state.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([dependencyKey, entry]) => [dependencyKey, { ...entry, dependencies: [...entry.dependencies].sort() }]),
  );
}

function finalizeResolvedDependencies(state) {
  return Object.fromEntries(
    [...state.entries()]
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([dependencyKey, entry]) => [dependencyKey, { ...entry, dependencies: [...entry.dependencies].sort() }]),
  );
}

function buildScopedPnpmResolvedDependencies(scopedTrees) {
  const state = new Map();

  scopedTrees.forEach(({ tree, scope }) => {
    Object.entries(tree.dependencies || {}).forEach(([dependencyName, dependencyNode]) => {
      registerPnpmDependency({
        dependencyName,
        dependencyNode,
        scope,
        relationship: 'direct',
        state,
      });
    });
  });

  return finalizeResolvedDependencies(state);
}

function loadPnpmDependencyTree(rootDir, dependencySelector) {
  const args = [
    'pnpm',
    '--dir',
    rootDir,
    'list',
    '--json',
    '--depth',
    'Infinity',
    '--lockfile-only',
  ];

  if (dependencySelector === 'runtime') {
    args.push('--prod');
  }

  if (dependencySelector === 'development') {
    args.push('--dev');
  }

  const output = run('corepack', args);

  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed[0]) {
    throw new Error(`无法解析 ${rootDir} 的 pnpm list 输出。`);
  }

  return parsed[0];
}

function loadScopedPnpmDependencyTrees(rootDir) {
  return {
    runtimeTree: loadPnpmDependencyTree(rootDir, 'runtime'),
    developmentTree: loadPnpmDependencyTree(rootDir, 'development'),
  };
}

function discoverPnpmRoots() {
  return discoverDependencySubmissionRoots().filter((item) => item.ecosystem === 'pnpm');
}

function discoverDependencySubmissionRoots() {
  return buildWorkspaceManifestInventory(collectTrackedFiles()).filter(
    (item) => ['pnpm', 'uv'].includes(item.ecosystem) && item.manifestPath && item.lockfilePath,
  );
}

function loadResolvedDependenciesForRoot(root) {
  if (root.ecosystem === 'pnpm') {
    const packageJson = readJson(path.join(repoRoot, root.manifestPath));
    const { runtimeTree, developmentTree } = loadScopedPnpmDependencyTrees(root.rootDir);
    return {
      resolved: buildScopedPnpmResolvedDependencies([
        { tree: runtimeTree, scope: 'runtime' },
        { tree: developmentTree, scope: 'development' },
      ]),
      metadata: {
        packageJson,
      },
    };
  }

  if (root.ecosystem === 'uv') {
    return {
      resolved: buildUvResolvedDependencies(fs.readFileSync(path.join(repoRoot, root.lockfilePath), 'utf8')),
      metadata: {},
    };
  }

  throw new Error(`暂不支持 ${root.ecosystem} root 的 dependency snapshot。`);
}

function buildRootWarning(root, counters, metadata) {
  if (
    root.ecosystem === 'pnpm' &&
    Object.keys(metadata.packageJson?.devDependencies || {}).length > 0 &&
    counters.developmentCount === 0
  ) {
    return '当前 pnpm lockfile-only snapshot 仍未暴露 development roots；本 workflow 先优先保障 runtime dependency graph 覆盖。';
  }

  return null;
}

function buildSnapshotPayload({ root, resolved, runtimeTree, developmentTree, repository, sha, ref }) {
  const resolvedDependencies =
    resolved ||
    buildScopedPnpmResolvedDependencies([
      { tree: runtimeTree, scope: 'runtime' },
      { tree: developmentTree, scope: 'development' },
    ]);
  const rootLabel = root.rootLabel || root.rootDir || '.';
  const repositoryUrl = `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repository.owner}/${repository.repo}`;

  return {
    version: 0,
    sha,
    ref,
    job: {
      correlator: `${detectorName}:${rootLabel}`,
      id: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}:${rootLabel}` : `${Date.now()}:${rootLabel}`,
    },
    detector: {
      name: detectorName,
      version: detectorVersion,
      url: repositoryUrl,
    },
    scanned: new Date().toISOString(),
    manifests: {
      [root.lockfilePath]: {
        name: root.lockfilePath,
        file: {
          source_location: root.lockfilePath,
        },
        resolved: resolvedDependencies,
      },
    },
  };
}

function writeStepSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function resolveGitHubGraphqlUrl() {
  const explicitGraphqlUrl = String(process.env.GITHUB_GRAPHQL_URL || '').trim();
  if (explicitGraphqlUrl) {
    return explicitGraphqlUrl;
  }

  const apiUrl = String(process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  if (apiUrl === 'https://api.github.com') {
    return `${apiUrl}/graphql`;
  }
  if (apiUrl.endsWith('/api/v3')) {
    return `${apiUrl.slice(0, -3)}graphql`;
  }
  if (apiUrl.endsWith('/api')) {
    return `${apiUrl}/graphql`;
  }
  return `${apiUrl}/graphql`;
}

async function fetchDependencyGraphManifests(repository, token) {
  const response = await fetch(resolveGitHubGraphqlUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      query:
        'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { defaultBranchRef { name } dependencyGraphManifests(first: 100) { nodes { filename dependenciesCount parseable exceedsMaxSize } } } }',
      variables: {
        owner: repository.owner,
        name: repository.repo,
      },
    }),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const responseMessage = responseBody.message || 'unknown error';
    throw new Error(`读取 dependency graph manifests 失败（HTTP ${response.status}）：${responseMessage}`);
  }

  if (Array.isArray(responseBody.errors) && responseBody.errors.length > 0) {
    throw new Error(
      `读取 dependency graph manifests 失败：${responseBody.errors
        .map((item) => item.message || 'unknown graphql error')
        .join('; ')}`,
    );
  }

  const repositoryNode = responseBody?.data?.repository;
  if (!repositoryNode) {
    throw new Error('读取 dependency graph manifests 失败：响应里缺少 repository 节点。');
  }

  return {
    defaultBranch: repositoryNode.defaultBranchRef?.name || null,
    manifests: Array.isArray(repositoryNode.dependencyGraphManifests?.nodes)
      ? repositoryNode.dependencyGraphManifests.nodes
      : [],
  };
}

function buildDependencyGraphVisibilityReport(roots, manifestNodes, defaultBranch = null) {
  const coverage = buildWorkspaceManifestCoverage(roots, manifestNodes);

  return {
    checkedAt: new Date().toISOString(),
    defaultBranch: defaultBranch || null,
    manifestCount: manifestNodes.length,
    manifests: manifestNodes.map((node) => ({
      filename: node.filename,
      dependenciesCount: node.dependenciesCount,
      parseable: Boolean(node.parseable),
      exceedsMaxSize: Boolean(node.exceedsMaxSize),
    })),
    coverage: coverage.map((item) => ({
      rootLabel: item.rootLabel,
      ecosystem: item.ecosystem,
      manifestPath: item.manifestPath || null,
      lockfilePath: item.lockfilePath || null,
      dependencyGraphSupport: item.dependencyGraphSupport,
      graphVisible: item.graphVisible,
      matchedGraphFilenames: item.matchedGraphFilenames,
    })),
    visibleRoots: coverage.filter((item) => item.graphVisible).map((item) => item.rootLabel),
    missingRoots: coverage.filter((item) => !item.graphVisible).map((item) => item.rootLabel),
  };
}

function buildSubmissionSummary(
  items,
  dryRun,
  dependencyGraphVisibility = null,
  repositoryBlockerEvidence = buildRepositoryBlockerEvidence(items),
) {
  const header = dryRun ? '## Dependency snapshot dry run' : '## Dependency snapshot submission';
  const lines = [header, ''];
  const blockedItems = items.filter((item) => item.status === 'blocked');
  const recommendedActions = buildSubmissionRecommendedActions({
    items,
    dependencyGraphVisibility,
    repositoryBlockerEvidence,
  });

  if (blockedItems.length > 0) {
    lines.push(`- repository blocker: ${repositoryBlockerSummary}`);
    if (
      repositoryBlockerEvidence &&
      (repositoryBlockerEvidence.kind || repositoryBlockerEvidence.status !== null)
    ) {
      const evidenceParts = [];
      if (repositoryBlockerEvidence.kind) {
        evidenceParts.push(`kind=\`${repositoryBlockerEvidence.kind}\``);
      }
      if (repositoryBlockerEvidence.status !== null) {
        evidenceParts.push(`status=\`${repositoryBlockerEvidence.status}\``);
      }
      if (repositoryBlockerEvidence.rootLabels?.length > 0) {
        evidenceParts.push(
          `roots=${repositoryBlockerEvidence.rootLabels.map((item) => `\`${item}\``).join('、')}`,
        );
      }
      lines.push(`- blocker evidence: ${evidenceParts.join(', ')}`);
    }
    if (repositoryBlockerEvidence?.message) {
      lines.push(`- blocker message: ${repositoryBlockerEvidence.message}`);
    }
    lines.push('');
  }

  items.forEach((item) => {
    lines.push(`- root: \`${item.rootLabel}\``);
    if (item.status) {
      lines.push(`  - status: \`${item.status}\``);
    }
    lines.push(`  - ecosystem: \`${item.ecosystem}\``);
    lines.push(`  - manifest: \`${item.manifestPath}\``);
    lines.push(`  - lockfile: \`${item.lockfilePath}\``);
    lines.push(`  - resolved packages: \`${item.resolvedCount}\``);
    lines.push(`  - direct dependencies: \`${item.directCount}\``);
    lines.push(`  - runtime packages: \`${item.runtimeCount}\``);
    lines.push(`  - development packages: \`${item.developmentCount}\``);
    if (item.snapshotId) {
      lines.push(`  - snapshot id: \`${item.snapshotId}\``);
    }
    if (item.blockedReason) {
      lines.push(`  - blocked reason: ${item.blockedReason}`);
    }
    if (item.warning) {
      lines.push(`  - warning: ${item.warning}`);
    }
  });

  if (dependencyGraphVisibility) {
    lines.push('');
    lines.push('### Dependency graph manifest visibility');
    lines.push('');
    lines.push(`- checked at: \`${dependencyGraphVisibility.checkedAt}\``);
    if (dependencyGraphVisibility.defaultBranch) {
      lines.push(`- default branch: \`${dependencyGraphVisibility.defaultBranch}\``);
    }
    if (dependencyGraphVisibility.checkError) {
      lines.push(`- check error: ${dependencyGraphVisibility.checkError}`);
    } else {
      lines.push(`- manifest count: \`${dependencyGraphVisibility.manifestCount}\``);
      if (dependencyGraphVisibility.visibleRoots?.length > 0) {
        lines.push(
          `- visible roots now: ${dependencyGraphVisibility.visibleRoots
            .map((item) => `\`${item}\``)
            .join('、')}`,
        );
      }
      if (dependencyGraphVisibility.missingRoots?.length > 0) {
        lines.push(
          `- roots not yet visible: ${dependencyGraphVisibility.missingRoots
            .map((item) => `\`${item}\``)
            .join('、')}`,
        );
        lines.push('- 这表示 workflow 已保留“提交完成后的即时可见性”证据；若稍后仍缺席，再结合平台刷新延迟或仓库设置继续排查。');
      }
    }
  }

  const recommendedActionLines = buildRecommendedActionsMarkdownLines(recommendedActions);
  if (recommendedActionLines.length > 0) {
    lines.push('');
    lines.push(...recommendedActionLines);
  }

  return lines;
}

function buildSubmissionReport(
  items,
  {
    dryRun = false,
    repository = null,
    sha = null,
    ref = null,
    dependencyGraphVisibility = null,
    repositoryBlockerEvidence = buildRepositoryBlockerEvidence(items),
  } = {},
) {
  const blockedItems = items.filter((item) => item.status === 'blocked');
  const recommendedActions = buildSubmissionRecommendedActions({
    items,
    dependencyGraphVisibility,
    repositoryBlockerEvidence,
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: dryRun ? 'dry-run' : 'submission',
    repository,
    sha,
    ref,
    repositoryBlocker: blockedItems.length > 0 ? repositoryBlockerSummary : null,
    repositoryBlockerEvidence,
    recommendedActions: normalizeRecommendedActions(recommendedActions),
    dependencyGraphVisibility,
    roots: items.map((item) => ({
      rootLabel: item.rootLabel,
      status: item.status || (dryRun ? 'dry-run' : null),
      ecosystem: item.ecosystem,
      manifestPath: item.manifestPath,
      lockfilePath: item.lockfilePath,
      resolvedCount: item.resolvedCount,
      directCount: item.directCount,
      runtimeCount: item.runtimeCount,
      developmentCount: item.developmentCount,
      snapshotId: item.snapshotId || null,
      blockedReason: item.blockedReason || null,
      blockedKind: item.blockedKind || null,
      blockedStatus: Number.isInteger(item.blockedStatus) ? item.blockedStatus : null,
      blockedMessage: item.blockedMessage || null,
      warning: item.warning || null,
    })),
  };
}

function buildSubmissionStepOutputs(report) {
  const repositoryBlockerEvidence = report?.repositoryBlockerEvidence || null;
  const dependencyGraphVisibility = report?.dependencyGraphVisibility || null;

  return {
    ...buildRecommendedActionsOutputs(report?.recommendedActions),
    submission_mode: report?.mode || '',
    repository_blocker_kind: repositoryBlockerEvidence?.kind || '',
    repository_blocker_status:
      Number.isInteger(repositoryBlockerEvidence?.status)
        ? String(repositoryBlockerEvidence.status)
        : '',
    repository_blocker_roots_json: JSON.stringify(repositoryBlockerEvidence?.rootLabels || []),
    dependency_graph_visible_roots_json: JSON.stringify(
      dependencyGraphVisibility?.visibleRoots || [],
    ),
    dependency_graph_missing_roots_json: JSON.stringify(
      dependencyGraphVisibility?.missingRoots || [],
    ),
    dependency_graph_check_error: dependencyGraphVisibility?.checkError || '',
  };
}

function writeSubmissionStepOutputs(report) {
  writeGitHubOutputs(buildSubmissionStepOutputs(report));
}

async function submitSnapshot(repository, payload, token) {
  const response = await fetch(
    `${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repository.owner}/${repository.repo}/dependency-graph/snapshots`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(payload),
    },
  );

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const responseMessage = responseBody.message || 'unknown error';

    if (response.status === 404 && dependencyGraphDisabledPattern.test(responseMessage)) {
      throw new DependencySubmissionError({
        kind: 'dependency_graph_disabled',
        status: response.status,
        message: `dependency snapshot 提交被仓库设置阻塞（HTTP ${response.status}）：${responseMessage}`,
        hint: dependencyGraphSettingsHint,
        responseMessage,
      });
    }

    throw new DependencySubmissionError({
      kind: 'request_failed',
      status: response.status,
      message: `dependency snapshot 提交失败（HTTP ${response.status}）：${responseMessage}`,
      responseMessage,
    });
  }

  return responseBody;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    outputPath: null,
    reportOutputPath: null,
    requestedRoots: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (argument === '--output') {
      const outputPath = argv[index + 1];
      if (!outputPath) {
        throw new Error('--output 需要路径参数。');
      }
      options.outputPath = outputPath;
      index += 1;
      continue;
    }

    if (argument === '--report-output') {
      const reportOutputPath = argv[index + 1];
      if (!reportOutputPath) {
        throw new Error('--report-output 需要路径参数。');
      }
      options.reportOutputPath = reportOutputPath;
      index += 1;
      continue;
    }

    if (argument === '--root') {
      const rootDir = argv[index + 1];
      if (!rootDir) {
        throw new Error('--root 需要目录参数。');
      }
      options.requestedRoots.push(rootDir);
      index += 1;
      continue;
    }

    throw new Error(`未知参数: ${argument}`);
  }

  return options;
}

function selectRoots(availableRoots, requestedRoots) {
  if (!requestedRoots || requestedRoots.length === 0) {
    return availableRoots;
  }

  const selectedRoots = requestedRoots.map((requestedRoot) => {
    const matchedRoot = availableRoots.find(
      (item) => item.rootDir === requestedRoot || item.rootLabel === requestedRoot,
    );
    if (!matchedRoot) {
      throw new Error(`未找到 dependency submission root: ${requestedRoot}`);
    }
    return matchedRoot;
  });

  return [...new Map(selectedRoots.map((item) => [item.rootDir, item])).values()];
}

function summarizeResolvedDependencies(resolved) {
  const entries = Object.values(resolved);
  return {
    resolvedCount: entries.length,
    directCount: entries.filter((entry) => entry.relationship === 'direct').length,
    runtimeCount: entries.filter((entry) => entry.scope === 'runtime').length,
    developmentCount: entries.filter((entry) => entry.scope === 'development').length,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const roots = selectRoots(discoverDependencySubmissionRoots(), options.requestedRoots);

  if (roots.length === 0) {
    console.log('当前仓库没有可提交的 dependency snapshot roots。');
    return;
  }

  const repository = resolveRepository();
  const sha = resolveSha();
  const ref = resolveRef();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const summaries = [];
  const outputPayloads = {};
  let hasRepositoryBlockers = false;
  let dependencyGraphVisibility = null;

  for (const root of roots) {
    const { resolved, metadata } = loadResolvedDependenciesForRoot(root);
    const payload = buildSnapshotPayload({
      root,
      resolved,
      repository,
      sha,
      ref,
    });
    const manifest = payload.manifests[root.lockfilePath];
    const resolvedDependencies = manifest.resolved;
    const counters = summarizeResolvedDependencies(resolvedDependencies);
    const warning = buildRootWarning(root, counters, metadata);

    if (options.outputPath) {
      outputPayloads[root.rootLabel] = payload;
    }

    if (options.dryRun) {
      console.log(
        `dry-run: 已构建 ${root.rootLabel} dependency snapshot（resolved=${counters.resolvedCount}，direct=${counters.directCount}）。`,
      );
      summaries.push({
        rootLabel: root.rootLabel,
        ecosystem: root.ecosystem,
        manifestPath: root.manifestPath,
        lockfilePath: root.lockfilePath,
        warning,
        ...counters,
      });
      continue;
    }

    if (!token) {
      throw new Error('缺少 GITHUB_TOKEN 或 GH_TOKEN，无法提交 dependency snapshot。');
    }

    try {
      const responseBody = await submitSnapshot(repository, payload, token);
      const snapshotId = responseBody.id || responseBody.snapshot_id || 'unknown';
      console.log(
        `已提交 ${root.rootLabel} dependency snapshot（resolved=${counters.resolvedCount}，direct=${counters.directCount}，snapshot=${snapshotId}）。`,
      );
      summaries.push({
        rootLabel: root.rootLabel,
        status: 'submitted',
        ecosystem: root.ecosystem,
        manifestPath: root.manifestPath,
        lockfilePath: root.lockfilePath,
        snapshotId,
        warning,
        ...counters,
      });
    } catch (error) {
      if (error instanceof DependencySubmissionError && error.kind === 'dependency_graph_disabled') {
        hasRepositoryBlockers = true;
        console.warn(`warning: ${root.rootLabel} dependency snapshot 提交被仓库设置阻塞。${error.hint}`);
        summaries.push({
          rootLabel: root.rootLabel,
          status: 'blocked',
          ecosystem: root.ecosystem,
          manifestPath: root.manifestPath,
          lockfilePath: root.lockfilePath,
          blockedReason: error.hint,
          blockedKind: error.kind,
          blockedStatus: error.status,
          blockedMessage: error.responseMessage || error.message,
          warning,
          ...counters,
        });
        continue;
      }

      throw error;
    }
  }

  if (options.outputPath) {
    const outputPath = path.resolve(repoRoot, options.outputPath);
    const outputValue = roots.length === 1 ? outputPayloads[roots[0].rootLabel] : outputPayloads;
    fs.writeFileSync(outputPath, JSON.stringify(outputValue, null, 2));
  }

  if (!options.dryRun && token) {
    try {
      const manifestState = await fetchDependencyGraphManifests(repository, token);
      dependencyGraphVisibility = buildDependencyGraphVisibilityReport(
        roots,
        manifestState.manifests,
        manifestState.defaultBranch,
      );
    } catch (error) {
      dependencyGraphVisibility = {
        checkedAt: new Date().toISOString(),
        defaultBranch: null,
        manifestCount: null,
        manifests: [],
        coverage: [],
        visibleRoots: [],
        missingRoots: [],
        checkError: error.message,
      };
      console.warn(`warning: 无法读取 dependency graph manifests：${error.message}`);
    }
  }

  const summaryLines = buildSubmissionSummary(
    summaries,
    options.dryRun,
    dependencyGraphVisibility,
  );
  const report = buildSubmissionReport(summaries, {
    dryRun: options.dryRun,
    repository,
    sha,
    ref,
    dependencyGraphVisibility,
  });
  if (options.reportOutputPath) {
    const reportPath = path.resolve(repoRoot, options.reportOutputPath);
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(summaryLines.join('\n'));
  writeStepSummary(summaryLines);
  writeSubmissionStepOutputs(report);

  if (hasRepositoryBlockers) {
    process.exitCode = 2;
  }
}

module.exports = {
  DependencySubmissionError,
  buildPnpmResolvedDependencies,
  buildDependencyGraphVisibilityReport,
  buildRepositoryBlockerEvidence,
  buildSubmissionReport,
  buildSubmissionSummary,
  buildSubmissionStepOutputs,
  buildScopedPnpmResolvedDependencies,
  buildSnapshotPayload,
  buildUvResolvedDependencies,
  collectDirectDependencyScopes,
  discoverDependencySubmissionRoots,
  discoverPnpmRoots,
  parseArgs,
  selectRoots,
  submitSnapshot,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`执行失败: ${error.message}`);
    process.exit(1);
  });
}
