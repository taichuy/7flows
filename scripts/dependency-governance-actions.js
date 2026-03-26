const fs = require('fs');

const trackedSecurityAndAnalysisFields = [
  'dependency_graph',
  'automatic_dependency_submission',
  'dependabot_security_updates',
  'secret_scanning',
  'secret_scanning_non_provider_patterns',
  'secret_scanning_push_protection',
  'secret_scanning_validity_checks',
];

function normalizeRecommendedActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .map((action) => {
      const normalizedAction = {
        priority: Number.isInteger(action?.priority) ? action.priority : null,
        audience: typeof action?.audience === 'string' ? action.audience : null,
        code: typeof action?.code === 'string' ? action.code : null,
        summary: typeof action?.summary === 'string' ? action.summary : null,
        rationale: typeof action?.rationale === 'string' ? action.rationale : null,
        roots: Array.isArray(action?.roots) ? action.roots.filter(Boolean) : [],
      };

      if (typeof action?.href === 'string' && action.href.trim()) {
        normalizedAction.href = action.href.trim();
      }

      if (typeof action?.hrefLabel === 'string' && action.hrefLabel.trim()) {
        normalizedAction.hrefLabel = action.hrefLabel.trim();
      }

      return normalizedAction;
    })
    .filter((action) => action.priority !== null && action.audience && action.code && action.summary)
    .sort((left, right) => left.priority - right.priority || left.code.localeCompare(right.code));
}

