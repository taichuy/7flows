const fs = require('fs');
const crypto = require('crypto');
const {
  buildRecommendedActionsMarkdownLines,
  buildRepositorySecurityAndAnalysisMarkdownLines,
  writeGitHubOutputs,
} = require('./dependency-governance-actions');

const DEFAULT_ISSUE_TITLE = 'GitHub Security Drift: external blocker';
const DEFAULT_ISSUE_MARKER = '<!-- 7flows:github-security-drift-tracking -->';
const DEFAULT_ISSUE_STATE_MARKER = '7flows:github-security-drift-state';
const DEFAULT_ISSUE_HISTORY_START_MARKER = '<!-- 7flows:github-security-drift-history-start -->';
const DEFAULT_ISSUE_HISTORY_END_MARKER = '<!-- 7flows:github-security-drift-history-end -->';
const MAX_HISTORY_ENTRIES = 6;
const EXTERNAL_BLOCKER_ACTION_CODES = new Set([
  'enable_dependency_graph',
  'configure_dependabot_alerts_token',
  'rerun_with_authenticated_github_api',
  'investigate_dependency_graph_visibility',
  'rerun_dependency_graph_submission',
  'rerun_github_security_drift',
]);
const EXTERNAL_BLOCKER_CONCLUSION_KINDS = new Set([
  'platform_drift',
  'alerts_unavailable',
  'graph_visibility_check_failed',
  'repository_blocked_and_alerts_unavailable',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    reportPath: null,
    issueTitle: DEFAULT_ISSUE_TITLE,
    issueMarker: DEFAULT_ISSUE_MARKER,
    closeResolved: true,
    dryRun: false,
    currentRefName: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--report') {
      options.reportPath = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (argument === '--issue-title') {
      options.issueTitle = argv[index + 1] || DEFAULT_ISSUE_TITLE;
      index += 1;
      continue;
    }

    if (argument === '--issue-marker') {
      options.issueMarker = argv[index + 1] || DEFAULT_ISSUE_MARKER;
      index += 1;
      continue;
    }

    if (argument === '--keep-resolved-open') {
      options.closeResolved = false;
      continue;
    }

    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (argument === '--current-ref-name') {
      options.currentRefName = argv[index + 1] || null;
      index += 1;
      continue;
    }

    throw new Error(`未知参数: ${argument}`);
  }

  if (!options.reportPath) {
    throw new Error('必须通过 --report 提供 dependabot-drift.json 路径。');
  }

  return options;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeRepositoryCoordinates(repository) {
  if (!repository || typeof repository !== 'object') {
    return null;
  }

  const owner = typeof repository.owner === 'string' ? repository.owner.trim() : '';
  const repo = typeof repository.repo === 'string' ? repository.repo.trim() : '';
  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function normalizeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean))];
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatCode(value) {
  return `\`${String(value)}\``;
}

function formatRootList(values) {
  const normalizedValues = normalizeList(values);
  if (normalizedValues.length === 0) {
    return '无';
  }

  return normalizedValues.map((value) => formatCode(value)).join('、');
}

function formatOptionalCode(value, fallback = '未知') {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  return formatCode(value.trim());
}

function formatOptionalNumber(value, fallback = '未知') {
  return Number.isInteger(value) ? formatCode(value) : fallback;
}

function buildCurrentRunUrl(repository) {
  const normalizedRepository = normalizeRepositoryCoordinates(repository);
  const runId = typeof process.env.GITHUB_RUN_ID === 'string' ? process.env.GITHUB_RUN_ID.trim() : '';
  const serverUrl = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');

  if (!normalizedRepository || !runId) {
    return null;
  }

  return `${serverUrl}/${encodeURIComponent(normalizedRepository.owner)}/${encodeURIComponent(
    normalizedRepository.repo,
  )}/actions/runs/${encodeURIComponent(runId)}`;
}

function buildIssueUrl(repository, issueNumber) {
  const normalizedRepository = normalizeRepositoryCoordinates(repository);
  if (!normalizedRepository || !Number.isInteger(issueNumber)) {
    return null;
  }

  const serverUrl = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');
  return `${serverUrl}/${encodeURIComponent(normalizedRepository.owner)}/${encodeURIComponent(
    normalizedRepository.repo,
  )}/issues/${issueNumber}`;
}

