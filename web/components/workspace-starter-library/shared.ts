import type { WorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import type {
  WorkspaceStarterBulkAction,
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterHistoryItem,
  WorkspaceStarterSourceDiffSummary,
  WorkspaceStarterTemplateItem,
  WorkspaceStarterValidationIssue
} from "@/lib/get-workspace-starters";

export type TrackFilter = "all" | WorkflowBusinessTrack;
export type ArchiveFilter = "active" | "archived" | "all";

export type WorkspaceStarterFormState = {
  name: string;
  description: string;
  businessTrack: WorkflowBusinessTrack;
  defaultWorkflowName: string;
  workflowFocus: string;
  recommendedNextStep: string;
  tagsText: string;
};

export type WorkspaceStarterMessageTone = "idle" | "success" | "error";

export type WorkspaceStarterNarrativeItem = {
  label: string;
  text: string;
};

export type WorkspaceStarterBulkAffectedStarterTarget = {
  templateId: string;
  name: string;
  sourceWorkflowVersion: string | null;
  sandboxNodeSummary: string;
  driftNodeCount: number;
  archived: boolean;
};

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

export function getWorkspaceStarterBulkActionLabel(action: WorkspaceStarterBulkAction) {
  return {
    archive: "归档",
    restore: "恢复",
    refresh: "刷新",
    rebase: "rebase",
    delete: "删除"
  }[action];
}

export function getWorkspaceStarterBulkActionButtonLabel(action: WorkspaceStarterBulkAction) {
  return {
    archive: "批量归档当前结果",
    restore: "批量恢复当前结果",
    refresh: "批量刷新来源快照",
    rebase: "批量执行 rebase",
    delete: "批量删除已归档"
  }[action];
}

export function getWorkspaceStarterBulkActionConfirmationMessage(
  action: WorkspaceStarterBulkAction,
  count: number
) {
  return {
    archive: `确认批量归档当前筛选结果中的 ${count} 个 starter 吗？`,
    restore: `确认批量恢复当前筛选结果中的 ${count} 个 starter 吗？`,
    refresh: `确认批量刷新当前筛选结果中的 ${count} 个 starter 来源快照吗？`,
    rebase: `确认对当前筛选结果中的 ${count} 个 starter 批量执行 rebase 吗？`,
    delete: `确认永久删除当前筛选结果中的 ${count} 个已归档 starter 吗？此操作不可撤销。`
  }[action];
}

const SKIP_REASON_LABELS = {
  not_found: "不存在",
  already_archived: "已归档",
  not_archived: "未归档",
  no_source_workflow: "无来源",
  source_workflow_missing: "来源缺失",
  source_workflow_invalid: "来源无效",
  delete_requires_archive: "需先归档"
} as const;

export function getWorkspaceStarterBulkSkipReasonLabel(reason: string) {
  return SKIP_REASON_LABELS[reason as keyof typeof SKIP_REASON_LABELS] ?? reason;
}

export function buildBulkActionMessage(
  result: Pick<
    WorkspaceStarterBulkActionResult,
    | "action"
    | "updated_count"
    | "skipped_count"
    | "deleted_items"
    | "skipped_reason_summary"
    | "sandbox_dependency_changes"
    | "sandbox_dependency_items"
  >
) {
  const actionLabel = getWorkspaceStarterBulkActionLabel(result.action as WorkspaceStarterBulkAction);
  const deletedCount = result.deleted_items?.length ?? 0;
  const updatedPart =
    result.updated_count > 0 ? `已${actionLabel} ${result.updated_count} 个模板` : `没有模板被${actionLabel}`;
  const deletedPart = deletedCount > 0 ? `，删除 ${deletedCount} 个模板` : "";
  const skippedPart =
    result.skipped_count > 0
      ? `，跳过 ${result.skipped_count} 个模板${
          result.skipped_reason_summary?.length
            ? `（${result.skipped_reason_summary
                .map((item) => `${getWorkspaceStarterBulkSkipReasonLabel(item.reason)} ${item.count}`)
                .join(" / ")}）`
            : ""
        }`
      : "";
  const sandboxSummary = normalizeSourceDiffSummary(result.sandbox_dependency_changes);
  const sandboxNodeCount = countSummaryChanges(sandboxSummary);
  const sandboxTemplateCount = Array.isArray(result.sandbox_dependency_items)
    ? result.sandbox_dependency_items.length
    : 0;
  const sandboxPart =
    sandboxSummary && sandboxNodeCount > 0
      ? `，涉及 ${sandboxTemplateCount} 个 starter / ${sandboxNodeCount} 个 sandbox 依赖漂移节点`
      : "";

  return `${updatedPart}${deletedPart}${skippedPart}${sandboxPart}。`;
}

export function buildWorkspaceStarterBulkResultNarrative(
  result: WorkspaceStarterBulkActionResult
): WorkspaceStarterNarrativeItem[] {
  const sandboxSummary = normalizeSourceDiffSummary(result.sandbox_dependency_changes);
  const sandboxNodeCount = countSummaryChanges(sandboxSummary);
  if (!sandboxSummary || sandboxNodeCount <= 0) {
    return [];
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

  const items: WorkspaceStarterNarrativeItem[] = [
    {
      label: "Sandbox drift",
      text:
        `本次批量${getWorkspaceStarterBulkActionLabel(result.action)}涉及 ${
          result.sandbox_dependency_items.length
        } 个 starter、${sandboxNodeCount} 个 sandbox 依赖漂移节点；` +
        summarizeSourceDiffCounts(sandboxSummary)
    }
  ];

  if (templateFacts) {
    items.push({
      label: "Affected starters",
      text: templateFacts
    });
  }

  return items;
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
  if (previousVersion) {
    chips.push(`prev ${previousVersion}`);
  }
  if (sourceVersion) {
    chips.push(`source ${sourceVersion}`);
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

function countSummaryChanges(summary: WorkspaceStarterSourceDiffSummary | null) {
  if (!summary) {
    return 0;
  }

  return summary.added_count + summary.removed_count + summary.changed_count;
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