function dedupeRecommendedActions(actions) {
  const normalized = normalizeRecommendedActions(actions);
  const seen = new Set();

  return normalized.filter((action) => {
    const key = `${action.audience}:${action.code}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function createRecommendedAction(
  priority,
  audience,
  code,
  summary,
  rationale = null,
  roots = [],
  options = {},
) {
  const action = {
    priority,
    audience,
    code,
    summary,
    rationale,
    roots: Array.isArray(roots) ? roots.filter(Boolean) : [],
  };

  if (typeof options?.href === 'string' && options.href.trim()) {
    action.href = options.href.trim();
  }

  if (typeof options?.hrefLabel === 'string' && options.hrefLabel.trim()) {
    action.hrefLabel = options.hrefLabel.trim();
  }

  return action;
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

function buildRepositoryWebUrl(repository) {
  const normalizedRepository = normalizeRepositoryCoordinates(repository);
  if (!normalizedRepository) {
    return null;
  }

  const serverUrl = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');
  return `${serverUrl}/${encodeURIComponent(normalizedRepository.owner)}/${encodeURIComponent(
    normalizedRepository.repo,
  )}`;
}

function buildSecuritySettingsHref(repository) {
  const repositoryUrl = buildRepositoryWebUrl(repository);
  return repositoryUrl ? `${repositoryUrl}/settings/security_analysis` : null;
}

function buildActionsSecretsHref(repository) {
  const repositoryUrl = buildRepositoryWebUrl(repository);
  return repositoryUrl ? `${repositoryUrl}/settings/secrets/actions` : null;
}

function buildDependabotAlertsHref(repository) {
  const repositoryUrl = buildRepositoryWebUrl(repository);
  return repositoryUrl ? `${repositoryUrl}/security/dependabot` : null;
}

function buildWorkflowHref(repository, workflowFile) {
  const repositoryUrl = buildRepositoryWebUrl(repository);
  const normalizedWorkflowFile = typeof workflowFile === 'string' ? workflowFile.trim().split('/').pop() : '';
  if (!repositoryUrl || !normalizedWorkflowFile) {
    return null;
  }

  return `${repositoryUrl}/actions/workflows/${encodeURIComponent(normalizedWorkflowFile)}`;
}

function normalizeSecurityAndAnalysisStatus(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const status = typeof value.status === 'string' ? value.status.trim() : '';
  return status || null;
}

function normalizeRepositorySecurityAndAnalysis(securityAndAnalysis) {
  if (!securityAndAnalysis || typeof securityAndAnalysis !== 'object') {
    return null;
  }

  const rawInput =
    securityAndAnalysis.raw && typeof securityAndAnalysis.raw === 'object'
      ? securityAndAnalysis.raw
      : securityAndAnalysis.security_and_analysis && typeof securityAndAnalysis.security_and_analysis === 'object'
        ? securityAndAnalysis.security_and_analysis
        : securityAndAnalysis;

  const raw = {};
  const availableFields = [];

  Object.entries(rawInput || {}).forEach(([key, value]) => {
    if (!key) {
      return;
    }

    availableFields.push(key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      raw[key] = {
        ...value,
        status: normalizeSecurityAndAnalysisStatus(value),
      };
      return;
    }

    raw[key] = value;
  });

  const dedupedAvailableFields = [...new Set(availableFields)].sort();

  return {
    checkedAt: typeof securityAndAnalysis.checkedAt === 'string' ? securityAndAnalysis.checkedAt : null,
    checkError: typeof securityAndAnalysis.checkError === 'string' ? securityAndAnalysis.checkError : null,
    dependencyGraphStatus: normalizeSecurityAndAnalysisStatus(rawInput?.dependency_graph),
    automaticDependencySubmissionStatus: normalizeSecurityAndAnalysisStatus(
      rawInput?.automatic_dependency_submission,
    ),
    dependabotSecurityUpdatesStatus: normalizeSecurityAndAnalysisStatus(
      rawInput?.dependabot_security_updates,
    ),
    availableFields: dedupedAvailableFields,
    missingFields: trackedSecurityAndAnalysisFields.filter(
      (field) => !dedupedAvailableFields.includes(field),
    ),
    raw,
  };
}

function buildRepositorySecurityAndAnalysisMarkdownLines(
  securityAndAnalysis,
  { heading = '### Repository security & analysis snapshot' } = {},
) {
  const normalized = normalizeRepositorySecurityAndAnalysis(securityAndAnalysis);
  if (!normalized) {
    return [];
  }

  const lines = [];
  if (heading) {
    lines.push(heading, '');
  }

  if (normalized.checkedAt) {
    lines.push(`- checked at: \`${normalized.checkedAt}\``);
  }

  if (normalized.checkError) {
    lines.push(`- check error: ${normalized.checkError}`);
    return lines;
  }

  lines.push(`- dependency graph: \`${normalized.dependencyGraphStatus || 'unknown'}\``);
  lines.push(
    `- automatic dependency submission: \`${normalized.automaticDependencySubmissionStatus || 'unknown'}\``,
  );

  if (normalized.dependabotSecurityUpdatesStatus) {
    lines.push(`- dependabot security updates: \`${normalized.dependabotSecurityUpdatesStatus}\``);
  }

  if (normalized.availableFields.length > 0) {
    lines.push(
      `- fields returned by repo API: ${normalized.availableFields
        .map((field) => `\`${field}\``)
        .join('、')}`,
    );
  }

  if (normalized.missingFields.length > 0) {
    lines.push(
      `- fields absent from repo API payload: ${normalized.missingFields
        .map((field) => `\`${field}\``)
        .join('、')}`,
    );

    if (
      normalized.missingFields.includes('dependency_graph') ||
      normalized.missingFields.includes('automatic_dependency_submission')
    ) {
      lines.push(
        '- repo API 缺失这些字段时，不应把缺失误判成“已开启”；最终仍以 dependency submission blocker 与 manifest visibility 证据为准。',
      );
    }
  }

  return lines;
}

function buildRecommendedActionsMarkdownLines(actions) {
  const normalized = dedupeRecommendedActions(actions);
  if (normalized.length === 0) {
    return [];
  }

  const lines = ['### Recommended next steps', ''];
  normalized.forEach((action) => {
    lines.push(`- P${action.priority} [${action.audience}] \`${action.code}\`: ${action.summary}`);
    if (action.rationale) {
      lines.push(`  - rationale: ${action.rationale}`);
    }
    if (action.roots.length > 0) {
      lines.push(`  - roots: ${action.roots.map((item) => `\`${item}\``).join('、')}`);
    }
    if (action.href) {
      const label = action.hrefLabel || action.code;
      lines.push(`  - link: [${label}](${action.href})`);
    }
  });

  return lines;
}

function buildRecommendedActionsOutputs(actions) {
  const normalized = dedupeRecommendedActions(actions);
  const primaryAction = normalized[0] || null;

  return {
    recommended_actions_count: String(normalized.length),
    recommended_actions_json: JSON.stringify(normalized),
    primary_recommended_action_priority: primaryAction ? String(primaryAction.priority) : '',
    primary_recommended_action_audience: primaryAction?.audience || '',
    primary_recommended_action_code: primaryAction?.code || '',
    primary_recommended_action_summary: primaryAction?.summary || '',
    primary_recommended_action_rationale: primaryAction?.rationale || '',
    primary_recommended_action_roots_json: JSON.stringify(primaryAction?.roots || []),
    primary_recommended_action_href: primaryAction?.href || '',
    primary_recommended_action_href_label: primaryAction?.hrefLabel || '',
  };
}

function serializeGitHubOutputValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function writeGitHubOutputs(outputs, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) {
    return;
  }

  const entries = Object.entries(outputs || {});
  if (entries.length === 0) {
    return;
  }

  const lines = [];
  entries.forEach(([key, rawValue]) => {
    const value = serializeGitHubOutputValue(rawValue);
    const delimiter = `EOF_${key.toUpperCase()}`;
    lines.push(`${key}<<${delimiter}`);
    lines.push(value);
    lines.push(delimiter);
  });

  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function buildSubmissionRecommendedActions({
  items,
  dependencyGraphVisibility = null,
  repositoryBlockerEvidence = null,
  repository = null,
}) {
  const actions = [];
  let priority = 1;
  const blockedRoots = Array.isArray(repositoryBlockerEvidence?.rootLabels)
    ? repositoryBlockerEvidence.rootLabels.filter(Boolean)
    : [];
  const hasDependencyGraphRepositoryBlocker =
    repositoryBlockerEvidence?.kind === 'dependency_graph_disabled' ||
    items.some(
      (item) =>
        item.status === 'blocked' &&
        (item.blockedKind === 'dependency_graph_disabled' || /Dependency graph/.test(item.blockedReason || '')),
    );

  if (hasDependencyGraphRepositoryBlocker) {
    actions.push(
      createRecommendedAction(
        priority++,
        'repository_admin',
        'enable_dependency_graph',
        '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
        'dependency submission API 已直接返回 `dependency_graph_disabled` / `404`，当前阻塞来自仓库设置而不是本地 lock 解析。',
        blockedRoots,
        {
          href: buildSecuritySettingsHref(repository),
          hrefLabel: '打开仓库安全设置',
        },
      ),
    );
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'rerun_dependency_graph_submission',
        '仓库设置更新后手动重跑 `Dependency Graph Submission` workflow，确认 `repositoryBlockerEvidence` 消失并刷新 `dependencyGraphVisibility`。',
        '只有重新提交 snapshot，才能验证 GitHub 是否开始接受当前 roots 并把 manifests 写入 dependency graph。',
        blockedRoots,
        {
          href: buildWorkflowHref(repository, 'dependency-graph-submission.yml'),
          hrefLabel: '打开 Dependency Graph Submission workflow',
        },
      ),
    );
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'rerun_github_security_drift',
        '待 submission 重新成功后重跑 `GitHub Security Drift`，确认 `dependabot-drift.json` 是否收口到最新 graph 事实。',
        'security drift 需要消费最新 dependency submission evidence，才能区分平台刷新延迟与真实依赖问题。',
        [],
        {
          href: buildWorkflowHref(repository, 'github-security-drift.yml'),
          hrefLabel: '打开 GitHub Security Drift workflow',
        },
      ),
    );
    return dedupeRecommendedActions(actions);
  }

  if (dependencyGraphVisibility?.checkError) {
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'investigate_dependency_graph_visibility',
        '排查 `dependencyGraphManifests` 查询失败原因，优先确认当前 token / GraphQL 可见性与 workflow 权限。',
        '当前 workflow 已成功提交或运行，但无法稳定读取提交后的 graph visibility，后续判断会缺少关键证据。',
      ),
    );
  } else if (Array.isArray(dependencyGraphVisibility?.missingRoots) && dependencyGraphVisibility.missingRoots.length > 0) {
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'recheck_dependency_graph_visibility',
        '保留当前 artifact，稍后重跑 `Dependency Graph Submission` 或等待 GitHub 刷新，再确认 `missingRoots` 是否消失。',
        '当前 submission 已成功提交，但仍有 roots 暂未在 `dependencyGraphManifests` 中可见，需要继续区分平台刷新延迟与持续缺席。',
        dependencyGraphVisibility.missingRoots,
      ),
    );
  }

  return dedupeRecommendedActions(actions);
}

function buildDriftRecommendedActions({
  missingNativeGraphRoots = [],
  dependencySubmissionRoots = [],
  dependencySubmissionEvidence = null,
  alertsUnavailable = false,
  openAlertCount = 0,
  actionableAlertCount = 0,
  actionsReadPermissionMissing = false,
  repository = null,
}) {
  const actions = [];
  let priority = 1;
  const submissionReport = dependencySubmissionEvidence?.report || dependencySubmissionEvidence || null;
  const repositoryBlockerEvidence = submissionReport?.repositoryBlockerEvidence || null;
  const dependencyGraphVisibility = submissionReport?.dependencyGraphVisibility || null;
  const hasDependencyGraphRepositoryBlocker =
    repositoryBlockerEvidence?.kind === 'dependency_graph_disabled' || submissionReport?.repositoryBlocker;
  const repositoryBlockedRoots =
    Array.isArray(repositoryBlockerEvidence?.rootLabels) && repositoryBlockerEvidence.rootLabels.length > 0
      ? repositoryBlockerEvidence.rootLabels
      : [
          ...new Set([
            ...missingNativeGraphRoots.map((item) => item.rootLabel),
            ...dependencySubmissionRoots.map((item) => item.rootLabel),
          ]),
        ];

  if (actionableAlertCount > 0) {
    actions.push(
      createRecommendedAction(
        priority++,
        'dependency_owner',
        'fix_actionable_dependabot_alerts',
        '继续修复仍 actionable 的 Dependabot alerts，并在锁文件更新后重跑 `GitHub Security Drift`。',
        '当前至少有一个告警尚未被本地锁文件事实修复，不能把结果归因于平台漂移。',
        [],
        {
          href: buildDependabotAlertsHref(repository),
          hrefLabel: '打开 Dependabot alerts',
        },
      ),
    );
  }

  if (actionsReadPermissionMissing) {
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'grant_actions_read',
        '为 `GitHub Security Drift` workflow 保留 `actions: read`，确保能读取最新 dependency submission run / artifact。',
        '当前读取 workflow run 或 artifact 时出现 `Resource not accessible by integration`，这会切断 drift 与 submission 的证据链。',
        [],
        {
          href: buildWorkflowHref(repository, 'github-security-drift.yml'),
          hrefLabel: '打开 GitHub Security Drift workflow',
        },
      ),
    );
  }

  if (hasDependencyGraphRepositoryBlocker) {
    actions.push(
      createRecommendedAction(
        priority++,
        'repository_admin',
        'enable_dependency_graph',
        '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
        '最新 submission evidence 已明确把 manifests 缺席归类为仓库设置阻塞，而不是 inventory / lock 解析错误。',
        repositoryBlockedRoots,
        {
          href: buildSecuritySettingsHref(repository),
          hrefLabel: '打开仓库安全设置',
        },
      ),
    );
  }

  if (alertsUnavailable) {
    actions.push(
      createRecommendedAction(
        priority++,
        'repository_admin',
        'configure_dependabot_alerts_token',
        '为仓库 secret 配置 `DEPENDABOT_ALERTS_TOKEN`，或使用具备告警读取权限的 `gh` 凭证重跑 `check-dependabot-drift`。',
        hasDependencyGraphRepositoryBlocker
          ? 'submission evidence 已先证明仓库设置阻塞；补 token 的目的是在解除 blocker 后恢复 workflow 内的 Dependabot alert 对照。'
          : '当前 workflow token 只能读取 dependency graph 事实，无法对比 Dependabot open alerts。',
        [],
        {
          href: buildActionsSecretsHref(repository),
          hrefLabel: '打开 Actions secrets',
        },
      ),
    );
  }

  if (hasDependencyGraphRepositoryBlocker) {
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'rerun_dependency_graph_submission',
        '仓库设置更新后重跑 `Dependency Graph Submission` workflow，确认 blocker evidence 是否消失并刷新 manifests。',
        '只有新的 submission run 才能证明 roots 是否开始在 GitHub dependency graph 中可见。',
        repositoryBlockedRoots,
        {
          href: buildWorkflowHref(repository, 'dependency-graph-submission.yml'),
          hrefLabel: '打开 Dependency Graph Submission workflow',
        },
      ),
    );
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'rerun_github_security_drift',
        'submission evidence 刷新后重跑 `GitHub Security Drift`，确认 `dependabot-drift.json` 是否开始收口到最新 graph / alert 事实。',
        'drift 结论需要依赖最新 submission artifact 与 dependencyGraphManifests visibility。',
        [],
        {
          href: buildWorkflowHref(repository, 'github-security-drift.yml'),
          hrefLabel: '打开 GitHub Security Drift workflow',
        },
      ),
    );
  } else {
    if (missingNativeGraphRoots.length > 0) {
      actions.push(
        createRecommendedAction(
          priority++,
          'workflow_maintainer',
          'investigate_native_graph_coverage',
          '核对原生受支持 manifest roots 的 GitHub graph coverage，优先区分平台刷新延迟、仓库设置与 token 异常。',
          '本地 inventory 里仍有原生支持的 roots 没有出现在 `dependencyGraphManifests`。',
          missingNativeGraphRoots.map((item) => item.rootLabel),
        ),
      );
    }

    if (dependencySubmissionRoots.length > 0 && !dependencySubmissionEvidence?.runAvailable) {
      actions.push(
        createRecommendedAction(
          priority++,
          'workflow_maintainer',
        'run_dependency_graph_submission',
        '手动重跑 `Dependency Graph Submission` workflow，确保依赖显式 submission 的 roots 至少有最新 artifact 可复验。',
        'drift 已确认部分 roots 依赖额外 submission，但默认分支当前还没有可引用的最新 submission run。',
        dependencySubmissionRoots.map((item) => item.rootLabel),
        {
          href: buildWorkflowHref(repository, 'dependency-graph-submission.yml'),
          hrefLabel: '打开 Dependency Graph Submission workflow',
        },
      ),
    );
    } else if (
      Array.isArray(dependencyGraphVisibility?.missingRoots) &&
      dependencyGraphVisibility.missingRoots.length > 0
    ) {
      actions.push(
        createRecommendedAction(
          priority++,
          'workflow_maintainer',
          'recheck_dependency_submission_visibility',
          '保留 artifact 并稍后重跑 `GitHub Security Drift`，继续根据最新 `dependencyGraphVisibility.missingRoots` 判断是平台刷新延迟还是持续缺席。',
          'submission workflow 已运行，但部分 roots 提交后仍暂未出现在 dependency graph。',
          dependencyGraphVisibility.missingRoots,
        ),
      );
    }
  }

  if (!alertsUnavailable && openAlertCount > 0 && actionableAlertCount === 0) {
    actions.push(
      createRecommendedAction(
        priority++,
        'dependency_owner',
        'preserve_platform_drift_evidence',
        '保留当前 drift artifact，不要直接 dismiss alert；先等待 GitHub dependency graph / alert 状态自动收口后再复验。',
        '当前 open alerts 已被本地锁文件修复，剩余差异主要来自平台事实刷新。',
      ),
    );
  }

  return dedupeRecommendedActions(actions);
}

module.exports = {
  buildRepositorySecurityAndAnalysisMarkdownLines,
  buildRecommendedActionsOutputs,
  buildDriftRecommendedActions,
  buildRecommendedActionsMarkdownLines,
  buildSubmissionRecommendedActions,
  dedupeRecommendedActions,
  normalizeRepositorySecurityAndAnalysis,
  normalizeRecommendedActions,
  serializeGitHubOutputValue,
  writeGitHubOutputs,
};