function buildIssueStateFingerprint(report, options = {}) {
  const dependencySubmissionEvidence =
    report?.dependencySubmissionEvidence && typeof report.dependencySubmissionEvidence === 'object'
      ? report.dependencySubmissionEvidence
      : null;
  const repositoryBlockerEvidence =
    dependencySubmissionEvidence?.repositoryBlockerEvidence &&
    typeof dependencySubmissionEvidence.repositoryBlockerEvidence === 'object'
      ? dependencySubmissionEvidence.repositoryBlockerEvidence
      : null;
  const dependencyGraphVisibility =
    dependencySubmissionEvidence?.dependencyGraphVisibility &&
    typeof dependencySubmissionEvidence.dependencyGraphVisibility === 'object'
      ? dependencySubmissionEvidence.dependencyGraphVisibility
      : null;
  const repositorySecurityAndAnalysis =
    report?.repositorySecurityAndAnalysis && typeof report.repositorySecurityAndAnalysis === 'object'
      ? report.repositorySecurityAndAnalysis
      : null;
  const dependabotAlerts =
    report?.dependabotAlerts && typeof report.dependabotAlerts === 'object' ? report.dependabotAlerts : null;
  const recommendedActions = Array.isArray(report?.recommendedActions) ? report.recommendedActions : [];

  const fingerprintInput = {
    resolved: options.resolved === true,
    conclusionKind: normalizeOptionalString(report?.conclusion?.kind),
    repositoryBlockerKind: normalizeOptionalString(repositoryBlockerEvidence?.kind),
    repositoryBlockerStatus: Number.isInteger(repositoryBlockerEvidence?.status)
      ? repositoryBlockerEvidence.status
      : normalizeOptionalString(repositoryBlockerEvidence?.status),
    repositoryBlockerRoots: normalizeList(repositoryBlockerEvidence?.rootLabels),
    dependencyGraphManifestCount: Number.isInteger(dependencyGraphVisibility?.manifestCount)
      ? dependencyGraphVisibility.manifestCount
      : null,
    dependencyGraphVisibleRoots: normalizeList(dependencyGraphVisibility?.visibleRoots),
    dependencyGraphMissingRoots: normalizeList(dependencyGraphVisibility?.missingRoots),
    repositorySecurityMissingFields: normalizeList(repositorySecurityAndAnalysis?.missingFields),
    repositorySecurityManualVerificationReason: normalizeOptionalString(
      repositorySecurityAndAnalysis?.manualVerificationReason,
    ),
    alertsUnavailable: dependabotAlerts?.unavailable === true,
    openAlertCount: Number.isInteger(dependabotAlerts?.openAlertCount) ? dependabotAlerts.openAlertCount : null,
    actionableAlertCount: Number.isInteger(dependabotAlerts?.actionableAlertCount)
      ? dependabotAlerts.actionableAlertCount
      : null,
    recommendedActions: recommendedActions.map((action) => ({
      priority: Number.isInteger(action?.priority) ? action.priority : null,
      audience: normalizeOptionalString(action?.audience),
      code: normalizeOptionalString(action?.code),
      manualOnly: action?.manualOnly === true,
      manualOnlyReason: normalizeOptionalString(action?.manualOnlyReason),
      roots: normalizeList(action?.roots),
    })),
  };

  return crypto.createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex');
}

function buildIssueStateMarker(metadata) {
  return `<!-- ${DEFAULT_ISSUE_STATE_MARKER} ${JSON.stringify(metadata)} -->`;
}

function buildIssueTrackingState(report, { resolved = false } = {}) {
  return {
    fingerprint: buildIssueStateFingerprint(report, { resolved }),
    resolved,
  };
}

function hasIssueTrackingStateChanged(previousState, nextState) {
  if (!nextState || typeof nextState !== 'object') {
    return false;
  }

  if (!previousState || typeof previousState !== 'object') {
    return true;
  }

  return previousState.fingerprint !== nextState.fingerprint || previousState.resolved !== nextState.resolved;
}

function parseIssueStateMetadata(body) {
  if (typeof body !== 'string' || !body.trim()) {
    return null;
  }

  const pattern = new RegExp(`<!--\\s*${DEFAULT_ISSUE_STATE_MARKER}\\s+(.+?)\\s*-->`);
  const match = body.match(pattern);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      fingerprint: normalizeOptionalString(parsed.fingerprint),
      resolved: parsed.resolved === true,
    };
  } catch {
    return null;
  }
}

function parseIssueHistoryLines(body) {
  if (typeof body !== 'string' || !body.trim()) {
    return [];
  }

  const startIndex = body.indexOf(DEFAULT_ISSUE_HISTORY_START_MARKER);
  const endIndex = body.indexOf(DEFAULT_ISSUE_HISTORY_END_MARKER);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return [];
  }

  return body
    .slice(startIndex + DEFAULT_ISSUE_HISTORY_START_MARKER.length, endIndex)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '));
}

