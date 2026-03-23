import type { WorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import {
  getWorkspaceStarterBulkActionLabel,
  getWorkspaceStarterBulkPreviewReasonLabel,
  getWorkspaceStarterBulkSkipReasonLabel
} from "@/lib/workspace-starter-mutation-presenters";
import type {
  WorkspaceStarterBulkAction,
  WorkspaceStarterBulkActionPreview,
  WorkspaceStarterBulkPreview,
  WorkspaceStarterBulkPreviewBlockedItem,
  WorkspaceStarterBulkPreviewCandidateItem,
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterBulkReceiptItem,
  WorkspaceStarterHistoryItem,
  WorkspaceStarterSourceDiff,
  WorkspaceStarterSourceDiffSummary,
  WorkspaceStarterSourceGovernanceKind,
  WorkspaceStarterSourceGovernanceScopeSummary as WorkspaceStarterSourceGovernanceScopeSummaryPayload,
  WorkspaceStarterSourceGovernance,
  WorkspaceStarterTemplateItem,
  WorkspaceStarterValidationIssue
} from "@/lib/get-workspace-starters";
import {
  DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE,
  readWorkspaceStarterLibraryViewState,
  type ArchiveFilter,
  type SourceGovernanceFilter,
  type TrackFilter,
  type WorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";

export {
  DEFAULT_WORKSPACE_STARTER_LIBRARY_VIEW_STATE,
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowCreateSearchParamsFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibrarySearchParams,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
export {
  buildBulkActionMessage,
  buildWorkspaceStarterBulkActionErrorMessage,
  buildWorkspaceStarterBulkActionPendingMessage,
  buildWorkspaceStarterBulkActionSuccessMessage,
  buildWorkspaceStarterBulkResultSurfaceCopy,
  buildWorkspaceStarterMetadataIdleMessage,
  buildWorkspaceStarterMutationFallbackErrorMessage,
  buildWorkspaceStarterMutationNetworkErrorMessage,
  buildWorkspaceStarterMutationPendingMessage,
  buildWorkspaceStarterMutationSuccessMessage,
  getWorkspaceStarterBulkActionButtonLabel,
  getWorkspaceStarterBulkActionConfirmationMessage,
  getWorkspaceStarterBulkActionLabel,
  getWorkspaceStarterBulkPreviewReasonLabel,
  getWorkspaceStarterBulkSkipReasonLabel
} from "@/lib/workspace-starter-mutation-presenters";
export type {
  ArchiveFilter,
  SourceGovernanceFilter,
  TrackFilter,
  WorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
export type {
  WorkspaceStarterBulkResultSurfaceCopy,
  WorkspaceStarterMessageTone,
  WorkspaceStarterTemplateMutationAction
} from "@/lib/workspace-starter-mutation-presenters";

export type WorkspaceStarterFormState = {
  name: string;
  description: string;
  businessTrack: WorkflowBusinessTrack;
  defaultWorkflowName: string;
  workflowFocus: string;
  recommendedNextStep: string;
  tagsText: string;
};

export type WorkspaceStarterNarrativeItem = {
  label: string;
  text: string;
};

export type WorkspaceStarterSourceActionDecision = {
  recommendedAction: "refresh" | "rebase" | "none";
  statusLabel: string;
  summary: string;
  canRefresh: boolean;
  canRebase: boolean;
  factChips: string[];
};

export type WorkspaceStarterBulkAffectedStarterTarget = {
  templateId: string;
  name: string;
  sourceWorkflowVersion: string | null;
  sandboxNodeSummary: string;
  driftNodeCount: number;
  archived: boolean;
};

export type WorkspaceStarterBulkPreviewFocusTarget = {
  templateId: string;
  name: string;
  sourceWorkflowVersion: string | null;
  statusLabel: string;
  archived: boolean;
};

export type WorkspaceStarterBulkResultFocusTarget = {
  templateId: string;
  name: string;
  sourceWorkflowVersion: string | null;
  statusLabel: string;
  detail: string | null;
  sandboxNodeSummary: string | null;
  driftNodeCount: number;
  archived: boolean;
};

export type WorkspaceStarterSourceGovernanceFocusTarget = {
  templateId: string;
  name: string;
  sourceWorkflowVersion: string | null;
  statusLabel: string;
  archived: boolean;
};

export type WorkspaceStarterSourceGovernancePresenter = {
  kind: WorkspaceStarterSourceGovernance["kind"] | "unknown";
  statusLabel: string;
  actionStatusLabel: string | null;
  summary: string;
  followUp: string | null;
  sourceVersion: string | null;
  factChips: string[];
  needsAttention: boolean;
};

export type WorkspaceStarterGovernanceRecommendedNextStep = {
  action: "refresh" | "rebase" | "create_workflow" | "review_result_receipt";
  label: string;
  detail: string;
  focusTemplateId: string | null;
  focusLabel: string | null;
};

export type WorkspaceStarterSourceGovernanceSurface = {
  presenter: WorkspaceStarterSourceGovernancePresenter;
  actionDecision: WorkspaceStarterSourceActionDecision;
  recommendedNextStep: WorkspaceStarterGovernanceRecommendedNextStep | null;
};

export type WorkspaceStarterSourceGovernancePrimaryFollowUp = {
  label: string;
  headline: string;
  detail: string;
  focusTemplateId: string | null;
  focusLabel: string | null;
};

export type WorkspaceStarterSourceGovernanceScopeSummary = {
  chips: string[];
  summary: string;
  attentionCount: number;
};

export type WorkspaceStarterBulkResultSurface = {
  primarySignal: string | null;
  followUpExplanation: string | null;
  recommendedNextStep: WorkspaceStarterGovernanceRecommendedNextStep | null;
  shouldRenderStandaloneFollowUpExplanation: boolean;
};

export type WorkspaceStarterSourceDiffSummaryCard = {
  label: string;
  value: string;
};

export type WorkspaceStarterSourceDiffEntrySurface = {
  key: string;
  title: string;
  meta: string;
  statusLabel: string;
  changedFields: string[];
  templateFacts: string[];
  sourceFacts: string[];
};

export type WorkspaceStarterSourceDiffSectionSurface = {
  key: string;
  title: string;
  summary: string;
  changeBadge: string;
  emptyMessage: string;
  entries: WorkspaceStarterSourceDiffEntrySurface[];
};

export type WorkspaceStarterSourceDiffSurface = {
  summaryCards: WorkspaceStarterSourceDiffSummaryCard[];
  rebaseCard: {
    title: string;
    meta: string;
    statusLabel: string;
    summary: string;
    chips: string[];
    canRebase: boolean;
  };
  sections: WorkspaceStarterSourceDiffSectionSurface[];
};

const WORKSPACE_STARTER_SOURCE_GOVERNANCE_FOLLOW_UP_KINDS = new Set<WorkspaceStarterSourceGovernanceKind>([
  "drifted",
  "missing_source"
]);

const WORKSPACE_STARTER_SOURCE_GOVERNANCE_KIND_LABELS = {
  no_source: "无来源",
  missing_source: "来源缺失",
  synced: "已对齐",
  drifted: "来源漂移",
  unknown: "治理缺口"
} as const;

export function filterWorkspaceStarterTemplates(
  templates: WorkspaceStarterTemplateItem[],
  viewState: Pick<
    WorkspaceStarterLibraryViewState,
    "activeTrack" | "archiveFilter" | "sourceGovernanceKind" | "needsFollowUp" | "searchQuery"
  >
) {
  const normalizedSearch = viewState.searchQuery.trim().toLowerCase();

  return templates.filter((template) => {
    if (viewState.archiveFilter === "active" && template.archived) {
      return false;
    }
    if (viewState.archiveFilter === "archived" && !template.archived) {
      return false;
    }
    if (viewState.activeTrack !== "all" && template.business_track !== viewState.activeTrack) {
      return false;
    }
    const governanceKind = getWorkspaceStarterSourceGovernanceKind(template);
    if (
      viewState.sourceGovernanceKind !== "all" &&
      governanceKind !== viewState.sourceGovernanceKind
    ) {
      return false;
    }
    if (
      viewState.needsFollowUp &&
      (governanceKind === "unknown" ||
        !WORKSPACE_STARTER_SOURCE_GOVERNANCE_FOLLOW_UP_KINDS.has(governanceKind))
    ) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      template.name,
      template.description,
      template.workflow_focus,
      template.default_workflow_name,
      template.recommended_next_step,
      template.tags.join(" ")
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}

export function resolveWorkspaceStarterLibraryViewState(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
  templates: WorkspaceStarterTemplateItem[]
): WorkspaceStarterLibraryViewState {
  const viewState = readWorkspaceStarterLibraryViewState(searchParams);
  const filteredTemplates = filterWorkspaceStarterTemplates(templates, viewState);
  const hasSelectedTemplate = viewState.selectedTemplateId
    ? filteredTemplates.some((template) => template.id === viewState.selectedTemplateId)
    : false;

  return {
    ...viewState,
    selectedTemplateId: hasSelectedTemplate
      ? viewState.selectedTemplateId
      : filteredTemplates[0]?.id ?? null
  };
}

export function buildFormState(
  template: WorkspaceStarterTemplateItem
): WorkspaceStarterFormState {
  return {
    name: template.name,
    description: template.description,
    businessTrack: template.business_track,
    defaultWorkflowName: template.default_workflow_name,
    workflowFocus: template.workflow_focus,
    recommendedNextStep: template.recommended_next_step,
    tagsText: template.tags.join(", ")
  };
}

export function buildUpdatePayload(formState: WorkspaceStarterFormState) {
  return {
    name: formState.name.trim(),
    description: formState.description.trim(),
    business_track: formState.businessTrack,
    default_workflow_name: formState.defaultWorkflowName.trim(),
    workflow_focus: formState.workflowFocus.trim(),
    recommended_next_step: formState.recommendedNextStep.trim(),
    tags: formState.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  };
}

export function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function buildWorkspaceStarterSourceGovernancePresenter(
  template: Pick<WorkspaceStarterTemplateItem, "created_from_workflow_id" | "source_governance">
): WorkspaceStarterSourceGovernancePresenter {
  const governance = template.source_governance;
  if (!governance) {
    return {
      kind: template.created_from_workflow_id ? "unknown" : "no_source",
      statusLabel: template.created_from_workflow_id
        ? WORKSPACE_STARTER_SOURCE_GOVERNANCE_KIND_LABELS.unknown
        : WORKSPACE_STARTER_SOURCE_GOVERNANCE_KIND_LABELS.no_source,
      actionStatusLabel: null,
      summary: template.created_from_workflow_id
        ? "当前 starter 已绑定来源 workflow，但列表缺少统一来源治理摘要。"
        : "这个 starter 没有绑定来源 workflow，当前只保留模板快照。",
      followUp: null,
      sourceVersion: null,
      factChips: [],
      needsAttention: Boolean(template.created_from_workflow_id)
    };
  }

  const governanceStatusLabel =
    normalizeString(governance.status_label) ??
    WORKSPACE_STARTER_SOURCE_GOVERNANCE_KIND_LABELS[governance.kind];
  const actionStatusLabel = normalizeString(governance.action_decision?.status_label);

  return {
    kind: governance.kind,
    statusLabel: governanceStatusLabel,
    actionStatusLabel:
      actionStatusLabel && actionStatusLabel !== governanceStatusLabel ? actionStatusLabel : null,
    summary:
      normalizeString(governance.outcome_explanation?.primary_signal) ??
      normalizeString(governance.summary) ??
      "暂无来源治理状态。",
    followUp: normalizeString(governance.outcome_explanation?.follow_up),
    sourceVersion: normalizeString(governance.source_version),
    factChips: Array.from(new Set(normalizeStringArray(governance.action_decision?.fact_chips))).slice(
      0,
      2
    ),
    needsAttention: governance.kind === "drifted" || governance.kind === "missing_source"
  };
}

export function resolveWorkspaceStarterCreateWorkflowActionLabel({
  governanceKind,
  createWorkflowHref,
  archived
}: {
  governanceKind: WorkspaceStarterSourceGovernancePresenter["kind"] | null;
  createWorkflowHref?: string | null;
  archived: boolean;
}) {
  if (!createWorkflowHref || archived) {
    return null;
  }

  if (governanceKind === "missing_source") {
    return "确认模板后带此 starter 回到创建页";
  }

  if (governanceKind === "no_source" || governanceKind === "synced") {
    return "带此 starter 回到创建页";
  }

  return null;
}

export function buildWorkspaceStarterSourceGovernanceRecommendedNextStep({
  template,
  sourceGovernance,
  actionDecision,
  createWorkflowHref
}: {
  template: Pick<
    WorkspaceStarterTemplateItem,
    "archived" | "created_from_workflow_id" | "source_governance"
  >;
  sourceGovernance?: WorkspaceStarterSourceGovernance | null;
  actionDecision: WorkspaceStarterSourceActionDecision;
  createWorkflowHref?: string | null;
}): WorkspaceStarterGovernanceRecommendedNextStep | null {
  const governanceKind = getWorkspaceStarterSourceGovernanceKind(template);
  const createWorkflowActionLabel = resolveWorkspaceStarterCreateWorkflowActionLabel({
    governanceKind,
    createWorkflowHref,
    archived: template.archived
  });
  const outcomeFollowUp = normalizeString(sourceGovernance?.outcome_explanation?.follow_up);
  const governanceSummary = normalizeString(sourceGovernance?.summary);

  if (createWorkflowActionLabel) {
    return {
      action: "create_workflow",
      label: createWorkflowActionLabel,
      detail:
        outcomeFollowUp ??
        (sourceGovernance?.kind === "missing_source"
          ? "优先确认来源 workflow 是否仍可访问；如需继续推进，带此 starter 回到创建页重新建立治理链路。"
          : "带此 starter 回到创建页继续创建 workflow，并保留当前模板上下文。"),
      focusTemplateId: null,
      focusLabel: null
    };
  }

  if (!template.created_from_workflow_id) {
    return null;
  }

  if (actionDecision.recommendedAction === "refresh") {
    return {
      action: "refresh",
      label: actionDecision.statusLabel,
      detail:
        actionDecision.summary ||
        outcomeFollowUp ||
        governanceSummary ||
        "优先 refresh 同步最新来源事实，再复核 source diff / metadata 是否已经收口。",
      focusTemplateId: null,
      focusLabel: null
    };
  }

  if (actionDecision.recommendedAction === "rebase") {
    return {
      action: "rebase",
      label: actionDecision.statusLabel,
      detail:
        actionDecision.summary ||
        outcomeFollowUp ||
        governanceSummary ||
        "优先执行 rebase，让 starter 命名和来源 workflow 的 source-derived 字段保持一致。",
      focusTemplateId: null,
      focusLabel: null
    };
  }

  return null;
}

export function buildWorkspaceStarterSourceGovernanceSurface({
  template,
  createWorkflowHref,
  fallbackActionDecision = null
}: {
  template: Pick<
    WorkspaceStarterTemplateItem,
    "archived" | "created_from_workflow_id" | "source_governance"
  >;
  createWorkflowHref?: string | null;
  fallbackActionDecision?: WorkspaceStarterSourceActionDecision | null;
}): WorkspaceStarterSourceGovernanceSurface {
  const presenter = buildWorkspaceStarterSourceGovernancePresenter(template);
  const actionDecision =
    normalizeSourceActionDecision(template.source_governance?.action_decision) ??
    fallbackActionDecision ?? {
      recommendedAction: "none",
      statusLabel: presenter.actionStatusLabel ?? presenter.statusLabel,
      summary: presenter.followUp ?? presenter.summary,
      canRefresh: false,
      canRebase: false,
      factChips: presenter.factChips
    };

  return {
    presenter,
    actionDecision,
    recommendedNextStep: buildWorkspaceStarterSourceGovernanceRecommendedNextStep({
      template,
      sourceGovernance: template.source_governance,
      actionDecision,
      createWorkflowHref
    })
  };
}

export function buildWorkspaceStarterSourceGovernanceFocusTargets(
  sourceGovernanceScope: WorkspaceStarterSourceGovernanceScopeSummaryPayload | null,
  templates: WorkspaceStarterTemplateItem[]
): WorkspaceStarterSourceGovernanceFocusTarget[] {
  if (!sourceGovernanceScope || sourceGovernanceScope.follow_up_template_ids.length === 0) {
    return [];
  }

  const templatesById = new Map(templates.map((template) => [template.id, template] as const));

  return Array.from(
    new Set(
      sourceGovernanceScope.follow_up_template_ids
        .map((templateId) => templateId.trim())
        .filter(Boolean)
    )
  ).flatMap((templateId) => {
    const template = templatesById.get(templateId);
    if (!template) {
      return [];
    }

    const governance = buildWorkspaceStarterSourceGovernancePresenter(template);
    return [
      {
        templateId,
        name: template.name,
        sourceWorkflowVersion: governance.sourceVersion,
        statusLabel: governance.actionStatusLabel ?? governance.statusLabel,
        archived: template.archived
      }
    ];
  });
}

export function buildWorkspaceStarterSourceGovernancePrimaryFollowUp({
  sourceGovernanceScope,
  templates,
  createWorkflowHref
}: {
  sourceGovernanceScope: WorkspaceStarterSourceGovernanceScopeSummaryPayload | null;
  templates: WorkspaceStarterTemplateItem[];
  createWorkflowHref?: string | null;
}): WorkspaceStarterSourceGovernancePrimaryFollowUp | null {
  if (!sourceGovernanceScope) {
    return null;
  }

  const prioritizedTemplateIds = Array.from(
    new Set(
      (sourceGovernanceScope.follow_up_template_ids ?? [])
        .map((templateId) => templateId.trim())
        .filter(Boolean)
    )
  );
  const templatesById = new Map(templates.map((template) => [template.id, template] as const));
  const prioritizedTemplates = prioritizedTemplateIds.flatMap((templateId) => {
    const template = templatesById.get(templateId);
    return template ? [template] : [];
  });
  const primaryTemplate = prioritizedTemplates[0] ?? null;

  if (!primaryTemplate) {
    if (prioritizedTemplateIds.length > 0 || sourceGovernanceScope.attention_count > 0) {
      return {
        label: "待重新定位",
        headline: "当前筛选范围仍有共享来源治理待处理项。",
        detail:
          "后端 follow-up queue 指向的 starter 当前不在列表里；先重新加载或调整筛选范围，再决定 refresh / rebase / create workflow。",
        focusTemplateId: null,
        focusLabel: null
      };
    }

    return {
      label: "无需治理",
      headline: "当前筛选范围没有共享来源治理 backlog。",
      detail:
        "可以继续复用这些 starter；如需进一步治理，再看 bulk preview 或逐个进入右侧 source diff / metadata 详情。",
      focusTemplateId: null,
      focusLabel: null
    };
  }

  const { presenter, recommendedNextStep } = buildWorkspaceStarterSourceGovernanceSurface({
    template: primaryTemplate,
    createWorkflowHref
  });
  const focusTemplateName = normalizeString(primaryTemplate.name) ?? primaryTemplate.id;
  const queueLeadDetail =
    prioritizedTemplates.length > 1
      ? `后端 follow-up queue 已把 ${focusTemplateName} 排在当前范围的首位，后面还有 ${prioritizedTemplates.length - 1} 个待处理 starter。`
      : `后端 follow-up queue 已把 ${focusTemplateName} 排在当前范围的首位。`;
  const detailParts: string[] = [];

  for (const fragment of [queueLeadDetail, recommendedNextStep?.detail, presenter.followUp, presenter.summary]) {
    if (fragment && !detailParts.includes(fragment)) {
      detailParts.push(fragment);
    }
  }

  return {
    label: recommendedNextStep?.label ?? presenter.actionStatusLabel ?? presenter.statusLabel,
    headline: `${focusTemplateName} 当前是共享来源治理队列的首个待处理 starter。`,
    detail: detailParts.join(" "),
    focusTemplateId: primaryTemplate.id,
    focusLabel: focusTemplateName ? `优先聚焦 starter：${focusTemplateName}` : null
  };
}

export function buildWorkspaceStarterSourceGovernanceScopeSummary(
  templates: WorkspaceStarterTemplateItem[]
): WorkspaceStarterSourceGovernanceScopeSummary | null {
  if (templates.length === 0) {
    return null;
  }

  const counts = {
    drifted: 0,
    missing_source: 0,
    no_source: 0,
    synced: 0,
    unknown: 0
  } satisfies Record<WorkspaceStarterSourceGovernancePresenter["kind"], number>;

  for (const template of templates) {
    counts[buildWorkspaceStarterSourceGovernancePresenter(template).kind] += 1;
  }

  const chips = [
    counts.drifted > 0 ? `来源漂移 ${counts.drifted}` : null,
    counts.missing_source > 0 ? `来源缺失 ${counts.missing_source}` : null,
    counts.no_source > 0 ? `无来源 ${counts.no_source}` : null,
    counts.synced > 0 ? `已对齐 ${counts.synced}` : null,
    counts.unknown > 0 ? `治理缺口 ${counts.unknown}` : null
  ].filter((item): item is string => Boolean(item));

  const summaryParts = [
    `当前筛选范围 ${templates.length} 个 starter 中`,
    counts.drifted > 0 ? `来源漂移 ${counts.drifted} 个` : null,
    counts.missing_source > 0 ? `来源缺失 ${counts.missing_source} 个` : null,
    counts.no_source > 0 ? `无来源 ${counts.no_source} 个` : null,
    counts.synced > 0 ? `已对齐 ${counts.synced} 个` : null,
    counts.unknown > 0 ? `还有 ${counts.unknown} 个缺少统一治理摘要` : null
  ].filter((item): item is string => Boolean(item));

  const attentionCount = counts.drifted + counts.missing_source + counts.unknown;
  const summary =
    `${summaryParts.join("，")}；` +
    (attentionCount > 0
      ? "无需打开详情卡也能先识别需要 follow-up 的 starter。"
      : "当前没有明显的来源治理阻塞，可以直接参考 bulk preview 决策。");

  return {
    chips,
    summary,
    attentionCount
  };
}

export function buildWorkspaceStarterBulkResultNarrative(
  result: WorkspaceStarterBulkActionResult
): WorkspaceStarterNarrativeItem[] {
  const deletedCount = result.deleted_items.length;
  const receiptSummaryParts = [
    `本次批量${getWorkspaceStarterBulkActionLabel(result.action)}请求 ${result.requested_count} 个 starter。`,
    result.updated_count > 0
      ? `实际处理 ${result.updated_count} 个${deletedCount > 0 ? `（其中删除 ${deletedCount} 个）` : ""}。`
      : `当前没有 starter 被${getWorkspaceStarterBulkActionLabel(result.action)}。`,
    result.skipped_count > 0
      ? `跳过 ${result.skipped_count} 个（${result.skipped_reason_summary
          .map((item) => `${getWorkspaceStarterBulkSkipReasonLabel(item.reason)} ${item.count}`)
          .join(" / ")}）。`
      : null
  ].filter((item): item is string => Boolean(item));

  const sandboxSummary = normalizeSourceDiffSummary(result.sandbox_dependency_changes);
  const sandboxNodeCount = countSummaryChanges(sandboxSummary);
  const items: WorkspaceStarterNarrativeItem[] = [
    {
      label: "Result receipt",
      text: receiptSummaryParts.join(" ")
    }
  ];

  if (!sandboxSummary || sandboxNodeCount <= 0) {
    return items;
  }

  const templateFacts = (result.sandbox_dependency_items ?? [])
    .map((item) => {
      const templateName = item.name?.trim() || item.template_id;
      const nodeText = item.sandbox_dependency_nodes.length
        ? item.sandbox_dependency_nodes.join("、")
        : "未命名节点";
      return `${templateName}（${nodeText}）`;
    })
    .join("；");

  items.push({
    label: "Sandbox drift",
    text:
      `本次批量${getWorkspaceStarterBulkActionLabel(result.action)}涉及 ${
        result.sandbox_dependency_items.length
      } 个 starter、${sandboxNodeCount} 个 sandbox 依赖漂移节点；` + summarizeSourceDiffCounts(sandboxSummary)
  });

  if (templateFacts) {
    items.push({
      label: "Affected starters",
      text: templateFacts
    });
  }

  return items;
}

function buildWorkspaceStarterBulkReceiptRecommendedDetail(
  action: WorkspaceStarterBulkAction,
  item: WorkspaceStarterBulkReceiptItem
) {
  if (
    item.reason === "no_source_workflow" ||
    item.reason === "source_workflow_missing" ||
    item.reason === "source_workflow_invalid"
  ) {
    return `当前 starter 缺少可用来源绑定；先补来源 workflow 或确认来源仍可访问，再重新执行批量${getWorkspaceStarterBulkActionLabel(action)}。`;
  }

  if (item.reason === "name_drift_only") {
    return "当前 starter 只有名称漂移；优先聚焦详情确认后执行 rebase，让命名与来源 workflow 保持一致。";
  }

  if (item.outcome === "updated" && action === "refresh") {
    return "优先聚焦该 starter，复核 refresh 后的 source diff / metadata，确认来源事实已收口。";
  }

  if (item.outcome === "updated" && action === "rebase") {
    return "优先聚焦该 starter，复核 rebase 后的 source diff / metadata，确认命名与来源字段已对齐。";
  }

  return normalizeString(item.detail);
}

function resolveWorkspaceStarterBulkResultNextStepLabel(
  action: WorkspaceStarterBulkAction,
  item: WorkspaceStarterBulkReceiptItem
) {
  if (
    item.reason === "no_source_workflow" ||
    item.reason === "source_workflow_missing" ||
    item.reason === "source_workflow_invalid"
  ) {
    return "修复来源绑定";
  }

  if (item.reason === "name_drift_only") {
    return "建议 rebase";
  }

  if (item.outcome === "updated" && action === "refresh") {
    return "复核刷新结果";
  }

  if (item.outcome === "updated" && action === "rebase") {
    return "复核 rebase 结果";
  }

  if (item.outcome === "skipped") {
    return "查看跳过原因";
  }

  return "查看 result receipt";
}

export function buildWorkspaceStarterBulkResultRecommendedNextStep(
  result: Pick<
    WorkspaceStarterBulkActionResult,
    "action" | "receipt_items" | "follow_up_template_ids" | "outcome_explanation"
  >
): WorkspaceStarterGovernanceRecommendedNextStep | null {
  const prioritizedTemplateIds = Array.from(
    new Set((result.follow_up_template_ids ?? []).map((templateId) => templateId.trim()).filter(Boolean))
  );
  const orderLookup = new Map(
    prioritizedTemplateIds.map((templateId, index) => [templateId, index] as const)
  );
  const primaryReceiptItem = [...(result.receipt_items ?? [])]
    .filter((item) => item.outcome !== "deleted")
    .sort((left, right) => {
      const leftOrder = orderLookup.get(left.template_id) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderLookup.get(right.template_id) ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return 0;
    })[0];
  const outcomeFollowUp = normalizeString(result.outcome_explanation?.follow_up);

  if (!primaryReceiptItem) {
    return outcomeFollowUp
      ? {
          action: "review_result_receipt",
          label: "查看 result receipt",
          detail: outcomeFollowUp,
          focusTemplateId: null,
          focusLabel: null
        }
      : null;
  }

  const actionDecision = normalizeSourceActionDecision(primaryReceiptItem.action_decision);
  const focusTemplateName = normalizeString(primaryReceiptItem.name) ?? primaryReceiptItem.template_id;

  return {
    action:
      actionDecision?.recommendedAction === "refresh"
        ? "refresh"
        : actionDecision?.recommendedAction === "rebase"
        ? "rebase"
        : "review_result_receipt",
    label:
      actionDecision?.statusLabel ??
      resolveWorkspaceStarterBulkResultNextStepLabel(result.action, primaryReceiptItem),
    detail:
      actionDecision?.summary ??
      buildWorkspaceStarterBulkReceiptRecommendedDetail(result.action, primaryReceiptItem) ??
      outcomeFollowUp ??
      "优先聚焦本轮 result receipt 里最先需要处理的 starter，再决定后续治理动作。",
    focusTemplateId: primaryReceiptItem.template_id,
    focusLabel: focusTemplateName ? `优先聚焦 starter：${focusTemplateName}` : null
  };
}

export function buildWorkspaceStarterBulkResultSurface(
  result: WorkspaceStarterBulkActionResult
): WorkspaceStarterBulkResultSurface {
  const recommendedNextStep = buildWorkspaceStarterBulkResultRecommendedNextStep(result);
  const primarySignal =
    normalizeString(result.outcome_explanation?.primary_signal) ??
    buildWorkspaceStarterBulkResultNarrative(result)[0]?.text ??
    null;
  const followUpExplanation = normalizeString(result.outcome_explanation?.follow_up);

  return {
    primarySignal,
    followUpExplanation,
    recommendedNextStep,
    shouldRenderStandaloneFollowUpExplanation:
      Boolean(followUpExplanation) && followUpExplanation !== recommendedNextStep?.detail
  };
}

function getWorkspaceStarterBulkResultOutcomeLabel(
  action: WorkspaceStarterBulkAction,
  item: WorkspaceStarterBulkReceiptItem
) {
  if (item.outcome === "deleted") {
    return "已删除";
  }
  if (item.outcome === "skipped") {
    return item.reason ? getWorkspaceStarterBulkSkipReasonLabel(item.reason) : "已跳过";
  }

  if (action === "archive") {
    return "已归档";
  }
  if (action === "restore") {
    return "已恢复";
  }
  if (action === "refresh") {
    return item.changed === false ? "已对齐" : "已刷新";
  }
  if (action === "rebase") {
    return item.changed === false ? "已对齐" : "已 rebase";
  }
  return "已处理";
}

export function buildWorkspaceStarterBulkResultFocusTargets(
  result: Pick<
    WorkspaceStarterBulkActionResult,
    "action" | "receipt_items" | "follow_up_template_ids"
  >,
  templates: WorkspaceStarterTemplateItem[]
): WorkspaceStarterBulkResultFocusTarget[] {
  const templatesById = new Map(templates.map((template) => [template.id, template] as const));
  const seenTemplateIds = new Set<string>();
  const prioritizedTemplateIds = Array.from(
    new Set((result.follow_up_template_ids ?? []).map((templateId) => templateId.trim()).filter(Boolean))
  );
  const orderLookup = new Map(
    prioritizedTemplateIds.map((templateId, index) => [templateId, index] as const)
  );

  const orderedReceiptItems = [...(result.receipt_items ?? [])].sort((left, right) => {
    const leftOrder = orderLookup.get(left.template_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderLookup.get(right.template_id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return 0;
  });

  return orderedReceiptItems.flatMap((item) => {
    if (item.outcome === "deleted" || seenTemplateIds.has(item.template_id)) {
      return [];
    }

    const template = templatesById.get(item.template_id);
    if (!template) {
      return [];
    }

    seenTemplateIds.add(item.template_id);
    const sandboxNodes = Array.from(new Set(normalizeStringArray(item.sandbox_dependency_nodes)));
    const driftNodeCount = countSummaryChanges(
      normalizeSourceDiffSummary(item.sandbox_dependency_changes)
    );
    const outcomeLabel = getWorkspaceStarterBulkResultOutcomeLabel(result.action, item);
    const decisionLabel = normalizeString(item.action_decision?.status_label);
    const statusLabel =
      item.outcome === "updated" && decisionLabel ? `${outcomeLabel} · ${decisionLabel}` : outcomeLabel;

    return [
      {
        templateId: item.template_id,
        name: item.name?.trim() || template.name,
        sourceWorkflowVersion: normalizeString(item.source_workflow_version),
        statusLabel,
        detail: normalizeString(item.detail),
        sandboxNodeSummary: sandboxNodes.length > 0 ? sandboxNodes.join("、") : null,
        driftNodeCount,
        archived: item.archived ?? template.archived
      }
    ];
  });
}

export function buildWorkspaceStarterBulkPreviewNarrative(
  preview: WorkspaceStarterBulkPreview | null
): WorkspaceStarterNarrativeItem[] {
  if (!preview) {
    return [];
  }

  return (["archive", "restore", "refresh", "rebase", "delete"] as const)
    .map((action) => {
      const actionPreview = preview.previews[action];
      if (actionPreview.candidate_count === 0 && actionPreview.blocked_count === 0) {
        return null;
      }

      const blockedSummary = actionPreview.blocked_reason_summary.length
        ? `（${actionPreview.blocked_reason_summary
            .map(
              (item) =>
                `${getWorkspaceStarterBulkPreviewReasonLabel(item.reason)} ${item.count}`
            )
            .join(" / ")}）`
        : "";

      return {
        label: `${getWorkspaceStarterBulkActionLabel(action)} preview`,
        text:
          `候选 ${actionPreview.candidate_count} 个；` +
          (actionPreview.blocked_count > 0
            ? `阻塞 ${actionPreview.blocked_count} 个${blockedSummary}`
            : "当前无阻塞项")
      } satisfies WorkspaceStarterNarrativeItem;
    })
    .filter((item): item is WorkspaceStarterNarrativeItem => item !== null);
}

export function buildWorkspaceStarterBulkPreviewFocusTargets(
  preview: WorkspaceStarterBulkPreview | null,
  templates: WorkspaceStarterTemplateItem[]
): WorkspaceStarterBulkPreviewFocusTarget[] {
  if (!preview) {
    return [];
  }

  const templatesById = new Map(templates.map((template) => [template.id, template] as const));
  const seenTemplateIds = new Set<string>();
  const focusTargets: WorkspaceStarterBulkPreviewFocusTarget[] = [];

  for (const action of ["refresh", "rebase"] as const) {
    const actionPreview = preview.previews[action];
    const items = [
      ...actionPreview.candidate_items,
      ...actionPreview.blocked_items
    ] satisfies Array<
      WorkspaceStarterBulkPreviewCandidateItem | WorkspaceStarterBulkPreviewBlockedItem
    >;

    for (const item of items) {
      if (seenTemplateIds.has(item.template_id)) {
        continue;
      }

      const template = templatesById.get(item.template_id);
      if (!template) {
        continue;
      }

      seenTemplateIds.add(item.template_id);
      focusTargets.push({
        templateId: item.template_id,
        name: item.name?.trim() || template.name,
        sourceWorkflowVersion: normalizeString(item.source_workflow_version),
        statusLabel:
          item.action_decision?.status_label?.trim() ||
          ("reason" in item
            ? getWorkspaceStarterBulkPreviewReasonLabel(String(item.reason))
            : getWorkspaceStarterBulkActionLabel(action)),
        archived: template.archived
      });
    }
  }

  return focusTargets;
}

export function buildWorkspaceStarterBulkAffectedStarterTargets(
  result: Pick<WorkspaceStarterBulkActionResult, "sandbox_dependency_items">,
  templates: WorkspaceStarterTemplateItem[]
): WorkspaceStarterBulkAffectedStarterTarget[] {
  const templatesById = new Map(templates.map((template) => [template.id, template] as const));
  const seenTemplateIds = new Set<string>();

  return (result.sandbox_dependency_items ?? []).flatMap((item) => {
    if (seenTemplateIds.has(item.template_id)) {
      return [];
    }
    seenTemplateIds.add(item.template_id);

    const template = templatesById.get(item.template_id);
    if (!template) {
      return [];
    }

    const sandboxNodes = Array.from(new Set(normalizeStringArray(item.sandbox_dependency_nodes)));
    return [
      {
        templateId: item.template_id,
        name: item.name?.trim() || template.name,
        sourceWorkflowVersion: normalizeString(item.source_workflow_version),
        sandboxNodeSummary: sandboxNodes.length > 0 ? sandboxNodes.join("、") : "未命名节点",
        driftNodeCount: countSummaryChanges(item.sandbox_dependency_changes),
        archived: template.archived
      }
    ];
  });
}

export function buildWorkspaceStarterSourceActionDecision(
  sourceDiff: WorkspaceStarterSourceDiff | null
): WorkspaceStarterSourceActionDecision {
  const actionDecision = normalizeSourceActionDecision(sourceDiff?.action_decision);
  if (!sourceDiff || !actionDecision) {
    return {
      recommendedAction: "none",
      statusLabel: sourceDiff ? "缺少决策" : "缺少 diff",
      summary: sourceDiff
        ? "当前 source diff 尚未返回共享动作决策，请先刷新后端契约。"
        : "当前没有可用于判断 refresh / rebase 的来源 diff。",
      canRefresh: false,
      canRebase: false,
      factChips: []
    };
  }

  return {
    recommendedAction: actionDecision.recommendedAction,
    statusLabel: actionDecision.statusLabel,
    summary: actionDecision.summary,
    canRefresh: actionDecision.canRefresh,
    canRebase: actionDecision.canRebase,
    factChips: actionDecision.factChips
  };
}

export function buildWorkspaceStarterSourceDiffSurface(
  sourceDiff: WorkspaceStarterSourceDiff | null
): WorkspaceStarterSourceDiffSurface | null {
  if (!sourceDiff) {
    return null;
  }

  const actionDecision = buildWorkspaceStarterSourceActionDecision(sourceDiff);
  const rebaseFieldChips =
    sourceDiff.rebase_fields.length > 0 ? sourceDiff.rebase_fields : ["no rebase needed"];

  return {
    summaryCards: [
      {
        label: "Node changes",
        value: String(countSummaryChanges(sourceDiff.node_summary))
      },
      {
        label: "Edge changes",
        value: String(countSummaryChanges(sourceDiff.edge_summary))
      },
      {
        label: "Workflow name",
        value: sourceDiff.workflow_name_changed ? "Drifted" : "Synced"
      },
      {
        label: "Sandbox drift",
        value: String(countSummaryChanges(sourceDiff.sandbox_dependency_summary))
      },
      {
        label: "Rebase fields",
        value: String(sourceDiff.rebase_fields.length)
      }
    ],
    rebaseCard: {
      title: "Suggested rebase fields",
      meta: sourceDiff.changed
        ? "当源 workflow 已发生演进时，rebase 会同步这些 source-derived 字段。"
        : "当前 template snapshot 已与 source workflow 对齐。",
      statusLabel: actionDecision.statusLabel,
      summary: actionDecision.summary,
      chips: Array.from(new Set([...rebaseFieldChips, ...actionDecision.factChips])),
      canRebase: actionDecision.canRebase
    },
    sections: [
      buildWorkspaceStarterSourceDiffSectionSurface({
        key: "node-diff",
        title: "Node diff",
        summary: sourceDiff.node_summary,
        entries: sourceDiff.node_entries
      }),
      buildWorkspaceStarterSourceDiffSectionSurface({
        key: "edge-diff",
        title: "Edge diff",
        summary: sourceDiff.edge_summary,
        entries: sourceDiff.edge_entries
      }),
      buildWorkspaceStarterSourceDiffSectionSurface({
        key: "sandbox-diff",
        title: "Sandbox dependency drift",
        summary: sourceDiff.sandbox_dependency_summary,
        entries: sourceDiff.sandbox_dependency_entries
      })
    ]
  };
}

export function buildWorkspaceStarterHistoryMetaChips(
  item: WorkspaceStarterHistoryItem
) {
  const payload = normalizePayload(item.payload);
  if (!payload) {
    return [];
  }

  const chips: string[] = [];
  if (payload.bulk === true) {
    chips.push("批量");
  }

  const previousVersion = normalizeString(payload.previous_workflow_version);
  const sourceVersion = normalizeString(payload.source_workflow_version);
  const actionDecision = normalizeSourceActionDecision(payload.action_decision);
  if (previousVersion) {
    chips.push(`prev ${previousVersion}`);
  }
  if (sourceVersion) {
    chips.push(`source ${sourceVersion}`);
  }
  if (actionDecision && actionDecision.recommendedAction !== "none") {
    chips.push(`建议 ${actionDecision.recommendedAction}`);
  }

  if (typeof payload.changed === "boolean") {
    chips.push(payload.changed ? "已应用变更" : "已对齐");
  }

  const rebaseFields = normalizeStringArray(payload.rebase_fields);
  if (rebaseFields.length > 0) {
    chips.push(`rebase ${rebaseFields.length}`);
  }

  const sandboxSummary = normalizeSourceDiffSummary(payload.sandbox_dependency_changes);
  const sandboxNodeCount = countSummaryChanges(sandboxSummary);
  if (sandboxNodeCount > 0) {
    chips.push(`sandbox drift ${sandboxNodeCount}`);
  }

  return chips;
}

export function buildWorkspaceStarterHistoryNarrative(
  item: WorkspaceStarterHistoryItem
): WorkspaceStarterNarrativeItem[] {
  const payload = normalizePayload(item.payload);
  if (!payload) {
    return [];
  }

  const items: WorkspaceStarterNarrativeItem[] = [];
  const sourceWorkflowId = normalizeString(payload.source_workflow_id);
  const previousVersion = normalizeString(payload.previous_workflow_version);
  const sourceVersion = normalizeString(payload.source_workflow_version);
  const sandboxSummary = normalizeSourceDiffSummary(payload.sandbox_dependency_changes);
  const sandboxNodes = normalizeStringArray(payload.sandbox_dependency_nodes);
  const rebaseFields = normalizeStringArray(payload.rebase_fields);
  const nodeChanges = normalizeSourceDiffSummary(payload.node_changes);
  const edgeChanges = normalizeSourceDiffSummary(payload.edge_changes);
  const actionDecision = normalizeSourceActionDecision(payload.action_decision);

  if (sourceWorkflowId || previousVersion || sourceVersion) {
    const sourceParts = [];
    if (sourceWorkflowId) {
      sourceParts.push(`来源 workflow：${sourceWorkflowId}`);
    }
    if (previousVersion && sourceVersion) {
      sourceParts.push(`版本从 ${previousVersion} 对齐到 ${sourceVersion}`);
    } else if (sourceVersion) {
      sourceParts.push(`来源版本：${sourceVersion}`);
    }
    items.push({
      label: "Source",
      text: sourceParts.join("；")
    });
  }

  if (typeof payload.changed === "boolean") {
    items.push({
      label: "Result",
      text: payload.changed
        ? "本次治理已把模板快照应用到最新来源事实。"
        : "本次只完成对齐检查，模板快照已是最新状态。"
    });
  }

  if (actionDecision && actionDecision.recommendedAction !== "none") {
    items.push({
      label: "Decision",
      text: `${actionDecision.statusLabel}；${actionDecision.summary}`
    });
  }

  if (sandboxSummary && countSummaryChanges(sandboxSummary) > 0) {
    items.push({
      label: "Sandbox drift",
      text:
        `sandbox 依赖治理发生漂移；${summarizeSourceDiffCounts(sandboxSummary)}` +
        (sandboxNodes.length > 0 ? `；涉及节点：${sandboxNodes.join("、")}` : "")
    });
  }

  const structureFacts = [
    nodeChanges && countSummaryChanges(nodeChanges) > 0
      ? `节点变化：${summarizeSourceDiffCounts(nodeChanges)}`
      : null,
    edgeChanges && countSummaryChanges(edgeChanges) > 0
      ? `连线变化：${summarizeSourceDiffCounts(edgeChanges)}`
      : null
  ].filter(Boolean);
  if (structureFacts.length > 0) {
    items.push({
      label: "Structure drift",
      text: structureFacts.join("；")
    });
  }

  if (rebaseFields.length > 0) {
    items.push({
      label: "Rebase fields",
      text: rebaseFields.join("、")
    });
  }

  return items;
}

export function buildWorkspaceStarterHistoryPayloadSnapshot(
  item: WorkspaceStarterHistoryItem
): WorkspaceStarterNarrativeItem[] {
  const payload = normalizePayload(item.payload);
  if (!payload) {
    return [];
  }

  const items: WorkspaceStarterNarrativeItem[] = [];

  if (payload.bulk === true) {
    items.push({
      label: "Scope flag",
      text: "这条记录来自批量治理回执。"
    });
  }

  if (typeof payload.changed === "boolean") {
    items.push({
      label: "Change flag",
      text: payload.changed ? "payload 标记本轮已应用来源变更。" : "payload 标记本轮仅完成对齐检查。"
    });
  }

  const nodeSummary = normalizeSourceDiffSummary(payload.node_changes);
  if (nodeSummary && countSummaryChanges(nodeSummary) > 0) {
    items.push({
      label: "Node summary",
      text: summarizeSourceDiffCounts(nodeSummary)
    });
  }

  const edgeSummary = normalizeSourceDiffSummary(payload.edge_changes);
  if (edgeSummary && countSummaryChanges(edgeSummary) > 0) {
    items.push({
      label: "Edge summary",
      text: summarizeSourceDiffCounts(edgeSummary)
    });
  }

  const sandboxSummary = normalizeSourceDiffSummary(payload.sandbox_dependency_changes);
  const sandboxNodes = normalizeStringArray(payload.sandbox_dependency_nodes);
  if (sandboxSummary && countSummaryChanges(sandboxSummary) > 0) {
    items.push({
      label: "Sandbox summary",
      text:
        summarizeSourceDiffCounts(sandboxSummary) +
        (sandboxNodes.length > 0 ? `；涉及节点：${sandboxNodes.join("、")}` : "")
    });
  }

  const rebaseFields = normalizeStringArray(payload.rebase_fields);
  if (rebaseFields.length > 0) {
    items.push({
      label: "Rebase payload",
      text: rebaseFields.join("、")
    });
  }

  return items;
}

export function summarizeValidationIssues(
  issues: WorkspaceStarterValidationIssue[]
) {
  if (issues.length === 0) {
    return null;
  }

  const categoryLabels: Record<string, string> = {
    schema: "结构",
    node_support: "节点支持",
    tool_reference: "工具引用",
    tool_execution: "执行能力",
    publish_version: "发布版本"
  };

  return Object.entries(
    issues.reduce<Record<string, number>>((summary, issue) => {
      const category = issue.category || "unknown";
      summary[category] = (summary[category] ?? 0) + 1;
      return summary;
    }, {})
  )
    .map(([category, count]) => {
      const sample = issues
        .filter((issue) => issue.category === category)
        .slice(0, 2)
        .map((issue) => issue.path ?? issue.field ?? issue.message)
        .join("、");
      const prefix = `${categoryLabels[category] ?? category} ${count} 项`;
      return sample ? `${prefix}（${sample}）` : prefix;
    })
    .join("；");
}

function summarizeSourceDiffCounts(summary: WorkspaceStarterSourceDiffSummary) {
  return `新增 ${summary.added_count} / 移除 ${summary.removed_count} / 变更 ${summary.changed_count}`;
}

function buildWorkspaceStarterSourceDiffSectionSurface({
  key,
  title,
  summary,
  entries
}: {
  key: string;
  title: string;
  summary: WorkspaceStarterSourceDiffSummary;
  entries: WorkspaceStarterSourceDiff["node_entries"];
}): WorkspaceStarterSourceDiffSectionSurface {
  return {
    key,
    title,
    summary: `template ${summary.template_count} / source ${summary.source_count}`,
    changeBadge: `+${summary.added_count} / -${summary.removed_count} / ~${summary.changed_count}`,
    emptyMessage: "当前这一层没有差异。",
    entries: entries.map((entry, index) => {
      const id = normalizeString(entry.id) ?? `entry-${index + 1}`;
      const statusLabel = normalizeString(entry.status) ?? "unknown";

      return {
        key: `${key}-${statusLabel}-${id}`,
        title: normalizeString(entry.label) ?? id,
        meta: id,
        statusLabel,
        changedFields: normalizeStringArray(entry.changed_fields),
        templateFacts: normalizeStringArray(entry.template_facts),
        sourceFacts: normalizeStringArray(entry.source_facts)
      };
    })
  };
}

function countSummaryChanges(summary: WorkspaceStarterSourceDiffSummary | null) {
  if (!summary) {
    return 0;
  }

  return summary.added_count + summary.removed_count + summary.changed_count;
}

function getWorkspaceStarterSourceGovernanceKind(
  template: Pick<WorkspaceStarterTemplateItem, "created_from_workflow_id" | "source_governance">
): WorkspaceStarterSourceGovernanceKind | "unknown" {
  if (template.source_governance) {
    return template.source_governance.kind;
  }

  return template.created_from_workflow_id ? "unknown" : "no_source";
}

function normalizePayload(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function normalizeSourceDiffSummary(value: unknown): WorkspaceStarterSourceDiffSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const templateCount = normalizeNumber(value.template_count);
  const sourceCount = normalizeNumber(value.source_count);
  const addedCount = normalizeNumber(value.added_count);
  const removedCount = normalizeNumber(value.removed_count);
  const changedCount = normalizeNumber(value.changed_count);
  if (
    templateCount === null ||
    sourceCount === null ||
    addedCount === null ||
    removedCount === null ||
    changedCount === null
  ) {
    return null;
  }

  return {
    template_count: templateCount,
    source_count: sourceCount,
    added_count: addedCount,
    removed_count: removedCount,
    changed_count: changedCount
  };
}

function normalizeSourceActionDecision(
  value: unknown
): WorkspaceStarterSourceActionDecision | null {
  if (!isRecord(value)) {
    return null;
  }

  const recommendedAction = normalizeRecommendedAction(value.recommended_action);
  const statusLabel = normalizeString(value.status_label);
  const summary = normalizeString(value.summary);
  if (
    recommendedAction === null ||
    statusLabel === null ||
    summary === null ||
    typeof value.can_refresh !== "boolean" ||
    typeof value.can_rebase !== "boolean"
  ) {
    return null;
  }

  return {
    recommendedAction,
    statusLabel,
    summary,
    canRefresh: value.can_refresh,
    canRebase: value.can_rebase,
    factChips: normalizeStringArray(value.fact_chips)
  };
}

function normalizeRecommendedAction(
  value: unknown
): WorkspaceStarterSourceActionDecision["recommendedAction"] | null {
  if (value === "refresh" || value === "rebase" || value === "none") {
    return value;
  }
  return null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
