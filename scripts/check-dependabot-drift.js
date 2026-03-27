const fs = require('fs');
const os = require('os');
const path = require('path');
const { URLSearchParams } = require('url');
const { execFileSync } = require('child_process');
const {
  buildRepositorySecurityAndAnalysisMarkdownLines,
  buildRecommendedActionsOutputs,
  buildDriftRecommendedActions,
  buildRecommendedActionsMarkdownLines,
  normalizeRepositorySecurityAndAnalysis,
  normalizeRecommendedActions,
  writeGitHubOutputs,
} = require('./dependency-governance-actions');

const repoRoot = path.resolve(__dirname, '..');
const trackedManifestFiles = new Set(['package.json', 'pnpm-lock.yaml', 'pyproject.toml', 'uv.lock']);
const dependencySubmissionWorkflowPath = '.github/workflows/dependency-graph-submission.yml';
const dependencyGraphSupportByEcosystem = {
  pnpm: 'native',
  uv: 'dependency_submission',
};

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sleepSync(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return;
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function resolveDependencySubmissionEvidenceWaitSeconds(env = process.env) {
  const fallback = env.GITHUB_ACTIONS === 'true' ? 30 : 0;
  const rawValue = env.CHECK_DEPENDABOT_DRIFT_SUBMISSION_WAIT_SECONDS;

  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function waitForWorkflowRunCompletion(
  workflowRun,
  {
    timeoutSeconds = 0,
    pollIntervalMs = 3000,
    fetchWorkflowRun = null,
    sleep = sleepSync,
  } = {},
) {
  const result = {
    workflowRun,
    waitApplied: false,
    timedOut: false,
    pollCount: 0,
    waitError: null,
    timeoutSeconds,
  };

  if (
    !workflowRun ||
    workflowRun.status === 'completed' ||
    timeoutSeconds <= 0 ||
    typeof fetchWorkflowRun !== 'function'
  ) {
    return result;
  }

  result.waitApplied = true;

  const maxAttempts = Math.max(1, Math.ceil((timeoutSeconds * 1000) / pollIntervalMs));
  let currentRun = workflowRun;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      currentRun = fetchWorkflowRun(workflowRun.id);
      result.workflowRun = currentRun;
      result.pollCount += 1;
    } catch (error) {
      result.waitError = error.message;
      return result;
    }

    if (currentRun?.status === 'completed') {
      return result;
    }

    if (attempt < maxAttempts - 1) {
      sleep(pollIntervalMs);
    }
  }

  result.timedOut = currentRun?.status !== 'completed';
  return result;
}

function resolveDependencyGraphSupport(ecosystem) {
  return dependencyGraphSupportByEcosystem[ecosystem] || 'unknown';
}

function buildGraphCoverageBuckets(manifestCoverage) {
  return {
    missingNativeGraphRoots: manifestCoverage.filter(
      (item) => item.dependencyGraphSupported && item.graphVisible === false,
    ),
    dependencySubmissionRoots: manifestCoverage.filter(
      (item) => item.dependencyGraphSupport === 'dependency_submission',
    ),
  };
}

function isGitHubApiRateLimitError(message) {
  return typeof message === 'string' && /rate limit exceeded|secondary rate limit|rate limit/i.test(message);
}

function resolveCurrentDriftContext(options = {}, env = process.env) {
  return {
    currentRefName:
      normalizeOptionalString(options.currentRefName) ||
      normalizeOptionalString(env.GITHUB_HEAD_REF) ||
      normalizeOptionalString(env.GITHUB_REF_NAME),
    currentHeadSha:
      normalizeOptionalString(options.currentHeadSha) ||
      normalizeOptionalString(env.GITHUB_SHA),
  };
}

function annotateDependencySubmissionEvidenceCurrentContext(evidence, currentContext = {}) {
  if (!evidence || typeof evidence !== 'object' || evidence.runAvailable !== true) {
    return evidence;
  }

  const headBranch = normalizeOptionalString(evidence.headBranch);
  const headSha = normalizeOptionalString(evidence.headSha);
  const currentRefName = normalizeOptionalString(currentContext.currentRefName);
  const currentHeadSha = normalizeOptionalString(currentContext.currentHeadSha);
  const currentRefMatches = currentRefName && headBranch ? currentRefName === headBranch : null;
  const currentHeadShaMatches = currentHeadSha && headSha ? currentHeadSha === headSha : null;

  return {
    ...evidence,
    headBranch,
    headSha,
    currentRefName,
    currentHeadSha,
    currentRefMatches,
    currentHeadShaMatches,
    staleForCurrentHead: currentHeadShaMatches === false,
  };
}

function hasDependencyGraphRepositoryBlocker(dependencySubmissionEvidence) {
  const blockerKind = dependencySubmissionEvidence?.report?.repositoryBlockerEvidence?.kind;
  if (blockerKind === 'dependency_graph_disabled') {
    return true;
  }

  const repositoryBlocker = dependencySubmissionEvidence?.report?.repositoryBlocker;
  return (
    typeof repositoryBlocker === 'string' && repositoryBlocker.includes('Dependency graph')
  );
}

function buildAlertsUnavailableConclusion(dependencySubmissionEvidence) {
  if (hasDependencyGraphRepositoryBlocker(dependencySubmissionEvidence)) {
    return {
      exitCode: 3,
      kind: 'repository_blocked_and_alerts_unavailable',
      summary:
        'GitHub `Dependency graph` 仍未开启，workflow token 同时无法读取 Dependabot alerts；请先解除仓库设置阻塞，再恢复告警对照。',
    };
  }

  return {
    exitCode: 3,
    kind: 'alerts_unavailable',
    summary:
      '当前 workflow token 无法读取 Dependabot alerts；请补充 DEPENDABOT_ALERTS_TOKEN 或使用具备权限的 gh 凭证。',
  };
}