function buildHistoryEntry(report, options = {}) {
  const generatedAt = normalizeOptionalString(report?.generatedAt) || '未知时间';
  const conclusionKind = normalizeOptionalString(report?.conclusion?.kind) || 'unknown';
  const dependencySubmissionEvidence =
    report?.dependencySubmissionEvidence && typeof report.dependencySubmissionEvidence === 'object'
      ? report.dependencySubmissionEvidence
      : null;
  const repositoryBlockerEvidence =
    dependencySubmissionEvidence?.repositoryBlockerEvidence &&
    typeof dependencySubmissionEvidence.repositoryBlockerEvidence === 'object'
      ? dependencySubmissionEvidence.repositoryBlockerEvidence
      : null;
  const dependencyGraphVisibility =
    dependencySubmissionEvidence?.dependencyGraphVisibility &&
    typeof dependencySubmissionEvidence.dependencyGraphVisibility === 'object'
      ? dependencySubmissionEvidence.dependencyGraphVisibility
      : null;
  const recommendedActions = Array.isArray(report?.recommendedActions) ? report.recommendedActions : [];
  const primaryAction = recommendedActions[0] && typeof recommendedActions[0] === 'object' ? recommendedActions[0] : null;
  const entryParts = [generatedAt, options.resolved === true ? '外部阻塞已解除' : '外部阻塞持续存在'];

  entryParts.push(`conclusion=${formatCode(conclusionKind)}`);

  if (primaryAction?.code) {
    entryParts.push(`primary_action=${formatCode(primaryAction.code)}`);
  }

  if (repositoryBlockerEvidence?.kind) {
    const blockerStatus = Number.isInteger(repositoryBlockerEvidence?.status)
      ? repositoryBlockerEvidence.status
      : normalizeOptionalString(repositoryBlockerEvidence?.status);
    entryParts.push(
      `blocker=${formatCode(repositoryBlockerEvidence.kind)}${
        blockerStatus === null || blockerStatus === undefined ? '' : `/${formatCode(blockerStatus)}`
      }`,
    );
  }

  const missingRoots = normalizeList(dependencyGraphVisibility?.missingRoots);
  if (missingRoots.length > 0) {
    entryParts.push(`missing_roots=${formatRootList(missingRoots)}`);
  }

  return `- ${entryParts.join(' · ')}`;
}

function buildIssueHistory(report, options = {}) {
  const previousHistoryLines = Array.isArray(options.previousHistoryLines) ? options.previousHistoryLines : [];
  const previousState = options.previousState && typeof options.previousState === 'object' ? options.previousState : null;
  const fingerprint = buildIssueStateFingerprint(report, options);
  const resolved = options.resolved === true;
  const historyLines = [...previousHistoryLines];

  if (!previousState || previousState.fingerprint !== fingerprint || previousState.resolved !== resolved || historyLines.length === 0) {
    historyLines.unshift(buildHistoryEntry(report, { resolved }));
  }

  return historyLines.slice(0, MAX_HISTORY_ENTRIES);
}

function hasExternalBlocker(report) {
  const conclusionKind = normalizeOptionalString(report?.conclusion?.kind);
  if (conclusionKind && EXTERNAL_BLOCKER_CONCLUSION_KINDS.has(conclusionKind)) {
    return true;
  }

  return Array.isArray(report?.recommendedActions)
    ? report.recommendedActions.some((action) => EXTERNAL_BLOCKER_ACTION_CODES.has(action?.code))
    : false;
}

