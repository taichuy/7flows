const fs = require('fs');
const {
  buildRecommendedActionsMarkdownLines,
  buildRepositorySecurityAndAnalysisMarkdownLines,
} = require('./dependency-governance-actions');

const DEFAULT_ISSUE_TITLE = 'GitHub Security Drift: external blocker';
const DEFAULT_ISSUE_MARKER = '<!-- 7flows:github-security-drift-tracking -->';
const EXTERNAL_BLOCKER_ACTION_CODES = new Set([
  'enable_dependency_graph',
  'configure_dependabot_alerts_token',
  'rerun_dependency_graph_submission',
  'rerun_github_security_drift',
]);
const EXTERNAL_BLOCKER_CONCLUSION_KINDS = new Set([
  'platform_drift',
  'alerts_unavailable',
  'repository_blocked_and_alerts_unavailable',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    reportPath: null,
    issueTitle: DEFAULT_ISSUE_TITLE,
    issueMarker: DEFAULT_ISSUE_MARKER,
    closeResolved: true,
    dryRun: false,
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

  const lines = [issueMarker, '# GitHub Security Drift 外部阻塞跟踪', ''];

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

  lines.push('', '## 自动化说明');
  lines.push('- 来源：`scripts/sync-github-security-drift-issue.js` 读取 `dependabot-drift.json` 后自动创建 / 更新。');
  lines.push(
    '- 收敛条件：当 report 不再命中 `platform_drift` / `alerts_unavailable` / `repository_blocked_and_alerts_unavailable`，或不再要求外部 blocker 动作时，自动关闭本 issue。',
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
  const resolvedBody = buildIssueBody(report, { issueMarker, resolved: true });
  const trackingBody = buildIssueBody(report, { issueMarker, resolved: false });

  if (!options.dryRun && defaultBranch && currentRefName && currentRefName !== defaultBranch) {
    return {
      action: 'skipped_non_default_branch',
      issueNumber: null,
      shouldTrack,
      currentRefName,
      defaultBranch,
    };
  }

  if (options.dryRun) {
    return {
      action: shouldTrack ? 'dry_run_track' : 'dry_run_resolved',
      issueNumber: null,
      body: shouldTrack ? trackingBody : resolvedBody,
      shouldTrack,
    };
  }

  const existingIssue = await findTrackedIssue(repository, {
    token: options.token,
    issueTitle,
    issueMarker,
  });

  if (!shouldTrack) {
    if (!existingIssue || existingIssue.state !== 'open' || options.closeResolved === false) {
      return {
        action: 'noop',
        issueNumber: existingIssue?.number || null,
        shouldTrack,
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
    };
  }

  const requiresUpdate =
    existingIssue.state !== 'open' || existingIssue.title !== issueTitle || existingIssue.body !== trackingBody;

  if (!requiresUpdate) {
    return {
      action: 'noop',
      issueNumber: existingIssue.number,
      shouldTrack,
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
  };
}

async function main() {
  const options = parseArgs();
  const report = readJsonFile(options.reportPath);
  const result = await syncIssueFromReport(report, options);

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
  findTrackedIssue,
  hasExternalBlocker,
  normalizeRepositoryCoordinates,
  parseArgs,
  syncIssueFromReport,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`执行失败: ${error.message}`);
    process.exit(1);
  });
}