function run(command, args, baseRepoRoot = repoRoot) {
  return execFileSync(command, args, {
    cwd: baseRepoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(baseRepoRoot, relativePath) {
  return Boolean(relativePath) && fs.existsSync(path.join(baseRepoRoot, relativePath));
}

function joinTrackedPath(rootDir, fileName) {
  return rootDir ? `${rootDir}/${fileName}` : fileName;
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

function normalizeVulnerableVersionRange(versionRange) {
  const normalizedRange = String(versionRange || '').trim().replace(/\s+/g, ' ');
  return normalizedRange || null;
}

function parseVersionComparator(rawComparator) {
  const match = String(rawComparator || '').trim().match(/^(<=|>=|<|>|=)?\s*v?(\d+\.\d+\.\d+)$/i);
  if (!match) {
    return null;
  }

  return {
    operator: match[1] || '=',
    version: normalizeVersion(match[2]),
  };
}

function matchesVersionComparator(version, comparator) {
  if (!comparator?.version) {
    return null;
  }

  const compared = compareVersions(version, comparator.version);
  if (compared === null) {
    return null;
  }

  switch (comparator.operator) {
    case '<':
      return compared < 0;
    case '<=':
      return compared <= 0;
    case '>':
      return compared > 0;
    case '>=':
      return compared >= 0;
    case '=':
      return compared === 0;
    default:
      return null;
  }
}

function matchesVulnerableVersionRange(version, vulnerableVersionRange) {
  const normalizedRange = normalizeVulnerableVersionRange(vulnerableVersionRange);
  if (!normalizedRange) {
    return null;
  }

  const branches = normalizedRange
    .split(/\s*\|\|\s*/)
    .map((branch) => branch.trim())
    .filter(Boolean);

  let parsedComparator = false;

  for (const branch of branches) {
    const comparators = branch
      .split(',')
      .map((comparator) => comparator.trim())
      .filter(Boolean);

    if (comparators.length === 0) {
      continue;
    }

    let branchMatched = true;

    for (const rawComparator of comparators) {
      const comparator = parseVersionComparator(rawComparator);
      if (!comparator) {
        branchMatched = false;
        break;
      }

      parsedComparator = true;

      if (!matchesVersionComparator(version, comparator)) {
        branchMatched = false;
        break;
      }
    }

    if (branchMatched) {
      return true;
    }
  }

  return parsedComparator ? false : null;
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizePythonPackageName(packageName) {
  return String(packageName || '')
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, '-');
}

function normalizeManifestPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function normalizeDependencyGraphVisibilityEvidence(dependencyGraphVisibility) {
  if (!dependencyGraphVisibility) {
    return null;
  }

  return {
    checkedAt: dependencyGraphVisibility.checkedAt || null,
    defaultBranch: dependencyGraphVisibility.defaultBranch || null,
    manifestCount:
      typeof dependencyGraphVisibility.manifestCount === 'number'
        ? dependencyGraphVisibility.manifestCount
        : null,
    checkError: dependencyGraphVisibility.checkError || null,
    visibleRoots: Array.isArray(dependencyGraphVisibility.visibleRoots)
      ? dependencyGraphVisibility.visibleRoots.filter(Boolean)
      : [],
    missingRoots: Array.isArray(dependencyGraphVisibility.missingRoots)
      ? dependencyGraphVisibility.missingRoots.filter(Boolean)
      : [],
  };
}

function normalizeRepositoryBlockerEvidence(repositoryBlockerEvidence) {
  if (!repositoryBlockerEvidence) {
    return null;
  }

  return {
    kind: repositoryBlockerEvidence.kind || null,
    status: Number.isInteger(repositoryBlockerEvidence.status) ? repositoryBlockerEvidence.status : null,
    message: repositoryBlockerEvidence.message || null,
    rootLabels: Array.isArray(repositoryBlockerEvidence.rootLabels)
      ? repositoryBlockerEvidence.rootLabels.filter(Boolean)
      : [],
    consistentAcrossRoots: repositoryBlockerEvidence.consistentAcrossRoots !== false,
  };
}

function mergeRecommendedActionMetadata(actions, fallbackActions) {
  const normalizedActions = normalizeRecommendedActions(actions);
  if (normalizedActions.length === 0) {
    return normalizedActions;
  }

  const fallbackActionMap = new Map(
    normalizeRecommendedActions(fallbackActions).map((action) => [`${action.audience}:${action.code}`, action]),
  );

  return normalizedActions.map((action) => {
    const fallbackAction = fallbackActionMap.get(`${action.audience}:${action.code}`);
    if (!fallbackAction) {
      return action;
    }

    return {
      ...fallbackAction,
      ...action,
      roots: action.roots.length > 0 ? action.roots : fallbackAction.roots,
    };
  });
}

function fetchRepositorySecurityAndAnalysis(repository) {
  const responseBody = JSON.parse(run('gh', ['api', `repos/${repository.owner}/${repository.repo}`]));

  return normalizeRepositorySecurityAndAnalysis({
    checkedAt: new Date().toISOString(),
    raw:
      responseBody?.security_and_analysis && typeof responseBody.security_and_analysis === 'object'
        ? responseBody.security_and_analysis
        : {},
  });
}

function normalizeDependencySubmissionReport(report) {
  const roots = (Array.isArray(report?.roots) ? report.roots : Array.isArray(report?.blockedRoots) ? report.blockedRoots : [])
    .map((item) => ({
      rootLabel: item.rootLabel,
      status: item.status || null,
      blockedReason: item.blockedReason || null,
      blockedKind: item.blockedKind || null,
      blockedStatus: Number.isInteger(item.blockedStatus) ? item.blockedStatus : null,
      blockedMessage: item.blockedMessage || null,
      warning: item.warning || null,
      snapshotId: item.snapshotId || null,
    }))
    .filter((item) => item.rootLabel);

  const dependencyGraphVisibility = normalizeDependencyGraphVisibilityEvidence(
    report?.dependencyGraphVisibility,
  );
  const repositoryBlockerEvidence = normalizeRepositoryBlockerEvidence(
    report?.repositoryBlockerEvidence,
  );

  return {
    repositoryBlocker: report?.repositoryBlocker || null,
    repositoryBlockerEvidence,
    repositorySecurityAndAnalysis: normalizeRepositorySecurityAndAnalysis(
      report?.repositorySecurityAndAnalysis,
    ),
    recommendedActions: normalizeRecommendedActions(report?.recommendedActions),
    roots,
    blockedRoots: roots.filter((item) => item.status === 'blocked'),
    submittedRoots: roots.filter((item) => item.status === 'submitted'),
    dependencyGraphVisibility,
  };
}

function parseDependencySubmissionJsonReport(reportText) {
  return normalizeDependencySubmissionReport(JSON.parse(String(reportText || '{}')));
}

function parseDependencySubmissionReport(reportText) {
  const lines = String(reportText || '').split(/\r?\n/);
  const roots = [];
  let repositoryBlocker = null;
  let repositoryBlockerEvidence = null;
  let currentRoot = null;

  function flushCurrentRoot() {
    if (currentRoot) {
      roots.push(currentRoot);
      currentRoot = null;
    }
  }

  lines.forEach((line) => {
    const repositoryBlockerMatch = line.match(/^- repository blocker: (.+)$/);
    if (repositoryBlockerMatch) {
      repositoryBlocker = repositoryBlockerMatch[1];
      return;
    }

    const blockerEvidenceMatch = line.match(/^- blocker evidence: (.+)$/);
    if (blockerEvidenceMatch) {
      const value = blockerEvidenceMatch[1];
      repositoryBlockerEvidence = {
        kind: value.match(/kind=`([^`]+)`/)?.[1] || null,
        status: Number.parseInt(value.match(/status=`(\d+)`/)?.[1] || '', 10) || null,
        rootLabels: [...value.matchAll(/roots=([^,]+)$/g)]
          .flatMap((match) => [...match[1].matchAll(/`([^`]+)`/g)].map((rootMatch) => rootMatch[1]))
          .filter(Boolean),
        message: null,
        consistentAcrossRoots: true,
      };
      return;
    }

    const blockerMessageMatch = line.match(/^- blocker message: (.+)$/);
    if (blockerMessageMatch) {
      repositoryBlockerEvidence = {
        ...(repositoryBlockerEvidence || {
          kind: null,
          status: null,
          rootLabels: [],
          consistentAcrossRoots: true,
        }),
        message: blockerMessageMatch[1],
      };
      return;
    }

    const rootMatch = line.match(/^- root: `(.+)`$/);
    if (rootMatch) {
      flushCurrentRoot();
      currentRoot = {
        rootLabel: rootMatch[1],
        status: null,
        blockedReason: null,
        warning: null,
      };
      return;
    }

    if (!currentRoot) {
      return;
    }

    const statusMatch = line.match(/^  - status: `(.+)`$/);
    if (statusMatch) {
      currentRoot.status = statusMatch[1];
      return;
    }

    const blockedReasonMatch = line.match(/^  - blocked reason: (.+)$/);
    if (blockedReasonMatch) {
      currentRoot.blockedReason = blockedReasonMatch[1];
      return;
    }

    const warningMatch = line.match(/^  - warning: (.+)$/);
    if (warningMatch) {
      currentRoot.warning = warningMatch[1];
    }
  });

  flushCurrentRoot();

  return normalizeDependencySubmissionReport({
    repositoryBlocker,
    repositoryBlockerEvidence,
    roots,
  });
}

function fetchLatestDependencySubmissionEvidence(repository, defaultBranch, currentContext = {}) {
  if (!fileExists(repoRoot, dependencySubmissionWorkflowPath)) {
    return null;
  }

  try {
    const params = new URLSearchParams({ per_page: '3' });
    if (defaultBranch) {
      params.set('branch', defaultBranch);
    }

    const workflowRunsResponse = JSON.parse(
      run('gh', [
        'api',
        `repos/${repository.owner}/${repository.repo}/actions/workflows/dependency-graph-submission.yml/runs?${params.toString()}`,
      ]),
    );
    const latestRun = workflowRunsResponse.workflow_runs?.[0];

    if (!latestRun) {
      return {
        workflowConfigured: true,
        runAvailable: false,
      };
    }

    const waitTimeoutSeconds = resolveDependencySubmissionEvidenceWaitSeconds();
    const waitResult = waitForWorkflowRunCompletion(latestRun, {
      timeoutSeconds: waitTimeoutSeconds,
      fetchWorkflowRun: (runId) =>
        JSON.parse(
          run('gh', ['api', `repos/${repository.owner}/${repository.repo}/actions/runs/${runId}`]),
        ),
      sleep: sleepSync,
    });
    const selectedRun = waitResult.workflowRun || latestRun;

    const evidence = {
      workflowConfigured: true,
      runAvailable: true,
      runId: selectedRun.id,
      status: selectedRun.status,
      conclusion: selectedRun.conclusion,
      event: selectedRun.event,
      htmlUrl: selectedRun.html_url,
      createdAt: selectedRun.created_at,
      updatedAt: selectedRun.updated_at || null,
      headBranch: normalizeOptionalString(selectedRun.head_branch),
      headSha: normalizeOptionalString(selectedRun.head_sha),
      waitApplied: waitResult.waitApplied,
      waitTimedOut: waitResult.timedOut,
      waitTimeoutSeconds: waitResult.waitApplied ? waitTimeoutSeconds : null,
      waitPollCount: waitResult.pollCount,
    };

    if (waitResult.waitError) {
      evidence.waitError = waitResult.waitError;
    }

    const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-submission-report-'));
    try {
      run('gh', ['run', 'download', String(selectedRun.id), '-n', 'dependency-submission-report', '-D', artifactDir]);
      const reportJsonPath = path.join(artifactDir, 'dependency-submission.json');
      const reportPath = path.join(artifactDir, 'dependency-submission.txt');
      if (fs.existsSync(reportJsonPath)) {
        evidence.report = parseDependencySubmissionJsonReport(fs.readFileSync(reportJsonPath, 'utf8'));
      } else if (fs.existsSync(reportPath)) {
        evidence.report = parseDependencySubmissionReport(fs.readFileSync(reportPath, 'utf8'));
      }
    } catch (error) {
      evidence.reportDownloadError = error.message;
    } finally {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }

    return annotateDependencySubmissionEvidenceCurrentContext(evidence, currentContext);
  } catch (error) {
    return {
      workflowConfigured: true,
      fetchError: error.message,
    };
  }
}

function buildDependencySubmissionEvidenceLines(evidence) {
  if (!evidence) {
    return [];
  }

  if (evidence.fetchError) {
    const lines = [
      `- 已检测到 \`${dependencySubmissionWorkflowPath}\`，但当前无法读取最新 workflow 证据：${evidence.fetchError}`,
    ];
    if (isActionsReadPermissionError(evidence.fetchError)) {
      lines.push(
        '- 当前最常见原因是 `GitHub Security Drift` workflow token 缺少 `actions: read`；若要读取最新 submission run 与 artifact，请为该 workflow 显式授予 `actions: read`。',
      );
    }
    return lines;
  }

  if (!evidence.runAvailable) {
    return [`- 已检测到 \`${dependencySubmissionWorkflowPath}\`，但默认分支上还没有可引用的 workflow run。`];
  }

  const lines = [
    `- latest run: [#${evidence.runId}](${evidence.htmlUrl})（status: \`${evidence.status || 'unknown'}\`，conclusion: \`${evidence.conclusion || 'unknown'}\`，event: \`${evidence.event || 'unknown'}\`）`,
  ];

  if (evidence.headBranch || evidence.headSha) {
    const refParts = [];
    if (evidence.headBranch) {
      refParts.push(`branch: \`${evidence.headBranch}\``);
    }
    if (evidence.headSha) {
      refParts.push(`sha: \`${evidence.headSha}\``);
    }
    lines.push(`- submission ref snapshot: ${refParts.join('，')}`);
  }

  if (evidence.currentRefMatches === false) {
    lines.push(
      `- 当前 drift ref 是 \`${evidence.currentRefName || 'unknown'}\`，但最新 submission 证据来自 \`${evidence.headBranch || 'unknown'}\`；不能把这份 artifact 直接当成当前 ref 已重新提交 manifests。`,
    );
  } else if (evidence.currentHeadShaMatches === false) {
    lines.push(
      `- 当前 drift head 是 \`${evidence.currentHeadSha || 'unknown'}\`，但最新 submission 证据仍停留在更早的 sha \`${evidence.headSha || 'unknown'}\`；若要复验 blocker 是否解除，请先重跑 \`Dependency Graph Submission\`。`,
    );
  }

  if (evidence.waitApplied && evidence.waitTimedOut) {
    lines.push(
      `- 当前脚本已额外等待 \`${evidence.waitTimeoutSeconds}\` 秒尝试拿到最终状态，但该 run 仍处于 \`${evidence.status || 'unknown'}\`；artifact 已先按当前可见事实保留。`,
    );
  } else if (evidence.waitApplied && evidence.status === 'completed') {
    lines.push(
      `- 当前脚本在冻结 drift 证据前已等待这条 submission run 完成（budget=\`${evidence.waitTimeoutSeconds}\` 秒，polls=\`${evidence.waitPollCount}\`）。`,
    );
  }

  if (evidence.waitError) {
    lines.push(`- 等待 submission run 完成时读取最新状态失败，已保留当前可见状态：${evidence.waitError}`);
  }

  if (evidence.report?.repositoryBlocker) {
    lines.push(`- repository blocker: ${evidence.report.repositoryBlocker}`);
  }

  const repositoryBlockerEvidence = evidence.report?.repositoryBlockerEvidence;
  if (
    repositoryBlockerEvidence &&
    (repositoryBlockerEvidence.kind || repositoryBlockerEvidence.status !== null)
  ) {
    const evidenceParts = [];
    if (repositoryBlockerEvidence.kind) {
      evidenceParts.push(`kind: \`${repositoryBlockerEvidence.kind}\``);
    }
    if (repositoryBlockerEvidence.status !== null) {
      evidenceParts.push(`status: \`${repositoryBlockerEvidence.status}\``);
    }
    if (repositoryBlockerEvidence.rootLabels?.length > 0) {
      evidenceParts.push(
        `roots: ${repositoryBlockerEvidence.rootLabels.map((item) => `\`${item}\``).join('、')}`,
      );
    }
    lines.push(`- repository blocker API evidence: ${evidenceParts.join('，')}`);
  }
  if (repositoryBlockerEvidence?.message) {
    lines.push(`- repository blocker API message: ${repositoryBlockerEvidence.message}`);
  }

  const blockedRoots = evidence.report?.blockedRoots?.filter((item) => item.status === 'blocked') || [];
  if (blockedRoots.length > 0) {
    lines.push(
      `- blocked roots: ${blockedRoots.map((item) => `\`${item.rootLabel}\``).join('、')}`,
    );
  }

  const submittedRoots = evidence.report?.submittedRoots || [];
  if (submittedRoots.length > 0) {
    lines.push(
      `- submitted roots: ${submittedRoots
        .map((item) =>
          item.snapshotId ? `\`${item.rootLabel}\`（snapshot: \`${item.snapshotId}\`）` : `\`${item.rootLabel}\``,
        )
        .join('、')}`,
    );
  }

  const dependencyGraphVisibility = evidence.report?.dependencyGraphVisibility;
  if (dependencyGraphVisibility?.checkError) {
    lines.push(`- latest graph visibility check failed: ${dependencyGraphVisibility.checkError}`);
  } else if (dependencyGraphVisibility) {
    if (dependencyGraphVisibility.manifestCount !== null) {
      lines.push(`- manifests observed after submission: \`${dependencyGraphVisibility.manifestCount}\``);
    }
    if (dependencyGraphVisibility.visibleRoots.length > 0) {
      lines.push(
        `- visible roots now: ${dependencyGraphVisibility.visibleRoots
          .map((item) => `\`${item}\``)
          .join('、')}`,
      );
    }
    if (dependencyGraphVisibility.missingRoots.length > 0) {
      lines.push(
        `- roots not yet visible: ${dependencyGraphVisibility.missingRoots
          .map((item) => `\`${item}\``)
          .join('、')}`,
      );
    }
  }

  if (evidence.reportDownloadError) {
    lines.push(`- latest artifact unavailable: ${evidence.reportDownloadError}`);
    if (isActionsReadPermissionError(evidence.reportDownloadError)) {
      lines.push(
        '- 最新 artifact 下载失败通常意味着当前 workflow token 缺少 `actions: read`；请先确认 `GitHub Security Drift` 已显式声明该权限。',
      );
    }
  }

  return lines;
}

function collectTrackedFiles(baseRepoRoot = repoRoot) {
  const output = run('git', ['ls-files'], baseRepoRoot);
  return output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildWorkspaceManifestInventory(trackedFiles) {
  const roots = new Map();

  trackedFiles.forEach((trackedFile) => {
    const normalizedPath = normalizeManifestPath(trackedFile);
    const fileName = path.posix.basename(normalizedPath);

    if (!trackedManifestFiles.has(fileName)) {
      return;
    }

    const rootDir = path.posix.dirname(normalizedPath);
    const rootEntry = roots.get(rootDir) || new Set();
    rootEntry.add(fileName);
    roots.set(rootDir, rootEntry);
  });

  return [...roots.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([rootDir, files]) => {
      const normalizedRootDir = rootDir === '.' ? '' : rootDir;
      const entries = [];

      if (files.has('package.json') || files.has('pnpm-lock.yaml')) {
        entries.push({
          rootDir: normalizedRootDir,
          rootLabel: normalizedRootDir || '.',
          ecosystem: 'pnpm',
          dependencyGraphSupport: resolveDependencyGraphSupport('pnpm'),
          manifestPath: files.has('package.json') ? joinTrackedPath(normalizedRootDir, 'package.json') : null,
          lockfilePath: files.has('pnpm-lock.yaml')
            ? joinTrackedPath(normalizedRootDir, 'pnpm-lock.yaml')
            : null,
        });
      }

      if (files.has('pyproject.toml') || files.has('uv.lock')) {
        entries.push({
          rootDir: normalizedRootDir,
          rootLabel: normalizedRootDir || '.',
          ecosystem: 'uv',
          dependencyGraphSupport: resolveDependencyGraphSupport('uv'),
          manifestPath: files.has('pyproject.toml')
            ? joinTrackedPath(normalizedRootDir, 'pyproject.toml')
            : null,
          lockfilePath: files.has('uv.lock') ? joinTrackedPath(normalizedRootDir, 'uv.lock') : null,
        });
      }

      return entries;
    });
}

function buildWorkspaceManifestCoverage(workspaceManifestInventory, manifestNodes) {
  return workspaceManifestInventory.map((item) => {
    const matchedGraphFilenames = manifestNodes
      .map((node) => node.filename)
      .filter((filename) => {
        if (item.rootDir) {
          return filename.startsWith(`${item.rootDir}/`);
        }

        return !filename.includes('/');
      });

    const dependencyGraphSupport = item.dependencyGraphSupport || resolveDependencyGraphSupport(item.ecosystem);

    return {
      ...item,
      dependencyGraphSupport,
      dependencyGraphSupported: dependencyGraphSupport === 'native',
      graphVisible: matchedGraphFilenames.length > 0,
      matchedGraphFilenames,
    };
  });
}

function buildUnknownManifestCoverage(workspaceManifestInventory) {
  return workspaceManifestInventory.map((item) => ({
    ...item,
    dependencyGraphSupported: item.dependencyGraphSupport === 'native',
    graphVisible: null,
    matchedGraphFilenames: [],
  }));
}

function collectPackageVersions(lockfileText, packageName) {
  const versions = new Set();
  const normalizedLockfileText = lockfileText.replace(/\r\n/g, '\n');
  const exactMatcher = new RegExp(`^\\s{2}${escapeForRegex(packageName)}@([^:\\s(]+)`, 'm');
  let currentSection = null;

  for (const line of normalizedLockfileText.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    if (!line.startsWith(' ')) {
      currentSection = line === 'packages:' || line === 'snapshots:' ? line.slice(0, -1) : null;
      continue;
    }

    if (!currentSection) {
      continue;
    }

    const match = line.match(exactMatcher);
    if (!match) {
      continue;
    }

    const version = normalizeVersion(match[1]);
    if (version) {
      versions.add(version);
    }
  }

  return [...versions].sort((left, right) => compareVersions(left, right) ?? 0);
}

function collectPackageSpecifiers(packageJson, packageName) {
  const specifiers = [];

  const dependencySources = [packageJson.dependencies || {}, packageJson.devDependencies || {}];

  for (const source of dependencySources) {
    if (source[packageName]) {
      specifiers.push(source[packageName]);
    }
  }

  const overrideSource = (packageJson.pnpm && packageJson.pnpm.overrides) || {};
  for (const [overrideKey, overrideValue] of Object.entries(overrideSource)) {
    if (overrideKey === packageName) {
      specifiers.push(overrideValue);
      continue;
    }

    if (overrideKey.startsWith(`${packageName}@`)) {
      specifiers.push(`${overrideKey} -> ${overrideValue}`);
    }
  }

  return [...new Set(specifiers.map(String))].sort();
}

function collectUvPackageVersions(lockfileText, packageName) {
  const versions = new Set();
  const normalizedTarget = normalizePythonPackageName(packageName);
  const normalizedLockfileText = lockfileText.replace(/\r\n/g, '\n');
  const packageBlockPattern = /\[\[package\]\]\n([\s\S]*?)(?=\n\[\[package\]\]\n|$)/g;

  for (const [, packageBlock] of normalizedLockfileText.matchAll(packageBlockPattern)) {
    const nameMatch = packageBlock.match(/^name = "([^"]+)"$/m);
    const versionMatch = packageBlock.match(/^version = "([^"]+)"$/m);

    if (!nameMatch || !versionMatch) {
      continue;
    }

    if (normalizePythonPackageName(nameMatch[1]) !== normalizedTarget) {
      continue;
    }

    const version = normalizeVersion(versionMatch[1]);
    if (version) {
      versions.add(version);
    }
  }

  return [...versions].sort((left, right) => compareVersions(left, right) ?? 0);
}

function collectQuotedValues(input) {
  return [...input.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function collectPyprojectDependencyEntries(pyprojectText) {
  const entries = [];
  const lines = pyprojectText.replace(/\r\n/g, '\n').split('\n');
  let currentSection = null;
  let collectingArray = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    if (collectingArray) {
      const closingIndex = trimmedLine.indexOf(']');
      const segment = closingIndex >= 0 ? trimmedLine.slice(0, closingIndex) : trimmedLine;
      entries.push(...collectQuotedValues(segment));
      collectingArray = closingIndex < 0;
      continue;
    }

    const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    const isProjectDependencies = currentSection === 'project' && trimmedLine.startsWith('dependencies');
    const isOptionalDependencies =
      currentSection === 'project.optional-dependencies' && trimmedLine.includes('= [');

    if (!isProjectDependencies && !isOptionalDependencies) {
      continue;
    }

    const openingIndex = trimmedLine.indexOf('[');
    if (openingIndex < 0) {
      continue;
    }

    const arrayStart = trimmedLine.slice(openingIndex + 1);
    const closingIndex = arrayStart.indexOf(']');
    const segment = closingIndex >= 0 ? arrayStart.slice(0, closingIndex) : arrayStart;
    entries.push(...collectQuotedValues(segment));
    collectingArray = closingIndex < 0;
  }

  return entries;
}

function parsePythonDependencyName(specifier) {
  const sanitizedSpecifier = String(specifier || '').split(';')[0].trim();
  const match = sanitizedSpecifier.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?(?=\s*(?:[<>=!~]|$))/);
  return match ? match[1] : sanitizedSpecifier;
}

function collectPyprojectSpecifiers(pyprojectText, packageName) {
  const normalizedTarget = normalizePythonPackageName(packageName);

  return collectPyprojectDependencyEntries(pyprojectText).filter(
    (entry) => normalizePythonPackageName(parsePythonDependencyName(entry)) === normalizedTarget,
  );
}

function resolveAlertEvaluationSource(manifestPath, workspaceManifestInventory, baseRepoRoot = repoRoot) {
  const normalizedManifestPath = normalizeManifestPath(manifestPath);
  const manifestDirectory = path.posix.dirname(normalizedManifestPath);
  const manifestFileName = path.posix.basename(normalizedManifestPath);
  const normalizedManifestDirectory = manifestDirectory === '.' ? '' : manifestDirectory;

  const isPnpmCandidate = manifestFileName === 'package.json' || manifestFileName === 'pnpm-lock.yaml';
  const isUvCandidate = manifestFileName === 'pyproject.toml' || manifestFileName === 'uv.lock';

  const inventoryMatch = workspaceManifestInventory.find(
    (item) =>
      item.rootDir === normalizedManifestDirectory &&
      ((isPnpmCandidate && item.ecosystem === 'pnpm') || (isUvCandidate && item.ecosystem === 'uv')),
  );

  if (!inventoryMatch) {
    return {
      supported: false,
      manifestPath: normalizedManifestPath,
      reason: '当前脚本暂不支持该 manifest 对应的本地依赖生态。',
    };
  }

  if (!fileExists(baseRepoRoot, inventoryMatch.lockfilePath)) {
    return {
      supported: false,
      manifestPath: normalizedManifestPath,
      reason: `未找到可用于对比的本地锁文件：${inventoryMatch.lockfilePath || 'none'}`,
    };
  }

  return {
    supported: true,
    manifestPath: normalizedManifestPath,
    ecosystem: inventoryMatch.ecosystem,
    manifestSourcePath: inventoryMatch.manifestPath,
    lockfilePath: inventoryMatch.lockfilePath,
  };
}

function evaluateAlert(
  alert,
  {
    baseRepoRoot = repoRoot,
    workspaceManifestInventory = buildWorkspaceManifestInventory(collectTrackedFiles(baseRepoRoot)),
  } = {},
) {
  const manifestPath = alert.dependency.manifest_path;
  const packageName = alert.dependency.package.name;
  const patchedVersion = normalizeVersion(alert.security_vulnerability.first_patched_version?.identifier);
  const vulnerableVersionRange = normalizeVulnerableVersionRange(
    alert.security_vulnerability.vulnerable_version_range,
  );
  const source = resolveAlertEvaluationSource(manifestPath, workspaceManifestInventory, baseRepoRoot);

  if (!source.supported) {
    return {
      manifestPath,
      packageName,
      patchedVersion,
      vulnerableVersionRange,
      localVersions: [],
      specifiers: [],
      specifierSourcePath: null,
      state: 'unresolved',
      reason: source.reason,
    };
  }

  const lockfileText = fs.readFileSync(path.join(baseRepoRoot, source.lockfilePath), 'utf8');
  const specifiers = source.manifestSourcePath && fileExists(baseRepoRoot, source.manifestSourcePath)
    ? source.ecosystem === 'pnpm'
      ? collectPackageSpecifiers(readJson(path.join(baseRepoRoot, source.manifestSourcePath)), packageName)
      : collectPyprojectSpecifiers(
          fs.readFileSync(path.join(baseRepoRoot, source.manifestSourcePath), 'utf8'),
          packageName,
        )
    : [];
  const localVersions =
    source.ecosystem === 'pnpm'
      ? collectPackageVersions(lockfileText, packageName)
      : collectUvPackageVersions(lockfileText, packageName);

  if (!patchedVersion && !vulnerableVersionRange) {
    return {
      manifestPath,
      packageName,
      patchedVersion,
      vulnerableVersionRange,
      localVersions,
      specifiers,
      specifierSourcePath: source.manifestSourcePath,
      state: 'unresolved',
      reason: 'Dependabot alert 没有提供可比对的 patched version 或 vulnerable version range。',
    };
  }

  if (localVersions.length === 0) {
    return {
      manifestPath,
      packageName,
      patchedVersion,
      vulnerableVersionRange,
      localVersions,
      specifiers,
      specifierSourcePath: source.manifestSourcePath,
      state: 'unresolved',
      reason: `本地锁文件 ${source.lockfilePath} 中没有解析到该依赖版本。`,
    };
  }

  const rangeComparisons = vulnerableVersionRange
    ? localVersions
        .map((version) => matchesVulnerableVersionRange(version, vulnerableVersionRange))
        .filter((matched) => matched !== null)
    : [];
  const canUseVulnerableRange = rangeComparisons.length > 0;
  const hasVulnerableVersion = canUseVulnerableRange
    ? rangeComparisons.some(Boolean)
    : localVersions.some((version) => {
        const compared = compareVersions(version, patchedVersion);
        return compared !== null && compared < 0;
      });
  const reason = canUseVulnerableRange
    ? hasVulnerableVersion
      ? `本地锁文件里仍有命中 vulnerable version range (${vulnerableVersionRange}) 的解析结果。`
      : `本地锁文件中的解析版本均已脱离 vulnerable version range (${vulnerableVersionRange})。`
    : hasVulnerableVersion
      ? '本地锁文件里仍有低于 patched version 的解析结果。'
      : '本地锁文件中的解析版本已达到或超过 patched version。';

  return {
    manifestPath,
    packageName,
    patchedVersion,
    vulnerableVersionRange,
    localVersions,
    specifiers,
    specifierSourcePath: source.manifestSourcePath,
    state: hasVulnerableVersion ? 'still-vulnerable' : 'patched-locally',
    reason,
  };
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function writeStepSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
}

function shouldAllowAlertApiFallback() {
  return process.env.CHECK_DEPENDABOT_DRIFT_ALERTS_OPTIONAL === '1';
}

function resolveRepositoryDefaultBranch(repositoryData, resolveGitRef = run) {
  const graphQlDefaultBranch = repositoryData?.data?.repository?.defaultBranchRef?.name || null;
  if (graphQlDefaultBranch) {
    return graphQlDefaultBranch;
  }

  try {
    const remoteHeadRef = resolveGitRef('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    return remoteHeadRef.startsWith('origin/') ? remoteHeadRef.slice('origin/'.length) : remoteHeadRef;
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const options = {
    reportOutputPath: null,
    allowPlatformStateExitZero: false,
    currentRefName: null,
    currentHeadSha: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--report-output') {
      const outputPath = argv[index + 1];
      if (!outputPath) {
        throw new Error('--report-output 需要路径参数。');
      }
      options.reportOutputPath = outputPath;
      index += 1;
      continue;
    }

    if (argument === '--allow-platform-state-exit-zero') {
      options.allowPlatformStateExitZero = true;
      continue;
    }

    if (argument === '--current-ref-name') {
      options.currentRefName = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (argument === '--current-head-sha') {
      options.currentHeadSha = argv[index + 1] || null;
      index += 1;
      continue;
    }

    throw new Error(`未知参数: ${argument}`);
  }

  return options;
}

function resolveProcessExitCode(exitCode, options = {}) {
  if (options.allowPlatformStateExitZero === true && (exitCode === 2 || exitCode === 3)) {
    return 0;
  }

  return exitCode;
}

function isDependabotAlertPermissionError(error) {
  const message = String(error?.message || '');
  return message.includes('dependabot/alerts') && message.includes('Resource not accessible by integration');
}

function isActionsReadPermissionError(error) {
  const message = String(error?.message || error || '');
  return message.includes('Resource not accessible by integration');
}

function buildMarkdownSummary({
  repository,
  defaultBranch,
  manifestNodes,
  workspaceManifestInventory,
  manifestCoverage,
  openAlerts,
  results,
  actionableAlerts,
  alertsUnavailable = false,
  dependencySubmissionEvidence = null,
  repositorySecurityAndAnalysis = null,
}) {
  const { missingNativeGraphRoots, dependencySubmissionRoots } = buildGraphCoverageBuckets(
    manifestCoverage,
  );
  const dependencyGraphRepositoryBlocker = hasDependencyGraphRepositoryBlocker(
    dependencySubmissionEvidence,
  );
  const recommendedActions = buildDriftRecommendedActions({
    missingNativeGraphRoots,
    dependencySubmissionRoots,
    dependencySubmissionEvidence,
    alertsUnavailable,
    openAlertCount: openAlerts.length,
    actionableAlertCount: actionableAlerts.length,
    actionsReadPermissionMissing:
      isActionsReadPermissionError(dependencySubmissionEvidence?.fetchError) ||
      isActionsReadPermissionError(dependencySubmissionEvidence?.reportDownloadError),
    repository,
  });
  const lines = [
    '## GitHub 安全告警漂移检查',
    '',
    `- 仓库：\`${repository.owner}/${repository.repo}\``,
    `- 默认分支：\`${defaultBranch || 'unknown'}\``,
    `- 本地 manifest roots：\`${workspaceManifestInventory.length}\``,
    `- dependency graph manifests：\`${manifestNodes.length}\``,
  ];

  if (workspaceManifestInventory.length > 0) {
    lines.push(
      `- 本地清单：${workspaceManifestInventory
        .map(
          (item) =>
            `\`${item.rootLabel}\`（${item.ecosystem}；manifest=${item.manifestPath || 'none'}；lock=${item.lockfilePath || 'none'}；graph=${item.dependencyGraphSupport}）`,
        )
        .join('；')}`,
    );
  }

  if (manifestNodes.length > 0) {
    lines.push(
      `- GitHub 清单：${manifestNodes
        .map(
          (node) =>
            `\`${node.filename}\`（dependencies=${node.dependenciesCount}，parseable=${node.parseable}）`,
        )
        .join('；')}`,
    );
  }

  if (missingNativeGraphRoots.length > 0) {
    lines.push(
      `- graph coverage 缺口：${missingNativeGraphRoots
        .map((item) => `\`${item.rootLabel}\`（${item.ecosystem}）`)
        .join('；')}`,
    );
  }

  if (dependencySubmissionRoots.length > 0) {
    lines.push(
      `- 需 dependency submission 才能纳入 graph：${dependencySubmissionRoots
        .map((item) => `\`${item.rootLabel}\`（${item.ecosystem}）`)
        .join('；')}`,
    );
  }

  const dependencySubmissionEvidenceLines = buildDependencySubmissionEvidenceLines(
    dependencySubmissionEvidence,
  );
  if (dependencySubmissionEvidenceLines.length > 0) {
    lines.push('');
    lines.push('### Latest dependency submission evidence');
    lines.push('');
    lines.push(...dependencySubmissionEvidenceLines);
  }

  const repositorySecurityAndAnalysisLines = buildRepositorySecurityAndAnalysisMarkdownLines(
    repositorySecurityAndAnalysis,
  );
  if (repositorySecurityAndAnalysisLines.length > 0) {
    lines.push('');
    lines.push(...repositorySecurityAndAnalysisLines);
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
    lines.push('| Alert | Package | Manifest | Vulnerable Range | Patched | Local | Specifier Source | Verdict |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    results.forEach((result, index) => {
      const alert = openAlerts[index];
      lines.push(
        `| #${alert.number} | \`${result.packageName}\` | \`${result.manifestPath}\` | \`${result.vulnerableVersionRange || 'unknown'}\` | \`${result.patchedVersion || 'unknown'}\` | \`${result.localVersions.join(', ') || 'none'}\` | \`${result.specifierSourcePath || 'none'}\` | \`${result.state}\` |`,
      );
    });
  }

  lines.push('');
  lines.push('### 结论');
  lines.push('');

  if (alertsUnavailable) {
    if (dependencyGraphRepositoryBlocker) {
      lines.push('- 当前首要阻塞是 GitHub `Dependency graph` 仍未开启；workflow token 同时无法读取 Dependabot open alerts，因此完整 drift 对比暂不可用。');
    } else {
      lines.push('- 当前 workflow token 只能继续复验 `dependencyGraphManifests` 等仓库事实，无法直接比较 Dependabot open alerts。');
    }
    if (missingNativeGraphRoots.length > 0) {
      lines.push('- GitHub 依赖图仍未覆盖本地 manifest roots，优先检查 `Security & analysis` 中的 `Dependency graph` 与 `Automatic dependency submission`。');
    }
    if (dependencySubmissionRoots.length > 0) {
      lines.push('- `uv` roots 依赖显式 dependency submission workflow 进入 GitHub graph；若仍缺席，优先检查 `.github/workflows/dependency-graph-submission.yml` 是否成功提交 `uv.lock` snapshots。');
    }
    if (dependencySubmissionEvidence?.report?.repositoryBlocker) {
      lines.push(`- 最新 \`Dependency Graph Submission\` run 已明确给出 repository blocker：${dependencySubmissionEvidence.report.repositoryBlocker}`);
    } else if (dependencySubmissionEvidence?.runAvailable) {
      lines.push('- 仓库已配置显式 dependency submission workflow；若 manifests 仍缺席，优先查看最新 run summary / artifact，再判断是平台阻塞还是刷新延迟。');
    }
    if (dependencyGraphRepositoryBlocker) {
      lines.push('- 请先启用 `Dependency graph`；仓库设置阻塞解除后，再补 `DEPENDABOT_ALERTS_TOKEN` 恢复完整告警对照。');
    } else {
      lines.push('- 若要在 workflow 中保留完整 drift 对比，请为仓库 secret 配置 `DEPENDABOT_ALERTS_TOKEN`。');
    }
    const recommendedActionLines = buildRecommendedActionsMarkdownLines(recommendedActions);
    if (recommendedActionLines.length > 0) {
      lines.push('');
      lines.push(...recommendedActionLines);
    }
    return lines.join('\n');
  }

  if (openAlerts.length === 0) {
    lines.push('- 当前没有 open alert。');
    const recommendedActionLines = buildRecommendedActionsMarkdownLines(recommendedActions);
    if (recommendedActionLines.length > 0) {
      lines.push('');
      lines.push(...recommendedActionLines);
    }
    return lines.join('\n');
  }

  if (actionableAlerts.length === 0) {
    lines.push('- 所有 open alerts 都已经被当前锁文件修复，本地事实与 GitHub 告警状态发生漂移。');
    if (missingNativeGraphRoots.length > 0) {
      lines.push('- GitHub dependency graph 仍少于本地 manifest inventory；优先处理 graph coverage 缺口，再等待告警自动收口。');
    }
    if (dependencySubmissionRoots.length > 0) {
      lines.push('- `uv` roots 通过显式 dependency submission workflow 进入 graph coverage 预期；若仍缺席，优先检查 `dependency-graph-submission.yml` 是否成功提交，而不是误判成管理员开关未开启。');
    }
    if (dependencySubmissionEvidence?.report?.repositoryBlocker) {
      lines.push(`- 最新 \`Dependency Graph Submission\` run 已明确把 manifests 缺席归类为仓库设置阻塞：${dependencySubmissionEvidence.report.repositoryBlocker}`);
    } else if (dependencySubmissionEvidence?.runAvailable) {
      lines.push('- 仓库已配置显式 dependency submission workflow；若 manifests 仍缺席，优先查看最新 run summary / artifact，再判断是平台阻塞还是刷新延迟。');
    }
    lines.push('- 建议保留证据，不要直接 dismiss alert；先修复依赖图刷新链路，再等待 GitHub 自动关闭。');
    const recommendedActionLines = buildRecommendedActionsMarkdownLines(recommendedActions);
    if (recommendedActionLines.length > 0) {
      lines.push('');
      lines.push(...recommendedActionLines);
    }
    return lines.join('\n');
  }

  lines.push('- 仍存在至少一个未被当前锁文件修复或无法解析的告警，需要继续修依赖或补排查。');
  const recommendedActionLines = buildRecommendedActionsMarkdownLines(recommendedActions);
  if (recommendedActionLines.length > 0) {
    lines.push('');
    lines.push(...recommendedActionLines);
  }
  return lines.join('\n');
}