function buildIssueBody(report, options = {}) {
  const issueMarker = options.issueMarker || DEFAULT_ISSUE_MARKER;
  const resolved = options.resolved === true;
  const stateMetadata =
    options.stateMetadata && typeof options.stateMetadata === 'object'
      ? options.stateMetadata
      : buildIssueTrackingState(report, { resolved });
  const historyLines = Array.isArray(options.historyLines) ? options.historyLines : [buildHistoryEntry(report, { resolved })];
  const repository = normalizeRepositoryCoordinates(report?.repository);
  const dependencySubmissionEvidence =
    report?.dependencySubmissionEvidence && typeof report.dependencySubmissionEvidence === 'object'
      ? report.dependencySubmissionEvidence
      : null;
  const repositoryBlockerEvidence =
    dependencySubmissionEvidence?.repositoryBlockerEvidence &&
    typeof dependencySubmissionEvidence.repositoryBlockerEvidence === 'object'
      ? dependencySubmissionEvidence.repositoryBlockerEvidence
      : null;
  const dependencyGraphVisibility =
    dependencySubmissionEvidence?.dependencyGraphVisibility &&
    typeof dependencySubmissionEvidence.dependencyGraphVisibility === 'object'
      ? dependencySubmissionEvidence.dependencyGraphVisibility
      : null;
  const repositorySecurityAndAnalysis =
    report?.repositorySecurityAndAnalysis && typeof report.repositorySecurityAndAnalysis === 'object'
      ? report.repositorySecurityAndAnalysis
      : null;
  const recommendedActions = Array.isArray(report?.recommendedActions) ? report.recommendedActions : [];
  const dependabotAlerts =
    report?.dependabotAlerts && typeof report.dependabotAlerts === 'object' ? report.dependabotAlerts : null;
  const currentRunUrl = buildCurrentRunUrl(repository);

  const lines = [issueMarker, buildIssueStateMarker(stateMetadata), '# GitHub Security Drift 外部阻塞跟踪', ''];

  if (resolved) {
    lines.push('> 当前快照不再命中需要人工协作的外部阻塞；此 issue 已由自动化关闭，仅保留为历史证据。');
  } else {
    lines.push('> 当前快照仍命中 GitHub 外部阻塞；此 issue 由自动化持续同步，直到 blocker 解除。');
  }

  lines.push('', '## 当前快照');
  lines.push(`- 仓库：${repository ? formatCode(`${repository.owner}/${repository.repo}`) : '未知'}`);
  lines.push(`- 生成时间：${formatOptionalCode(report?.generatedAt)}`);
  lines.push(`- 默认分支：${formatOptionalCode(report?.defaultBranch)}`);
  lines.push(`- 结论：${formatOptionalCode(report?.conclusion?.kind)}${report?.conclusion?.summary ? ` — ${report.conclusion.summary}` : ''}`);
  lines.push(`- 外部阻塞状态：${resolved ? '已解除或已转入本地依赖修复' : '仍阻塞 shared GitHub security drift 闭环'}`);

  if (currentRunUrl) {
    lines.push(`- 当前 workflow run：[打开本次 GitHub Security Drift 运行](${currentRunUrl})`);
  }

  if (dependencySubmissionEvidence?.htmlUrl) {
    lines.push(`- 最新 dependency submission 证据：[打开 run #${dependencySubmissionEvidence.runId}](${dependencySubmissionEvidence.htmlUrl})`);
  }

  if (dependencySubmissionEvidence?.repositoryBlocker) {
    lines.push('', '## 仓库级阻塞');
    lines.push(`- blocker：${dependencySubmissionEvidence.repositoryBlocker}`);
  }

  if (repositoryBlockerEvidence) {
    lines.push(
      `- blocker API 证据：kind=${formatOptionalCode(repositoryBlockerEvidence.kind)}，status=${formatOptionalNumber(
        repositoryBlockerEvidence.status,
      )}，roots=${formatRootList(repositoryBlockerEvidence.rootLabels)}`,
    );
    if (repositoryBlockerEvidence.message) {
      lines.push(`- blocker message：${repositoryBlockerEvidence.message}`);
    }
  }

  if (dependencyGraphVisibility) {
    lines.push('', '## Dependency Graph 可见性');
    lines.push(`- 检查时间：${formatOptionalCode(dependencyGraphVisibility.checkedAt)}`);
    lines.push(`- manifest 数量：${formatOptionalNumber(dependencyGraphVisibility.manifestCount)}`);
    lines.push(`- 已可见 roots：${formatRootList(dependencyGraphVisibility.visibleRoots)}`);
    lines.push(`- 仍缺失 roots：${formatRootList(dependencyGraphVisibility.missingRoots)}`);
  }

  if (repositorySecurityAndAnalysis) {
    const repositorySecurityLines = buildRepositorySecurityAndAnalysisMarkdownLines(
      repositorySecurityAndAnalysis,
      { heading: '## Repository Security & Analysis' },
    );
    if (repositorySecurityLines.length > 0) {
      lines.push('', ...repositorySecurityLines);
    }
  }

  if (dependabotAlerts) {
    lines.push('', '## Dependabot 漂移事实');
    lines.push(`- alerts unavailable：${dependabotAlerts.unavailable === true ? formatCode('yes') : formatCode('no')}`);
    lines.push(`- open alerts：${formatOptionalNumber(dependabotAlerts.openAlertCount, formatCode(0))}`);
    lines.push(`- actionable alerts：${formatOptionalNumber(dependabotAlerts.actionableAlertCount, formatCode(0))}`);

    if (Array.isArray(dependabotAlerts.alerts) && dependabotAlerts.alerts.length > 0) {
      dependabotAlerts.alerts.slice(0, 5).forEach((alert) => {
        lines.push(
          `- #${alert.number} ${alert.packageName || 'unknown'} @ ${alert.manifestPath || 'unknown'} → ${
            alert.verdict || 'unknown'
          }${alert.patchedVersion ? `（patched >= ${alert.patchedVersion}）` : ''}`,
        );
      });

      if (dependabotAlerts.alerts.length > 5) {
        lines.push(`- 其余 ${dependabotAlerts.alerts.length - 5} 条告警细节请继续查看 artifact。`);
      }
    }
  }

  const recommendedActionLines = buildRecommendedActionsMarkdownLines(recommendedActions, {
    heading: '## Recommended Actions',
  });
  if (recommendedActionLines.length === 0) {
    lines.push('', '## Recommended Actions');
    lines.push('- 当前 report 未提供推荐动作。');
  } else {
    lines.push('', ...recommendedActionLines);
  }

  lines.push('', '## 状态轨迹', DEFAULT_ISSUE_HISTORY_START_MARKER);
  lines.push(...historyLines);
  lines.push(DEFAULT_ISSUE_HISTORY_END_MARKER);

  lines.push('', '## 自动化说明');
  lines.push('- 来源：`scripts/sync-github-security-drift-issue.js` 读取 `dependabot-drift.json` 后自动创建 / 更新。');
  lines.push(
    '- 收敛条件：当 report 不再命中 `platform_drift` / `alerts_unavailable` / `graph_visibility_check_failed` / `repository_blocked_and_alerts_unavailable`，或不再要求外部 blocker 动作时，自动关闭本 issue。',
  );

  return `${lines.join('\n')}\n`;
}

