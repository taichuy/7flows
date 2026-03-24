const fs = require('fs');

function normalizeRecommendedActions(actions) {
  return (Array.isArray(actions) ? actions : [])
    .map((action) => ({
      priority: Number.isInteger(action?.priority) ? action.priority : null,
      audience: typeof action?.audience === 'string' ? action.audience : null,
      code: typeof action?.code === 'string' ? action.code : null,
      summary: typeof action?.summary === 'string' ? action.summary : null,
      rationale: typeof action?.rationale === 'string' ? action.rationale : null,
      roots: Array.isArray(action?.roots) ? action.roots.filter(Boolean) : [],
    }))
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

function createRecommendedAction(priority, audience, code, summary, rationale = null, roots = []) {
  return {
    priority,
    audience,
    code,
    summary,
    rationale,
    roots: Array.isArray(roots) ? roots.filter(Boolean) : [],
  };
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
      ),
    );
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'rerun_github_security_drift',
        '待 submission 重新成功后重跑 `GitHub Security Drift`，确认 `dependabot-drift.json` 是否收口到最新 graph 事实。',
        'security drift 需要消费最新 dependency submission evidence，才能区分平台刷新延迟与真实依赖问题。',
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
}) {
  const actions = [];
  let priority = 1;
  const submissionReport = dependencySubmissionEvidence?.report || dependencySubmissionEvidence || null;
  const repositoryBlockerEvidence = submissionReport?.repositoryBlockerEvidence || null;
  const dependencyGraphVisibility = submissionReport?.dependencyGraphVisibility || null;

  if (actionableAlertCount > 0) {
    actions.push(
      createRecommendedAction(
        priority++,
        'dependency_owner',
        'fix_actionable_dependabot_alerts',
        '继续修复仍 actionable 的 Dependabot alerts，并在锁文件更新后重跑 `GitHub Security Drift`。',
        '当前至少有一个告警尚未被本地锁文件事实修复，不能把结果归因于平台漂移。',
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
        '当前 workflow token 只能读取 dependency graph 事实，无法对比 Dependabot open alerts。',
      ),
    );
  }

  if (
    repositoryBlockerEvidence?.kind === 'dependency_graph_disabled' ||
    submissionReport?.repositoryBlocker
  ) {
    const roots = Array.isArray(repositoryBlockerEvidence?.rootLabels) && repositoryBlockerEvidence.rootLabels.length > 0
      ? repositoryBlockerEvidence.rootLabels
      : [
          ...new Set([
            ...missingNativeGraphRoots.map((item) => item.rootLabel),
            ...dependencySubmissionRoots.map((item) => item.rootLabel),
          ]),
        ];

    actions.push(
      createRecommendedAction(
        priority++,
        'repository_admin',
        'enable_dependency_graph',
        '在 `Settings -> Security & analysis` 启用 `Dependency graph`，必要时一并确认 `Automatic dependency submission`。',
        '最新 submission evidence 已明确把 manifests 缺席归类为仓库设置阻塞，而不是 inventory / lock 解析错误。',
        roots,
      ),
    );
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'rerun_dependency_graph_submission',
        '仓库设置更新后重跑 `Dependency Graph Submission` workflow，确认 blocker evidence 是否消失并刷新 manifests。',
        '只有新的 submission run 才能证明 roots 是否开始在 GitHub dependency graph 中可见。',
        roots,
      ),
    );
    actions.push(
      createRecommendedAction(
        priority++,
        'workflow_maintainer',
        'rerun_github_security_drift',
        'submission evidence 刷新后重跑 `GitHub Security Drift`，确认 `dependabot-drift.json` 是否开始收口到最新 graph / alert 事实。',
        'drift 结论需要依赖最新 submission artifact 与 dependencyGraphManifests visibility。',
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
  buildRecommendedActionsOutputs,
  buildDriftRecommendedActions,
  buildRecommendedActionsMarkdownLines,
  buildSubmissionRecommendedActions,
  dedupeRecommendedActions,
  normalizeRecommendedActions,
  serializeGitHubOutputValue,
  writeGitHubOutputs,
};