function writeMarkdownSummary(params) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }

  fs.writeFileSync(summaryPath, `${buildMarkdownSummary(params)}\n`, 'utf8');
}

function buildDependencySubmissionEvidenceReport(
  dependencySubmissionEvidence,
  { recommendedActionFallbacks = [] } = {},
) {
  if (!dependencySubmissionEvidence) {
    return null;
  }

  const fetchError = dependencySubmissionEvidence.fetchError || null;
  const reportDownloadError = dependencySubmissionEvidence.reportDownloadError || null;

  return {
    workflowConfigured: Boolean(dependencySubmissionEvidence.workflowConfigured),
    runAvailable: Boolean(dependencySubmissionEvidence.runAvailable),
    fetchError,
    fetchBlockedByActionsReadPermission:
      Boolean(fetchError) && isActionsReadPermissionError(fetchError),
    runId: dependencySubmissionEvidence.runId || null,
    status: dependencySubmissionEvidence.status || null,
    conclusion: dependencySubmissionEvidence.conclusion || null,
    event: dependencySubmissionEvidence.event || null,
    htmlUrl: dependencySubmissionEvidence.htmlUrl || null,
    createdAt: dependencySubmissionEvidence.createdAt || null,
    updatedAt: dependencySubmissionEvidence.updatedAt || null,
    headBranch: normalizeOptionalString(dependencySubmissionEvidence.headBranch),
    headSha: normalizeOptionalString(dependencySubmissionEvidence.headSha),
    currentRefName: normalizeOptionalString(dependencySubmissionEvidence.currentRefName),
    currentHeadSha: normalizeOptionalString(dependencySubmissionEvidence.currentHeadSha),
    currentRefMatches:
      typeof dependencySubmissionEvidence.currentRefMatches === 'boolean'
        ? dependencySubmissionEvidence.currentRefMatches
        : null,
    currentHeadShaMatches:
      typeof dependencySubmissionEvidence.currentHeadShaMatches === 'boolean'
        ? dependencySubmissionEvidence.currentHeadShaMatches
        : null,
    staleForCurrentHead: dependencySubmissionEvidence.staleForCurrentHead === true,
    waitApplied: Boolean(dependencySubmissionEvidence.waitApplied),
    waitTimedOut: Boolean(dependencySubmissionEvidence.waitTimedOut),
    waitTimeoutSeconds:
      Number.isInteger(dependencySubmissionEvidence.waitTimeoutSeconds)
        ? dependencySubmissionEvidence.waitTimeoutSeconds
        : null,
    waitPollCount: Number.isInteger(dependencySubmissionEvidence.waitPollCount)
      ? dependencySubmissionEvidence.waitPollCount
      : 0,
    waitError: dependencySubmissionEvidence.waitError || null,
    reportDownloadError,
    reportDownloadBlockedByActionsReadPermission:
      Boolean(reportDownloadError) && isActionsReadPermissionError(reportDownloadError),
    repositoryBlocker: dependencySubmissionEvidence.report?.repositoryBlocker || null,
    repositoryBlockerEvidence: normalizeRepositoryBlockerEvidence(
      dependencySubmissionEvidence.report?.repositoryBlockerEvidence,
    ),
    repositorySecurityAndAnalysis: normalizeRepositorySecurityAndAnalysis(
      dependencySubmissionEvidence.report?.repositorySecurityAndAnalysis,
    ),
    recommendedActions: mergeRecommendedActionMetadata(
      dependencySubmissionEvidence.report?.recommendedActions,
      recommendedActionFallbacks,
    ),
    roots: dependencySubmissionEvidence.report?.roots || [],
    blockedRoots: dependencySubmissionEvidence.report?.blockedRoots || [],
    submittedRoots: dependencySubmissionEvidence.report?.submittedRoots || [],
    dependencyGraphVisibility: normalizeDependencyGraphVisibilityEvidence(
      dependencySubmissionEvidence.report?.dependencyGraphVisibility,
    ),
  };
}