function resolveGithubToken() {
  const token =
    (typeof process.env.GITHUB_TOKEN === 'string' && process.env.GITHUB_TOKEN.trim()) ||
    (typeof process.env.GH_TOKEN === 'string' && process.env.GH_TOKEN.trim()) ||
    '';

  return token || null;
}

function buildApiBaseUrl() {
  return (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
}

async function githubRequest(pathname, options = {}) {
  const token = options.token || resolveGithubToken();
  if (!token) {
    throw new Error('缺少 GITHUB_TOKEN 或 GH_TOKEN，无法同步 GitHub issue。');
  }

  const response = await fetch(`${buildApiBaseUrl()}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rawText = await response.text();
  const data = rawText ? JSON.parse(rawText) : null;

  if (!response.ok) {
    const message = data?.message || rawText || 'unknown error';
    throw new Error(`${options.method || 'GET'} ${pathname} 失败（${response.status}）：${message}`);
  }

  return data;
}

async function findTrackedIssue(repository, options = {}) {
  const normalizedRepository = normalizeRepositoryCoordinates(repository);
  if (!normalizedRepository) {
    return null;
  }

  const issueTitle = options.issueTitle || DEFAULT_ISSUE_TITLE;
  const issueMarker = options.issueMarker || DEFAULT_ISSUE_MARKER;

  for (let page = 1; page <= 5; page += 1) {
    const issues = await githubRequest(
      `/repos/${encodeURIComponent(normalizedRepository.owner)}/${encodeURIComponent(
        normalizedRepository.repo,
      )}/issues?state=all&per_page=100&page=${page}`,
      options,
    );

    if (!Array.isArray(issues) || issues.length === 0) {
      return null;
    }

    const matchedIssue = issues.find((issue) => {
      if (!issue || issue.pull_request) {
        return false;
      }

      const issueBody = typeof issue.body === 'string' ? issue.body : '';
      return issueBody.includes(issueMarker) || issue.title === issueTitle;
    });

    if (matchedIssue) {
      return matchedIssue;
    }
  }

  return null;
}

async function syncIssueFromReport(report, options = {}) {
  const repository = normalizeRepositoryCoordinates(report?.repository);
  if (!repository) {
    throw new Error('report 缺少 repository.owner / repository.repo，无法同步 issue。');
  }

  const issueTitle = options.issueTitle || DEFAULT_ISSUE_TITLE;
  const issueMarker = options.issueMarker || DEFAULT_ISSUE_MARKER;
  const shouldTrack = hasExternalBlocker(report);
  const defaultBranch = normalizeOptionalString(report?.defaultBranch);
  const currentRefName =
    normalizeOptionalString(options.currentRefName) ||
    normalizeOptionalString(process.env.GITHUB_REF_NAME) ||
    normalizeOptionalString(process.env.GITHUB_HEAD_REF);
  const trackingStateMetadata = buildIssueTrackingState(report, { resolved: false });
  const resolvedStateMetadata = buildIssueTrackingState(report, { resolved: true });
  const dryRunTrackingBody = buildIssueBody(report, {
    issueMarker,
    resolved: false,
    stateMetadata: trackingStateMetadata,
    historyLines: buildIssueHistory(report, { resolved: false }),
  });
  const dryRunResolvedBody = buildIssueBody(report, {
    issueMarker,
    resolved: true,
    stateMetadata: resolvedStateMetadata,
    historyLines: buildIssueHistory(report, { resolved: true }),
  });

  if (!options.dryRun && defaultBranch && currentRefName && currentRefName !== defaultBranch) {
    return {
      action: 'skipped_non_default_branch',
      issueNumber: null,
      shouldTrack,
      currentRefName,
      defaultBranch,
      trackingState: shouldTrack ? trackingStateMetadata : resolvedStateMetadata,
      trackingStateChanged: false,
    };
  }

  if (options.dryRun) {
    const trackingState = shouldTrack ? trackingStateMetadata : resolvedStateMetadata;

    return {
      action: shouldTrack ? 'dry_run_track' : 'dry_run_resolved',
      issueNumber: null,
      body: shouldTrack ? dryRunTrackingBody : dryRunResolvedBody,
      shouldTrack,
      trackingState,
      trackingStateChanged: true,
    };
  }

  const existingIssue = await findTrackedIssue(repository, {
    token: options.token,
    issueTitle,
    issueMarker,
  });
  const previousState = parseIssueStateMetadata(existingIssue?.body);
  const previousHistoryLines = parseIssueHistoryLines(existingIssue?.body);
  const trackingHistoryLines = buildIssueHistory(report, {
    resolved: false,
    previousState,
    previousHistoryLines,
  });
  const resolvedHistoryLines = buildIssueHistory(report, {
    resolved: true,
    previousState,
    previousHistoryLines,
  });
  const resolvedBody = buildIssueBody(report, {
    issueMarker,
    resolved: true,
    stateMetadata: resolvedStateMetadata,
    historyLines: resolvedHistoryLines,
  });
  const trackingBody = buildIssueBody(report, {
    issueMarker,
    resolved: false,
    stateMetadata: trackingStateMetadata,
    historyLines: trackingHistoryLines,
  });
  const trackingStateChanged = hasIssueTrackingStateChanged(previousState, trackingStateMetadata);
  const resolvedStateChanged = hasIssueTrackingStateChanged(previousState, resolvedStateMetadata);

  if (!shouldTrack) {
    if (!existingIssue || existingIssue.state !== 'open' || options.closeResolved === false) {
      return {
        action: 'noop',
        issueNumber: existingIssue?.number || null,
        shouldTrack,
        trackingState: resolvedStateMetadata,
        trackingStateChanged: resolvedStateChanged,
      };
    }

    const closedIssue = await githubRequest(
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/issues/${existingIssue.number}`,
      {
        method: 'PATCH',
        token: options.token,
        body: {
          title: issueTitle,
          body: resolvedBody,
          state: 'closed',
          state_reason: 'completed',
        },
      },
    );

    return {
      action: 'closed',
      issueNumber: closedIssue.number,
      shouldTrack,
      trackingState: resolvedStateMetadata,
      trackingStateChanged: resolvedStateChanged,
    };
  }

  if (!existingIssue) {
    const createdIssue = await githubRequest(
      `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/issues`,
      {
        method: 'POST',
        token: options.token,
        body: {
          title: issueTitle,
          body: trackingBody,
        },
      },
    );

    return {
      action: 'created',
      issueNumber: createdIssue.number,
      shouldTrack,
      trackingState: trackingStateMetadata,
      trackingStateChanged: true,
    };
  }

  const requiresUpdate =
    existingIssue.state !== 'open' || existingIssue.title !== issueTitle || existingIssue.body !== trackingBody;

  if (!requiresUpdate) {
    return {
      action: 'noop',
      issueNumber: existingIssue.number,
      shouldTrack,
      trackingState: trackingStateMetadata,
      trackingStateChanged,
    };
  }

  const updatedIssue = await githubRequest(
    `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/issues/${existingIssue.number}`,
    {
      method: 'PATCH',
      token: options.token,
      body: {
        title: issueTitle,
        body: trackingBody,
        state: 'open',
      },
    },
  );

  return {
    action: existingIssue.state === 'closed' ? 'reopened' : 'updated',
    issueNumber: updatedIssue.number,
    shouldTrack,
    trackingState: trackingStateMetadata,
    trackingStateChanged,
  };
}

