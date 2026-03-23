const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

function run(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
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

function normalizeVersion(version) {
  if (!version) {
    return null;
  }

  const match = String(version).match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left)?.split('.').map(Number);
  const rightParts = normalizeVersion(right)?.split('.').map(Number);

  if (!leftParts || !rightParts) {
    return null;
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }
  }

  return 0;
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectPackageVersions(lockfileText, packageName) {
  const exactMatcher = new RegExp(`^\\s{2}${escapeForRegex(packageName)}@([^:\\s(]+)`, 'gm');
  const versions = new Set();

  for (const match of lockfileText.matchAll(exactMatcher)) {
    const version = normalizeVersion(match[1]);
    if (version) {
      versions.add(version);
    }
  }

  return [...versions].sort((left, right) => compareVersions(left, right) ?? 0);
}

function collectPackageSpecifiers(packageJson, packageName) {
  const sources = [
    packageJson.dependencies || {},
    packageJson.devDependencies || {},
    (packageJson.pnpm && packageJson.pnpm.overrides) || {},
  ];
  const specifiers = [];

  for (const source of sources) {
    if (source[packageName]) {
      specifiers.push(source[packageName]);
    }
  }

  return specifiers;
}

function evaluateAlert(alert) {
  const manifestPath = alert.dependency.manifest_path;
  const manifestDirectory = path.dirname(path.join(repoRoot, manifestPath));
  const lockfileText = fs.readFileSync(path.join(repoRoot, manifestPath), 'utf8');
  const packageJsonPath = path.join(manifestDirectory, 'package.json');
  const packageJson = fs.existsSync(packageJsonPath) ? readJson(packageJsonPath) : null;
  const localVersions = collectPackageVersions(lockfileText, alert.dependency.package.name);
  const patchedVersion = normalizeVersion(alert.security_vulnerability.first_patched_version.identifier);
  const specifiers = packageJson
    ? collectPackageSpecifiers(packageJson, alert.dependency.package.name)
    : [];

  if (localVersions.length === 0) {
    return {
      manifestPath,
      packageName: alert.dependency.package.name,
      patchedVersion,
      localVersions,
      specifiers,
      state: 'unresolved',
      reason: '本地锁文件中没有解析到该依赖版本。',
    };
  }

  const hasVulnerableVersion = localVersions.some((version) => {
    const compared = compareVersions(version, patchedVersion);
    return compared !== null && compared < 0;
  });

  return {
    manifestPath,
    packageName: alert.dependency.package.name,
    patchedVersion,
    localVersions,
    specifiers,
    state: hasVulnerableVersion ? 'still-vulnerable' : 'patched-locally',
    reason: hasVulnerableVersion
      ? '本地锁文件里仍有低于 patched version 的解析结果。'
      : '本地锁文件中的解析版本已达到或超过 patched version。',
  };
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function shouldAllowAlertApiFallback() {
  return process.env.CHECK_DEPENDABOT_DRIFT_ALERTS_OPTIONAL === '1';
}

function isDependabotAlertPermissionError(error) {
  const message = String(error?.message || '');
  return message.includes('dependabot/alerts') && message.includes('Resource not accessible by integration');
}

function buildMarkdownSummary({
  repository,
  defaultBranch,
  manifestNodes,
  openAlerts,
  results,
  actionableAlerts,
  alertsUnavailable = false,
}) {
  const lines = [
    '## GitHub 安全告警漂移检查',
    '',
    `- 仓库：\`${repository.owner}/${repository.repo}\``,
    `- 默认分支：\`${defaultBranch || 'unknown'}\``,
    `- dependency graph manifests：\`${manifestNodes.length}\``,
  ];

  if (manifestNodes.length > 0) {
    lines.push(
      `- manifest 列表：${manifestNodes
        .map((node) => `\`${node.filename}\`（dependencies=${node.dependenciesCount}，parseable=${node.parseable}）`)
        .join('；')}`,
    );
  }

  lines.push('');
  lines.push('### Dependabot open alerts');

  if (alertsUnavailable) {
    lines.push('');
    lines.push('- 当前 token 无法读取 Dependabot alerts（`Resource not accessible by integration`）。');
    lines.push('- 请为 workflow 配置 `DEPENDABOT_ALERTS_TOKEN`，或在本地使用具备告警读取权限的 `gh` 凭证重新运行。');
  } else if (openAlerts.length === 0) {
    lines.push('');
    lines.push('- 当前没有 open alert。');
  } else {
    lines.push('');
    lines.push('| Alert | Package | Manifest | Patched | Local | Verdict |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    results.forEach((result, index) => {
      const alert = openAlerts[index];
      lines.push(
        `| #${alert.number} | \`${result.packageName}\` | \`${result.manifestPath}\` | \`${result.patchedVersion || 'unknown'}\` | \`${result.localVersions.join(', ') || 'none'}\` | \`${result.state}\` |`,
      );
    });
  }

  lines.push('');
  lines.push('### 结论');
  lines.push('');

  if (alertsUnavailable) {
    lines.push('- 当前 workflow token 只能继续复验 `dependencyGraphManifests` 等仓库事实，无法直接比较 Dependabot open alerts。');
    lines.push('- 若要在 workflow 中保留完整 drift 对比，请为仓库 secret 配置 `DEPENDABOT_ALERTS_TOKEN`。');
    if (manifestNodes.length === 0) {
      lines.push('- 同时当前 GraphQL 依赖图依旧没有返回 manifest，仍需继续检查 `Security & analysis` 中的 `Dependency graph` 与 `Automatic dependency submission`。');
    }
    return lines.join('\n');
  }

  if (openAlerts.length === 0) {
    lines.push('- 当前没有 open alert。');
    return lines.join('\n');
  }

  if (actionableAlerts.length === 0) {
    lines.push('- 所有 open alerts 都已经被当前锁文件修复，本地事实与 GitHub 告警状态发生漂移。');
    if (manifestNodes.length === 0) {
      lines.push(
        '- GraphQL 依赖图当前没有返回 manifest；优先检查仓库 `Settings -> Security & analysis` 中的 `Dependency graph` 与 `Automatic dependency submission`。',
      );
    }
    lines.push('- 建议保留证据，不要直接 dismiss alert；先修复依赖图刷新链路，再等待 GitHub 自动关闭。');
    return lines.join('\n');
  }

  lines.push('- 仍存在至少一个未被当前锁文件修复或无法解析的告警，需要继续修依赖或补排查。');
  return lines.join('\n');
}