function buildDriftReport({
  repository,
  defaultBranch,
  manifestNodes,
  workspaceManifestInventory,
  manifestCoverage,
  manifestGraphCheckError = null,
  openAlerts,
  results,
  actionableAlerts,
  alertsUnavailable = false,
  dependencySubmissionEvidence = null,
  repositorySecurityAndAnalysis = null,
  conclusion,
}) {
  const { missingNativeGraphRoots, dependencySubmissionRoots } = buildGraphCoverageBuckets(
    manifestCoverage,
  );
  const recommendedActions = buildDriftRecommendedActions({
    missingNativeGraphRoots,
    dependencySubmissionRoots,
    dependencySubmissionEvidence,
    dependencyGraphVisibilityCheckError: manifestGraphCheckError,
    alertsUnavailable,
    openAlertCount: openAlerts.length,
    actionableAlertCount: actionableAlerts.length,
    actionsReadPermissionMissing:
      isActionsReadPermissionError(dependencySubmissionEvidence?.fetchError) ||
      isActionsReadPermissionError(dependencySubmissionEvidence?.reportDownloadError),
    repository,
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repository,
    defaultBranch: defaultBranch || null,
    manifestGraph: {
      localRootCount: workspaceManifestInventory.length,
      manifestCount: manifestGraphCheckError ? null : manifestNodes.length,
      checkError: manifestGraphCheckError,
      roots: workspaceManifestInventory.map((item) => ({
        rootLabel: item.rootLabel,
        ecosystem: item.ecosystem,
        manifestPath: item.manifestPath || null,
        lockfilePath: item.lockfilePath || null,
        dependencyGraphSupport: item.dependencyGraphSupport,
      })),
      manifests: manifestNodes.map((node) => ({
        filename: node.filename,
        dependenciesCount: node.dependenciesCount,
        parseable: node.parseable,
        exceedsMaxSize: Boolean(node.exceedsMaxSize),
      })),
      coverage: manifestCoverage.map((item) => ({
        rootLabel: item.rootLabel,
        ecosystem: item.ecosystem,
        dependencyGraphSupport: item.dependencyGraphSupport,
        dependencyGraphSupported: item.dependencyGraphSupported,
        graphVisible: typeof item.graphVisible === 'boolean' ? item.graphVisible : null,
        matchedGraphFilenames: item.matchedGraphFilenames,
      })),
      missingNativeGraphRoots: missingNativeGraphRoots.map((item) => item.rootLabel),
      dependencySubmissionRoots: dependencySubmissionRoots.map((item) => item.rootLabel),
    },
    dependabotAlerts: {
      unavailable: alertsUnavailable,
      openAlertCount: alertsUnavailable ? null : openAlerts.length,
      actionableAlertCount: alertsUnavailable ? null : actionableAlerts.length,
      alerts: results.map((result, index) => ({
        number: openAlerts[index]?.number || null,
        packageName: result.packageName,
        manifestPath: result.manifestPath,
        vulnerableVersionRange: result.vulnerableVersionRange || null,
        patchedVersion: result.patchedVersion || null,
        localVersions: result.localVersions,
        specifiers: result.specifiers,
        specifierSourcePath: result.specifierSourcePath || null,
        verdict: result.state,
        note: result.reason,
      })),
    },
    repositorySecurityAndAnalysis: normalizeRepositorySecurityAndAnalysis(repositorySecurityAndAnalysis),
    dependencySubmissionEvidence: buildDependencySubmissionEvidenceReport(dependencySubmissionEvidence, {
      recommendedActionFallbacks: recommendedActions,
    }),
    recommendedActions: normalizeRecommendedActions(recommendedActions),
    conclusion,
  };
}

function writeDriftReport(reportOutputPath, params) {
  if (!reportOutputPath) {
    return;
  }

  const reportPath = path.isAbsolute(reportOutputPath)
    ? reportOutputPath
    : path.resolve(process.cwd(), reportOutputPath);
  const report = buildDriftReport(params);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function buildDriftStepOutputs(report) {
  const dependencySubmissionEvidence = report?.dependencySubmissionEvidence || null;
  const dependencyGraphVisibility = dependencySubmissionEvidence?.dependencyGraphVisibility || null;
  const manifestGraph = report?.manifestGraph || null;
  const repositoryBlockerEvidence = dependencySubmissionEvidence?.repositoryBlockerEvidence || null;
  const repositorySecurityAndAnalysis = report?.repositorySecurityAndAnalysis || null;

  return {
    ...buildRecommendedActionsOutputs(report?.recommendedActions),
    conclusion_kind: report?.conclusion?.kind || '',
    conclusion_exit_code:
      Number.isInteger(report?.conclusion?.exitCode) ? String(report.conclusion.exitCode) : '',
    dependency_graph_setting_status: repositorySecurityAndAnalysis?.dependencyGraphStatus || '',
    automatic_dependency_submission_setting_status:
      repositorySecurityAndAnalysis?.automaticDependencySubmissionStatus || '',
    dependabot_security_updates_status:
      repositorySecurityAndAnalysis?.dependabotSecurityUpdatesStatus || '',
    repository_security_and_analysis_missing_fields_json: JSON.stringify(
      repositorySecurityAndAnalysis?.missingFields || [],
    ),
    repository_security_and_analysis_manual_verification_required:
      repositorySecurityAndAnalysis?.manualVerificationRequired ? 'true' : 'false',
    repository_security_and_analysis_manual_verification_reason:
      repositorySecurityAndAnalysis?.manualVerificationReason || '',
    repository_security_and_analysis_check_error:
      repositorySecurityAndAnalysis?.checkError || '',
    alerts_unavailable: report?.dependabotAlerts?.unavailable ? 'true' : 'false',
    open_alert_count:
      typeof report?.dependabotAlerts?.openAlertCount === 'number'
        ? String(report.dependabotAlerts.openAlertCount)
        : '',
    actionable_alert_count:
      typeof report?.dependabotAlerts?.actionableAlertCount === 'number'
        ? String(report.dependabotAlerts.actionableAlertCount)
        : '',
    dependency_submission_run_available: dependencySubmissionEvidence?.runAvailable ? 'true' : 'false',
    dependency_submission_fetch_blocked_by_actions_read_permission:
      dependencySubmissionEvidence?.fetchBlockedByActionsReadPermission ? 'true' : 'false',
    dependency_submission_report_download_blocked_by_actions_read_permission:
      dependencySubmissionEvidence?.reportDownloadBlockedByActionsReadPermission ? 'true' : 'false',
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
    dependency_graph_check_error:
      dependencyGraphVisibility?.checkError || manifestGraph?.checkError || '',
  };
}

function writeDriftStepOutputs(report) {
  writeGitHubOutputs(buildDriftStepOutputs(report));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentDriftContext = resolveCurrentDriftContext(options);
  const trackedFiles = collectTrackedFiles(repoRoot);
  const workspaceManifestInventory = buildWorkspaceManifestInventory(trackedFiles);
  const remoteUrl = run('git', ['config', '--get', 'remote.origin.url']);
  const repository = parseRemoteRepository(remoteUrl);
  let repositoryData = null;
  let manifestGraphCheckError = null;
  let manifestNodes = [];
  let manifestCoverage = buildUnknownManifestCoverage(workspaceManifestInventory);

  try {
    repositoryData = JSON.parse(
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
    manifestNodes = repositoryData.data.repository.dependencyGraphManifests.nodes;
    manifestCoverage = buildWorkspaceManifestCoverage(workspaceManifestInventory, manifestNodes);
  } catch (error) {
    manifestGraphCheckError = error.message;
  }

  const defaultBranch = resolveRepositoryDefaultBranch(repositoryData);
  let repositorySecurityAndAnalysis = null;

  try {
    repositorySecurityAndAnalysis = fetchRepositorySecurityAndAnalysis(repository);
  } catch (error) {
    repositorySecurityAndAnalysis = normalizeRepositorySecurityAndAnalysis({
      checkedAt: new Date().toISOString(),
      checkError: error.message,
      raw: {},
    });
  }

  if (manifestGraphCheckError) {
    const dependencySubmissionEvidence = fetchLatestDependencySubmissionEvidence(
      repository,
      defaultBranch,
      currentDriftContext,
    );
    printSection('仓库事实');
    console.log(`repo: ${repository.owner}/${repository.repo}`);
    console.log(`default branch: ${defaultBranch || 'unknown'}`);
    console.log(`Local manifest roots: ${workspaceManifestInventory.length}`);
    workspaceManifestInventory.forEach((item) => {
      console.log(
        `- ${item.rootLabel} | ecosystem=${item.ecosystem} | manifest=${item.manifestPath || 'none'} | lock=${item.lockfilePath || 'none'} | graphSupport=${item.dependencyGraphSupport} | graphVisible=unknown`,
      );
    });

    printSection('Dependency graph visibility');
    console.log(`无法读取 dependencyGraphManifests：${manifestGraphCheckError}`);

    const repositorySecurityAndAnalysisLines = buildRepositorySecurityAndAnalysisMarkdownLines(
      repositorySecurityAndAnalysis,
      { heading: null },
    );
    const dependencySubmissionEvidenceLines = buildDependencySubmissionEvidenceLines(
      dependencySubmissionEvidence,
    );
    if (repositorySecurityAndAnalysisLines.length > 0) {
      printSection('Repository security & analysis');
      repositorySecurityAndAnalysisLines.forEach((line) => console.log(line));
    }
    if (dependencySubmissionEvidenceLines.length > 0) {
      printSection('Dependency submission evidence');
      dependencySubmissionEvidenceLines.forEach((line) => console.log(line));
    }

    const conclusion = {
      exitCode: 3,
      kind: 'graph_visibility_check_failed',
      summary: isGitHubApiRateLimitError(manifestGraphCheckError)
        ? '当前无法读取 GitHub `dependencyGraphManifests`，因为 API rate limit 已耗尽；请使用具备更高配额的 gh 凭证或等待配额恢复后重跑。'
        : '当前无法读取 GitHub `dependencyGraphManifests`；请先恢复 GraphQL 可见性，再继续判断 Dependency graph / Dependabot drift。',
    };
    const reportParams = {
      repository,
      defaultBranch,
      manifestNodes,
      workspaceManifestInventory,
      manifestCoverage,
      manifestGraphCheckError,
      openAlerts: [],
      results: [],
      actionableAlerts: [],
      alertsUnavailable: false,
      dependencySubmissionEvidence,
      repositorySecurityAndAnalysis,
      conclusion,
    };
    const report = buildDriftReport(reportParams);
    const summaryLines = [
      '## GitHub 安全告警漂移检查',
      '',
      `- 仓库：\`${repository.owner}/${repository.repo}\``,
      `- 默认分支：\`${defaultBranch || 'unknown'}\``,
      `- 本地 manifest roots：\`${workspaceManifestInventory.length}\``,
      '- dependency graph manifests：`unknown`',
      `- graph visibility check failed: ${manifestGraphCheckError}`,
    ];
    if (dependencySubmissionEvidenceLines.length > 0) {
      summaryLines.push('', '### Latest dependency submission evidence', '');
      summaryLines.push(...dependencySubmissionEvidenceLines);
    }
    if (repositorySecurityAndAnalysisLines.length > 0) {
      summaryLines.push('', ...repositorySecurityAndAnalysisLines);
    }
    summaryLines.push('', '### 结论', '', `- ${conclusion.summary}`);
    const recommendedActionLines = buildRecommendedActionsMarkdownLines(report.recommendedActions);
    if (recommendedActionLines.length > 0) {
      summaryLines.push('', ...recommendedActionLines);
    }
    writeStepSummary(summaryLines);
    printSection('结论');
    console.log(conclusion.summary);
    writeDriftReport(options.reportOutputPath, reportParams);
    writeDriftStepOutputs(report);
    process.exit(resolveProcessExitCode(3, options));
  }

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
  const results = alertsUnavailable
    ? []
    : openAlerts.map((alert) =>
        evaluateAlert(alert, {
          baseRepoRoot: repoRoot,
          workspaceManifestInventory,
        }),
      );
  const actionableAlerts = results.filter((result) => result.state !== 'patched-locally');
  const { missingNativeGraphRoots, dependencySubmissionRoots } = buildGraphCoverageBuckets(
    manifestCoverage,
  );

  const shouldFetchDependencySubmissionEvidence =
    missingNativeGraphRoots.length > 0 ||
    dependencySubmissionRoots.some((item) => !item.graphVisible);
  const dependencySubmissionEvidence = shouldFetchDependencySubmissionEvidence
    ? fetchLatestDependencySubmissionEvidence(
        repository,
        defaultBranch,
        currentDriftContext,
      )
    : null;

  printSection('仓库事实');
  console.log(`repo: ${repository.owner}/${repository.repo}`);
  console.log(`default branch: ${defaultBranch || 'unknown'}`);
  console.log(`Local manifest roots: ${workspaceManifestInventory.length}`);
  manifestCoverage.forEach((item) => {
    console.log(
      `- ${item.rootLabel} | ecosystem=${item.ecosystem} | manifest=${item.manifestPath || 'none'} | lock=${item.lockfilePath || 'none'} | graphSupport=${item.dependencyGraphSupport} | graphVisible=${item.graphVisible ? 'yes' : 'no'}`,
    );
    if (item.graphVisible) {
      console.log(`  graph nodes: ${item.matchedGraphFilenames.join(', ')}`);
    }
  });
  console.log(`GitHub dependency graph manifests: ${manifestNodes.length}`);
  manifestNodes.forEach((node) => {
    console.log(`- ${node.filename} | dependencies=${node.dependenciesCount} | parseable=${node.parseable}`);
  });

  const dependencySubmissionEvidenceLines = buildDependencySubmissionEvidenceLines(
    dependencySubmissionEvidence,
  );
  const dependencyGraphRepositoryBlocker = hasDependencyGraphRepositoryBlocker(
    dependencySubmissionEvidence,
  );
  const repositorySecurityAndAnalysisLines = buildRepositorySecurityAndAnalysisMarkdownLines(
    repositorySecurityAndAnalysis,
    { heading: null },
  );
  const sharedReportParams = {
    repository,
    defaultBranch,
    manifestNodes,
    workspaceManifestInventory,
    manifestCoverage,
    manifestGraphCheckError,
    openAlerts,
    results,
    actionableAlerts,
    alertsUnavailable,
    dependencySubmissionEvidence,
    repositorySecurityAndAnalysis,
  };
  if (dependencySubmissionEvidenceLines.length > 0) {
    printSection('Dependency submission evidence');
    dependencySubmissionEvidenceLines.forEach((line) => console.log(line));
  }

  if (repositorySecurityAndAnalysisLines.length > 0) {
    printSection('Repository security & analysis');
    repositorySecurityAndAnalysisLines.forEach((line) => console.log(line));
  }

  printSection('Dependabot open alerts');
  if (alertsUnavailable) {
    console.log('当前 token 无法读取 Dependabot alerts（HTTP 403: Resource not accessible by integration）。');
    console.log('请为 workflow 配置 DEPENDABOT_ALERTS_TOKEN，或在本地使用具备告警读取权限的 gh 凭证重新运行。');
    writeMarkdownSummary(sharedReportParams);
    printSection('结论');
    if (dependencyGraphRepositoryBlocker) {
      console.log('当前首要阻塞是 GitHub `Dependency graph` 仍未开启；workflow token 同时无法读取 Dependabot alerts，完整 drift 对比暂不可用。');
    } else {
      console.log('当前 workflow token 只能继续复验 dependencyGraphManifests 等仓库事实，无法直接比较 Dependabot open alerts。');
    }
    if (missingNativeGraphRoots.length > 0) {
      console.log(`GitHub 依赖图尚未覆盖这些原生支持的 manifest roots: ${missingNativeGraphRoots.map((item) => `${item.rootLabel} (${item.ecosystem})`).join(', ')}`);
      console.log('优先检查仓库 Settings -> Security & analysis 中的 Dependency graph 与 Automatic dependency submission。');
    }
    if (dependencySubmissionRoots.length > 0) {
      console.log(`这些 roots 当前需要额外 dependency submission 才会进入 graph coverage: ${dependencySubmissionRoots.map((item) => `${item.rootLabel} (${item.ecosystem})`).join(', ')}`);
    }
    if (dependencySubmissionEvidence?.report?.repositoryBlocker) {
      console.log(`最新 Dependency Graph Submission run 已明确给出 repository blocker: ${dependencySubmissionEvidence.report.repositoryBlocker}`);
    } else if (dependencySubmissionEvidence?.runAvailable) {
      console.log('仓库已配置显式 dependency submission workflow；若 manifests 仍缺席，优先查看最新 run summary / artifact，再判断是平台阻塞还是刷新延迟。');
    }
    if (dependencyGraphRepositoryBlocker) {
      console.log('请先启用 Dependency graph；仓库设置阻塞解除后，再为 workflow secret 配置 DEPENDABOT_ALERTS_TOKEN，以恢复完整 drift 对比。');
    } else {
      console.log('若要在 workflow 中保留完整 drift 对比，请为仓库 secret 配置 DEPENDABOT_ALERTS_TOKEN。');
    }
    const reportParams = {
      ...sharedReportParams,
      conclusion: buildAlertsUnavailableConclusion(dependencySubmissionEvidence),
    };
    writeDriftReport(options.reportOutputPath, reportParams);
    writeDriftStepOutputs(buildDriftReport(reportParams));
    process.exit(resolveProcessExitCode(3, options));
  }

  if (openAlerts.length === 0) {
    console.log('当前没有 open alert。');
    writeMarkdownSummary(sharedReportParams);
    const reportParams = {
      ...sharedReportParams,
      conclusion: {
        exitCode: 0,
        kind: 'clean',
        summary: '当前没有 open alert。',
      },
    };
    writeDriftReport(options.reportOutputPath, reportParams);
    writeDriftStepOutputs(buildDriftReport(reportParams));
    process.exit(resolveProcessExitCode(0, options));
  }

  results.forEach((result, index) => {
    const alert = openAlerts[index];
    console.log(`- #${alert.number} ${result.packageName} @ ${result.manifestPath}`);
    if (result.vulnerableVersionRange) {
      console.log(`  vulnerable range: ${result.vulnerableVersionRange}`);
    }
    console.log(`  patched >= ${result.patchedVersion || 'unknown'}`);
    console.log(`  local versions: ${result.localVersions.join(', ') || 'none'}`);
    console.log(`  declared specifiers (${result.specifierSourcePath || 'none'}): ${result.specifiers.join(', ') || 'none'}`);
    console.log(`  verdict: ${result.state}`);
    console.log(`  note: ${result.reason}`);
  });

  printSection('结论');
  if (actionableAlerts.length === 0) {
    console.log('所有 open alerts 都已经被当前锁文件修复，本地事实与 GitHub 告警状态发生漂移。');
    if (missingNativeGraphRoots.length > 0) {
      console.log(`GitHub 依赖图仍缺少这些原生支持的 manifest roots: ${missingNativeGraphRoots.map((item) => `${item.rootLabel} (${item.ecosystem})`).join(', ')}`);
      console.log('优先检查仓库 Settings -> Security & analysis 中的 Dependency graph 与 Automatic dependency submission。');
    }
    if (dependencySubmissionRoots.length > 0) {
      console.log(`这些 roots 当前需要额外 dependency submission 才会进入 graph coverage: ${dependencySubmissionRoots.map((item) => `${item.rootLabel} (${item.ecosystem})`).join(', ')}`);
    }
    if (dependencySubmissionEvidence?.report?.repositoryBlocker) {
      console.log(`最新 Dependency Graph Submission run 已明确把 manifests 缺席归类为仓库设置阻塞: ${dependencySubmissionEvidence.report.repositoryBlocker}`);
    } else if (dependencySubmissionEvidence?.runAvailable) {
      console.log('仓库已配置显式 dependency submission workflow；若 manifests 仍缺席，优先查看最新 run summary / artifact，再判断是平台阻塞还是刷新延迟。');
    }
    console.log('建议保留证据，不要直接 dismiss 告警；先修复依赖图刷新链路，再等待 GitHub 自动关闭。');
    writeMarkdownSummary(sharedReportParams);
    const reportParams = {
      ...sharedReportParams,
      conclusion: {
        exitCode: 2,
        kind: 'platform_drift',
        summary: '所有 open alerts 都已被当前锁文件修复，但 GitHub 依赖图 / 告警状态仍未收口。',
      },
    };
    writeDriftReport(options.reportOutputPath, reportParams);
    writeDriftStepOutputs(buildDriftReport(reportParams));
    process.exit(resolveProcessExitCode(2, options));
  }

  console.log('仍存在至少一个未被当前锁文件修复或无法解析的告警，需要继续修依赖或补排查。');
  writeMarkdownSummary(sharedReportParams);
  const reportParams = {
    ...sharedReportParams,
    conclusion: {
      exitCode: 1,
      kind: 'actionable_alerts',
      summary: '仍存在至少一个未被当前锁文件修复或无法解析的告警，需要继续修依赖或补排查。',
    },
  };
  writeDriftReport(options.reportOutputPath, reportParams);
  writeDriftStepOutputs(buildDriftReport(reportParams));
  process.exit(resolveProcessExitCode(1, options));
}

module.exports = {
  buildAlertsUnavailableConclusion,
  buildDriftReport,
  buildMarkdownSummary,
  buildDependencySubmissionEvidenceLines,
  buildWorkspaceManifestCoverage,
  buildWorkspaceManifestInventory,
  collectPackageSpecifiers,
  collectPackageVersions,
  collectPyprojectDependencyEntries,
  collectPyprojectSpecifiers,
  collectTrackedFiles,
  collectUvPackageVersions,
  compareVersions,
  evaluateAlert,
  fetchRepositorySecurityAndAnalysis,
  fetchLatestDependencySubmissionEvidence,
  hasDependencyGraphRepositoryBlocker,
  normalizePythonPackageName,
  normalizeVersion,
  parseArgs,
  parseDependencySubmissionJsonReport,
  parseDependencySubmissionReport,
  parsePythonDependencyName,
  resolveProcessExitCode,
  resolveRepositoryDefaultBranch,
  resolveAlertEvaluationSource,
  resolveDependencySubmissionEvidenceWaitSeconds,
  buildDriftStepOutputs,
  buildUnknownManifestCoverage,
  isActionsReadPermissionError,
  waitForWorkflowRunCompletion,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`执行失败: ${error.message}`);
    process.exit(1);
  }
}