function buildIssueSyncStepOutputs(result = {}, report = {}) {
  const repository = normalizeRepositoryCoordinates(report?.repository);
  const issueNumber = Number.isInteger(result?.issueNumber) ? result.issueNumber : null;
  const defaultBranch =
    normalizeOptionalString(result?.defaultBranch) || normalizeOptionalString(report?.defaultBranch) || '';
  const trackingState =
    result?.trackingState && typeof result.trackingState === 'object'
      ? result.trackingState
      : buildIssueTrackingState(report, { resolved: result?.shouldTrack === true ? false : true });
  const recommendedActions = Array.isArray(report?.recommendedActions) ? report.recommendedActions : [];
  const primaryAction = recommendedActions[0] && typeof recommendedActions[0] === 'object' ? recommendedActions[0] : null;

  return {
    tracking_issue_action: normalizeOptionalString(result?.action) || '',
    tracking_issue_number: issueNumber !== null ? String(issueNumber) : '',
    tracking_issue_url: buildIssueUrl(repository, issueNumber) || '',
    tracking_issue_should_track: result?.shouldTrack === true ? 'true' : 'false',
    tracking_issue_current_ref: normalizeOptionalString(result?.currentRefName) || '',
    tracking_issue_default_branch: defaultBranch,
    tracking_issue_state_fingerprint: normalizeOptionalString(trackingState?.fingerprint) || '',
    tracking_issue_resolved: trackingState?.resolved === true ? 'true' : 'false',
    tracking_issue_state_changed: result?.trackingStateChanged === true ? 'true' : 'false',
    tracking_issue_primary_action_priority: Number.isInteger(primaryAction?.priority)
      ? String(primaryAction.priority)
      : '',
    tracking_issue_primary_action_code: normalizeOptionalString(primaryAction?.code) || '',
    tracking_issue_primary_action_audience: normalizeOptionalString(primaryAction?.audience) || '',
    tracking_issue_primary_action_summary: normalizeOptionalString(primaryAction?.summary) || '',
    tracking_issue_primary_action_rationale: normalizeOptionalString(primaryAction?.rationale) || '',
    tracking_issue_primary_action_roots_json: JSON.stringify(normalizeList(primaryAction?.roots)),
    tracking_issue_primary_action_href: normalizeOptionalString(primaryAction?.href) || '',
    tracking_issue_primary_action_href_label: normalizeOptionalString(primaryAction?.hrefLabel) || '',
    tracking_issue_primary_action_manual_only: primaryAction?.manualOnly === true ? 'true' : 'false',
    tracking_issue_primary_action_manual_only_reason:
      normalizeOptionalString(primaryAction?.manualOnlyReason) || '',
    tracking_issue_primary_action_documentation_href:
      normalizeOptionalString(primaryAction?.documentationHref) || '',
    tracking_issue_primary_action_documentation_href_label:
      normalizeOptionalString(primaryAction?.documentationHrefLabel) || '',
  };
}

