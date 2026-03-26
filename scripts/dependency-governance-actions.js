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

const manualVerificationMissingSecurityAndAnalysisFields = [
  'dependency_graph',
  'automatic_dependency_submission',
];

const dependencyGraphDocsHref =
  'https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enabling-the-dependency-graph';

const automaticDependencySubmissionDocsHref =
  'https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/configuring-automatic-dependency-submission-for-your-repository';

function normalizeStringList(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim()),
    ),
  ];
}

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

      if (typeof action?.documentationHref === 'string' && action.documentationHref.trim()) {
        normalizedAction.documentationHref = action.documentationHref.trim();
      }

      if (typeof action?.documentationHrefLabel === 'string' && action.documentationHrefLabel.trim()) {
        normalizedAction.documentationHrefLabel = action.documentationHrefLabel.trim();
      }

      if (action?.manualOnly === true) {
        normalizedAction.manualOnly = true;
      }

      if (typeof action?.manualOnlyReason === 'string' && action.manualOnlyReason.trim()) {
        normalizedAction.manualOnlyReason = action.manualOnlyReason.trim();
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

  if (typeof options?.documentationHref === 'string' && options.documentationHref.trim()) {
    action.documentationHref = options.documentationHref.trim();
  }

  if (typeof options?.documentationHrefLabel === 'string' && options.documentationHrefLabel.trim()) {
    action.documentationHrefLabel = options.documentationHrefLabel.trim();
  }

  if (options?.manualOnly === true) {
    action.manualOnly = true;
  }

  if (typeof options?.manualOnlyReason === 'string' && options.manualOnlyReason.trim()) {
    action.manualOnlyReason = options.manualOnlyReason.trim();
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

function isGitHubApiRateLimitError(message) {
  if (typeof message !== 'string') {
    return false;
  }

  return /rate limit exceeded|secondary rate limit|rate limit/i.test(message);
}

function isNormalizedRepositorySecurityAndAnalysis(securityAndAnalysis) {
  if (!securityAndAnalysis || typeof securityAndAnalysis !== 'object' || Array.isArray(securityAndAnalysis)) {
    return false;
  }

  return (
    'dependencyGraphStatus' in securityAndAnalysis ||
    'automaticDependencySubmissionStatus' in securityAndAnalysis ||
    'dependabotSecurityUpdatesStatus' in securityAndAnalysis ||
    'availableFields' in securityAndAnalysis ||
    'missingFields' in securityAndAnalysis ||
    'manualVerificationRequired' in securityAndAnalysis ||
    'manualVerificationReason' in securityAndAnalysis
  );
}

function normalizeRepositorySecurityAndAnalysis(securityAndAnalysis) {
  if (!securityAndAnalysis || typeof securityAndAnalysis !== 'object') {
    return null;
  }

  if (isNormalizedRepositorySecurityAndAnalysis(securityAndAnalysis)) {
    const availableFields = normalizeStringList(securityAndAnalysis.availableFields);
    const missingFields = normalizeStringList(securityAndAnalysis.missingFields);
    const manualVerificationRequired =
      securityAndAnalysis.manualVerificationRequired === true ||
      manualVerificationMissingSecurityAndAnalysisFields.some((field) => missingFields.includes(field));

    return {
      checkedAt:
        typeof securityAndAnalysis.checkedAt === 'string' ? securityAndAnalysis.checkedAt : null,
      checkError:
        typeof securityAndAnalysis.checkError === 'string' ? securityAndAnalysis.checkError : null,
      dependencyGraphStatus:
        typeof securityAndAnalysis.dependencyGraphStatus === 'string'
          ? securityAndAnalysis.dependencyGraphStatus.trim() || null
          : null,
      automaticDependencySubmissionStatus:
        typeof securityAndAnalysis.automaticDependencySubmissionStatus === 'string'
          ? securityAndAnalysis.automaticDependencySubmissionStatus.trim() || null
          : null,
      dependabotSecurityUpdatesStatus:
        typeof securityAndAnalysis.dependabotSecurityUpdatesStatus === 'string'
          ? securityAndAnalysis.dependabotSecurityUpdatesStatus.trim() || null
          : null,
      availableFields,
      missingFields,
      manualVerificationRequired,
      manualVerificationReason:
        typeof securityAndAnalysis.manualVerificationReason === 'string' &&
        securityAndAnalysis.manualVerificationReason.trim()
          ? securityAndAnalysis.manualVerificationReason.trim()
          : manualVerificationRequired
            ? 'missing_dependency_graph_fields'
            : null,
      raw:
        securityAndAnalysis.raw && typeof securityAndAnalysis.raw === 'object'
          ? securityAndAnalysis.raw
          : {},
    };
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
  const missingFields = trackedSecurityAndAnalysisFields.filter(
    (field) => !dedupedAvailableFields.includes(field),
  );
  const manualVerificationRequired = manualVerificationMissingSecurityAndAnalysisFields.some((field) =>
    missingFields.includes(field),
  );

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
    missingFields,
    manualVerificationRequired,
    manualVerificationReason: manualVerificationRequired
      ? 'missing_dependency_graph_fields'
      : null,
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
  lines.push(
    `- dependabot security updates: \`${normalized.dependabotSecurityUpdatesStatus || 'unknown'}\``,
  );

  if (normalized.availableFields.length > 0) {
    lines.push(
      `- repo API 返回字段：${normalized.availableFields
        .map((field) => `\`${field}\``)
        .join('、')}`,
    );
  }

  if (normalized.missingFields.length > 0) {
    const missingFieldsInline = normalized.missingFields
      .map((field) => `\`${field}\``)
      .join('、');

    lines.push(
      `- repo API 未返回字段：${missingFieldsInline}`,
    );
    lines.push(`- fields absent from repo API payload: ${missingFieldsInline}`);

    if (normalized.manualVerificationReason) {
      lines.push(`- manual verification reason：\`${normalized.manualVerificationReason}\``);
    }

    if (
      normalized.missingFields.includes('dependency_graph') ||
      normalized.missingFields.includes('automatic_dependency_submission')
    ) {
      lines.push(
        '- repo API 缺失这些字段时，不应把缺失误判成“已开启”；最终仍以 dependency submission blocker 与 manifest visibility 证据为准。',
      );

      if (normalized.manualVerificationRequired) {
        lines.push(
          '- 即使 `gh api -X PATCH repos/{owner}/{repo}` 返回成功响应，也不要把这一步当成完成信号；仍需到 `Settings -> Security & analysis` 人工确认，并用新的 submission artifact 复验 blocker 是否消失。',
        );
        lines.push(
          `- GitHub 官方文档当前同样只给出仓库设置页入口：[Enabling the dependency graph](${dependencyGraphDocsHref})、[Configuring automatic dependency submission](${automaticDependencySubmissionDocsHref})。`,
        );
      }
    }
  }

  return lines;
}

function buildRecommendedActionsMarkdownLines(
  actions,
  { heading = '### Recommended next steps' } = {},
) {
  const normalized = dedupeRecommendedActions(actions);
  if (normalized.length === 0) {
    return [];
  }

  const lines = [];
  if (heading) {
    lines.push(heading, '');
  }
  normalized.forEach((action) => {
    lines.push(`- P${action.priority} [${action.audience}] \`${action.code}\`: ${action.summary}`);
    if (action.rationale) {
      lines.push(`  - rationale: ${action.rationale}`);
    }
    if (action.manualOnly) {
      lines.push(
        `  - 仅支持人工操作${
          action.manualOnlyReason ? `（\`${action.manualOnlyReason}\`）` : ''
        }`,
      );
      lines.push(
        `  - execution: manual-only step${
          action.manualOnlyReason ? ` (${action.manualOnlyReason})` : ''
        }`,
      );
    }
    if (action.roots.length > 0) {
      lines.push(`  - roots: ${action.roots.map((item) => `\`${item}\``).join('、')}`);
    }
    if (action.href) {
      const label = action.hrefLabel || action.code;
      lines.push(`  - link: [${label}](${action.href})`);
    }
    if (action.documentationHref) {
      const label = action.documentationHrefLabel || `${action.code} docs`;
      lines.push(`  - docs: [${label}](${action.documentationHref})`);
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
    primary_recommended_action_manual_only: primaryAction?.manualOnly ? 'true' : 'false',
    primary_recommended_action_manual_only_reason: primaryAction?.manualOnlyReason || '',
    primary_recommended_action_documentation_href: primaryAction?.documentationHref || '',
    primary_recommended_action_documentation_href_label:
      primaryAction?.documentationHrefLabel || '',
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
        '在 GitHub 仓库设置页（`Settings -> Security & analysis`）手动启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
        'dependency submission API 已直接返回 `dependency_graph_disabled` / `404`，当前阻塞来自仓库设置而不是本地 lock 解析；GitHub 官方文档当前也要求通过仓库设置页处理。',
        blockedRoots,
        {
          href: buildSecuritySettingsHref(repository),
          hrefLabel: '打开仓库安全设置',
          documentationHref: dependencyGraphDocsHref,
          documentationHrefLabel: '查看官方 Dependency graph 指引',
          manualOnly: true,
          manualOnlyReason: 'github_settings_ui',
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
        isGitHubApiRateLimitError(dependencyGraphVisibility.checkError)
          ? 'rerun_with_authenticated_github_api'
          : 'investigate_dependency_graph_visibility',
        isGitHubApiRateLimitError(dependencyGraphVisibility.checkError)
          ? '使用具备更高 GitHub API 配额的 token / `gh` 凭证后重跑 graph visibility 检查，避免 `dependencyGraphManifests` 因 rate limit 中断。'
          : '排查 `dependencyGraphManifests` 查询失败原因，优先确认当前 token / GraphQL 可见性与 workflow 权限。',
        isGitHubApiRateLimitError(dependencyGraphVisibility.checkError)
          ? '当前 workflow 已成功提交或运行，但 GitHub API 直接返回 rate limit，继续判断 graph visibility 会缺少关键证据。'
          : '当前 workflow 已成功提交或运行，但无法稳定读取提交后的 graph visibility，后续判断会缺少关键证据。',
        [],
        isGitHubApiRateLimitError(dependencyGraphVisibility.checkError)
          ? {
              href: buildActionsSecretsHref(repository),
              hrefLabel: '打开 Actions secrets',
            }
          : {},
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

function hasUsableDependencySubmissionEvidence(submissionReport) {
  if (!submissionReport || typeof submissionReport !== 'object') {
    return false;
  }

  const repositoryBlockerEvidence = submissionReport.repositoryBlockerEvidence;
  const dependencyGraphVisibility = submissionReport.dependencyGraphVisibility;

  return Boolean(
    submissionReport.repositoryBlocker ||
      (repositoryBlockerEvidence &&
        typeof repositoryBlockerEvidence === 'object' &&
        !Array.isArray(repositoryBlockerEvidence) &&
        (repositoryBlockerEvidence.kind ||
          repositoryBlockerEvidence.message ||
          (Array.isArray(repositoryBlockerEvidence.rootLabels) &&
            repositoryBlockerEvidence.rootLabels.length > 0))) ||
      (dependencyGraphVisibility &&
        typeof dependencyGraphVisibility === 'object' &&
        !Array.isArray(dependencyGraphVisibility) &&
        (dependencyGraphVisibility.checkError ||
          dependencyGraphVisibility.defaultBranch ||
          Number.isInteger(dependencyGraphVisibility.manifestCount) ||
          (Array.isArray(dependencyGraphVisibility.visibleRoots) &&
            dependencyGraphVisibility.visibleRoots.length > 0) ||
          (Array.isArray(dependencyGraphVisibility.missingRoots) &&
            dependencyGraphVisibility.missingRoots.length > 0))) ||
      (Array.isArray(submissionReport.recommendedActions) &&
        submissionReport.recommendedActions.length > 0) ||
      (Array.isArray(submissionReport.roots) && submissionReport.roots.length > 0) ||
      (Array.isArray(submissionReport.blockedRoots) && submissionReport.blockedRoots.length > 0) ||
      (Array.isArray(submissionReport.submittedRoots) && submissionReport.submittedRoots.length > 0)
  );
}

function buildDriftRecommendedActions({
  missingNativeGraphRoots = [],
  dependencySubmissionRoots = [],
  dependencySubmissionEvidence = null,
  dependencyGraphVisibilityCheckError = null,
  alertsUnavailable = false,
  openAlertCount = 0,
  actionableAlertCount = 0,
  actionsReadPermissionMissing = false,
  repository = null,
}) {
  const actions = [];
  let priority = 1;
  const submissionReport = dependencySubmissionEvidence?.report || dependencySubmissionEvidence || null;
  const hasUsableSubmissionEvidence = hasUsableDependencySubmissionEvidence(submissionReport);
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

  if (actionsReadPermissionMissing && !hasUsableSubmissionEvidence) {
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

  if (dependencyGraphVisibilityCheckError) {
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        isGitHubApiRateLimitError(dependencyGraphVisibilityCheckError)
          ? 'rerun_with_authenticated_github_api'
          : 'investigate_dependency_graph_visibility',
        isGitHubApiRateLimitError(dependencyGraphVisibilityCheckError)
          ? '使用具备更高 GitHub API 配额的 token / `gh` 凭证后重跑 `check-dependabot-drift`，避免 `dependencyGraphManifests` 因 rate limit 中断。'
          : '排查 `dependencyGraphManifests` 查询失败原因，优先确认当前 token / GraphQL 可见性与 workflow 权限。',
        isGitHubApiRateLimitError(dependencyGraphVisibilityCheckError)
          ? '当前 drift 检查在读取 `dependencyGraphManifests` 时直接命中 GitHub API rate limit，尚未形成可验证的 graph visibility 证据。'
          : '当前 drift 检查无法稳定读取 `dependencyGraphManifests`，后续判断会缺少关键 graph visibility 证据。',
        [],
        isGitHubApiRateLimitError(dependencyGraphVisibilityCheckError)
          ? {
              href: buildActionsSecretsHref(repository),
              hrefLabel: '打开 Actions secrets',
            }
          : {},
      ),
    );
  }

  if (hasDependencyGraphRepositoryBlocker) {
    actions.push(
      createRecommendedAction(
        priority++,
        'repository_admin',
        'enable_dependency_graph',
        '在 GitHub 仓库设置页（`Settings -> Security & analysis`）手动启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
        '最新 submission evidence 已明确把 manifests 缺席归类为仓库设置阻塞，而不是 inventory / lock 解析错误；GitHub 官方文档当前也要求通过仓库设置页处理。',
        repositoryBlockedRoots,
        {
          href: buildSecuritySettingsHref(repository),
          hrefLabel: '打开仓库安全设置',
          documentationHref: dependencyGraphDocsHref,
          documentationHrefLabel: '查看官方 Dependency graph 指引',
          manualOnly: true,
          manualOnlyReason: 'github_settings_ui',
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