function writeMarkdownSummary(params) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  fs.writeFileSync(summaryPath, `${buildMarkdownSummary(params)}\n`, 'utf8');
}

function main() {
  const remoteUrl = run('git', ['config', '--get', 'remote.origin.url']);
  const repository = parseRemoteRepository(remoteUrl);
  const repositoryData = JSON.parse(
    run('gh', [
      'api',
      'graphql',
      '-F',
      `owner=${repository.owner}`,
      '-F',
      `name=${repository.repo}`,
      '-f',
      'query=query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { defaultBranchRef { name } dependencyGraphManifests(first: 100) { nodes { filename dependenciesCount parseable exceedsMaxSize } } } }',
    ]),
  );
  let alerts = [];
  let alertsUnavailable = false;

  try {
    alerts = JSON.parse(
      run('gh', ['api', `repos/${repository.owner}/${repository.repo}/dependabot/alerts`, '--paginate']),
    );
  } catch (error) {
    if (shouldAllowAlertApiFallback() && isDependabotAlertPermissionError(error)) {
      alertsUnavailable = true;
    } else {
      throw error;
    }
  }

  const openAlerts = alertsUnavailable ? [] : alerts.filter((alert) => alert.state === 'open');
  const manifestNodes = repositoryData.data.repository.dependencyGraphManifests.nodes;
  const results = alertsUnavailable ? [] : openAlerts.map(evaluateAlert);
  const actionableAlerts = results.filter((result) => result.state !== 'patched-locally');

  printSection('仓库事实');
  console.log(`repo: ${repository.owner}/${repository.repo}`);
  console.log(`default branch: ${repositoryData.data.repository.defaultBranchRef?.name || 'unknown'}`);
  console.log(`GitHub dependency graph manifests: ${manifestNodes.length}`);
  manifestNodes.forEach((node) => {
    console.log(`- ${node.filename} | dependencies=${node.dependenciesCount} | parseable=${node.parseable}`);
  });

  printSection('Dependabot open alerts');
  if (alertsUnavailable) {
    console.log('当前 token 无法读取 Dependabot alerts（HTTP 403: Resource not accessible by integration）。');
    console.log('请为 workflow 配置 DEPENDABOT_ALERTS_TOKEN，或在本地使用具备告警读取权限的 gh 凭证重新运行。');
    writeMarkdownSummary({
      repository,
      defaultBranch: repositoryData.data.repository.defaultBranchRef?.name,
      manifestNodes,
      openAlerts,
      results,
      actionableAlerts,
      alertsUnavailable,
    });
    printSection('结论');
    console.log('当前 workflow token 只能继续复验 dependencyGraphManifests 等仓库事实，无法直接比较 Dependabot open alerts。');
    if (manifestNodes.length === 0) {
      console.log('GitHub GraphQL 依赖图当前没有返回任何 manifest，仍需继续检查仓库 Settings -> Security & analysis 中的 Dependency graph 与 Automatic dependency submission。');
    }
    console.log('若要在 workflow 中保留完整 drift 对比，请为仓库 secret 配置 DEPENDABOT_ALERTS_TOKEN。');
    process.exit(3);
  }

  if (openAlerts.length === 0) {
    console.log('当前没有 open alert。');
    writeMarkdownSummary({
      repository,
      defaultBranch: repositoryData.data.repository.defaultBranchRef?.name,
      manifestNodes,
      openAlerts,
      results,
      actionableAlerts,
      alertsUnavailable,
    });
    process.exit(0);
  }

  results.forEach((result, index) => {
    const alert = openAlerts[index];
    console.log(`- #${alert.number} ${result.packageName} @ ${result.manifestPath}`);
    console.log(`  patched >= ${result.patchedVersion}`);
    console.log(`  local versions: ${result.localVersions.join(', ') || 'none'}`);
    console.log(`  package.json specifiers: ${result.specifiers.join(', ') || 'none'}`);
    console.log(`  verdict: ${result.state}`);
    console.log(`  note: ${result.reason}`);
  });

  printSection('结论');
  if (actionableAlerts.length === 0) {
    console.log('所有 open alerts 都已经被当前锁文件修复，本地事实与 GitHub 告警状态发生漂移。');
    if (manifestNodes.length === 0) {
      console.log('GitHub GraphQL 依赖图当前没有返回任何 manifest，优先检查仓库 Settings -> Security & analysis 中的 Dependency graph 与 Automatic dependency submission。');
    }
    console.log('建议保留证据，不要直接 dismiss 告警；先修复依赖图刷新链路，再等待 GitHub 自动关闭。');
    writeMarkdownSummary({
      repository,
      defaultBranch: repositoryData.data.repository.defaultBranchRef?.name,
      manifestNodes,
      openAlerts,
      results,
      actionableAlerts,
      alertsUnavailable,
    });
    process.exit(2);
  }

  console.log('仍存在至少一个未被当前锁文件修复或无法解析的告警，需要继续修依赖或补排查。');
  writeMarkdownSummary({
    repository,
    defaultBranch: repositoryData.data.repository.defaultBranchRef?.name,
    manifestNodes,
    openAlerts,
    results,
    actionableAlerts,
    alertsUnavailable,
  });
  process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(`执行失败: ${error.message}`);
  process.exit(1);
}