function buildIssueSyncSummaryLines(result = {}, report = {}) {
  const repository = normalizeRepositoryCoordinates(report?.repository);
  const issueNumber = Number.isInteger(result?.issueNumber) ? result.issueNumber : null;
  const issueUrl = buildIssueUrl(repository, issueNumber);
  const defaultBranch =
    normalizeOptionalString(result?.defaultBranch) || normalizeOptionalString(report?.defaultBranch) || null;
  const currentRefName = normalizeOptionalString(result?.currentRefName);
  const trackingState =
    result?.trackingState && typeof result?.trackingState === 'object'
      ? result.trackingState
      : buildIssueTrackingState(report, { resolved: result?.shouldTrack === true ? false : true });
  const recommendedActions = Array.isArray(report?.recommendedActions) ? report.recommendedActions : [];
  const primaryAction = recommendedActions[0] && typeof recommendedActions[0] === 'object' ? recommendedActions[0] : null;
  const lines = ['## Security drift tracking issue'];
  const action = normalizeOptionalString(result?.action) || 'unknown';

  lines.push(`- issue sync action：${formatCode(action)}`);

  if (issueNumber !== null && issueUrl) {
    lines.push(`- tracking issue：[#${issueNumber}](${issueUrl})`);
  } else if (action === 'dry_run_track' || action === 'dry_run_resolved') {
    lines.push('- tracking issue：dry-run 预览，本轮未调用 GitHub issue API。');
  } else {
    lines.push('- tracking issue：本轮没有可写回的 issue 变更。');
  }

  if (action === 'skipped_non_default_branch') {
    lines.push(
      `- 当前 ref：${formatOptionalCode(currentRefName)}；默认分支：${formatOptionalCode(
        defaultBranch,
      )}；为避免把实验性分支结果误同步成仓库级 blocker，本轮只保留 artifact / summary。`,
    );
  } else if (trackingState?.resolved === true) {
    lines.push('- blocker state：已转入 resolved snapshot；若仓库存在打开中的 tracking issue，会在允许关闭时自动收口。');
  } else if (result?.trackingStateChanged === true) {
    lines.push('- blocker state：检测到外部 blocker 语义变化；请重新确认首要动作与平台侧事实。');
  } else {
    lines.push('- blocker state：仅刷新时间戳 / run 链接 / artifact 等 freshness 字段，外部 blocker 语义未变化。');
  }

  lines.push(`- state fingerprint：${formatOptionalCode(trackingState?.fingerprint)}`);

  const currentRunUrl = buildCurrentRunUrl(report?.repository);
  if (currentRunUrl) {
    lines.push(`- current workflow run：${currentRunUrl}`);
  }

  if (primaryAction) {
    const priorityLabel = Number.isInteger(primaryAction.priority) ? `P${primaryAction.priority}` : 'P?';
    lines.push('');
    lines.push('### Primary handoff');
    lines.push(
      `- ${priorityLabel} [${primaryAction.audience || 'unknown'}] ${formatOptionalCode(
        primaryAction.code,
      )}：${primaryAction.summary || '未提供 summary。'}`,
    );

    if (primaryAction.rationale) {
      lines.push(`- rationale：${primaryAction.rationale}`);
    }

    const actionRoots = normalizeList(primaryAction.roots);
    if (actionRoots.length > 0) {
      lines.push(`- affected roots：${formatRootList(actionRoots)}`);
    }

    if (primaryAction.manualOnly === true) {
      lines.push(
        `- execution boundary：仅支持人工操作${
          primaryAction.manualOnlyReason
            ? `（${formatCode(primaryAction.manualOnlyReason)}）`
            : ''
        }，不要继续尝试把这一步误降级成 repo API patch。`,
      );
    }

    if (primaryAction.href) {
      lines.push(`- action link：[${primaryAction.hrefLabel || primaryAction.href}](${primaryAction.href})`);
    }

    if (primaryAction.documentationHref) {
      lines.push(
        `- documentation：[${
          primaryAction.documentationHrefLabel || primaryAction.documentationHref
        }](${primaryAction.documentationHref})`,
      );
    }
  }

  return lines;
}

function writeStepSummary(lines, summaryPath = process.env.GITHUB_STEP_SUMMARY) {
  if (!summaryPath || !Array.isArray(lines) || lines.length === 0) {
    return;
  }

  fs.appendFileSync(summaryPath, `\n${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const options = parseArgs();
  const report = readJsonFile(options.reportPath);
  const result = await syncIssueFromReport(report, options);

  writeGitHubOutputs(buildIssueSyncStepOutputs(result, report));
  writeStepSummary(buildIssueSyncSummaryLines(result, report));

  if (result.body) {
    console.log(result.body);
  }

  if (result.issueNumber) {
    console.log(`GitHub security drift issue sync: action=${result.action}, issue=#${result.issueNumber}`);
    return;
  }

  if (result.action === 'skipped_non_default_branch') {
    console.log(
      `GitHub security drift issue sync: action=${result.action}, current_ref=${result.currentRefName}, default_branch=${result.defaultBranch}`,
    );
    return;
  }

  console.log(`GitHub security drift issue sync: action=${result.action}`);
}

module.exports = {
  DEFAULT_ISSUE_MARKER,
  DEFAULT_ISSUE_TITLE,
  buildIssueBody,
  buildIssueHistory,
  buildIssueSyncSummaryLines,
  buildIssueSyncStepOutputs,
  buildIssueStateFingerprint,
  buildIssueTrackingState,
  findTrackedIssue,
  hasIssueTrackingStateChanged,
  hasExternalBlocker,
  normalizeRepositoryCoordinates,
  parseIssueHistoryLines,
  parseIssueStateMetadata,
  parseArgs,
  syncIssueFromReport,
  writeStepSummary,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`执行失败: ${error.message}`);
    process.exit(1);
  });
}
