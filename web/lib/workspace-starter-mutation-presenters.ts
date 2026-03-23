import type {
  WorkspaceStarterBulkAction,
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterSourceDiff,
  WorkspaceStarterSourceDiffSummary
} from "@/lib/get-workspace-starters";

export type WorkspaceStarterMessageTone = "idle" | "success" | "error";

export type WorkspaceStarterTemplateMutationAction =
  | "create"
  | "update"
  | WorkspaceStarterBulkAction;

export type WorkspaceStarterBulkResultSurfaceCopy = {
  recommendedNextStepDescription: string;
  focusDescription: string;
};

const BULK_REASON_LABELS = {
  not_found: "不存在",
  already_archived: "已归档",
  not_archived: "未归档",
  no_source_workflow: "无来源",
  source_workflow_missing: "来源缺失",
  source_workflow_invalid: "来源无效",
  delete_requires_archive: "需先归档",
  already_aligned: "已对齐",
  name_drift_only: "仅名称漂移"
} as const;

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

export function getWorkspaceStarterBulkSkipReasonLabel(reason: string) {
  return BULK_REASON_LABELS[reason as keyof typeof BULK_REASON_LABELS] ?? reason;
}

export function getWorkspaceStarterBulkPreviewReasonLabel(reason: string) {
  return BULK_REASON_LABELS[reason as keyof typeof BULK_REASON_LABELS] ?? reason;
}

export function buildWorkspaceStarterMutationPendingMessage(
  action: WorkspaceStarterTemplateMutationAction
) {
  switch (action) {
    case "create":
      return "正在保存到 workspace starter library...";
    case "update":
      return "正在更新 workspace starter...";
    case "archive":
      return "正在归档 workspace starter...";
    case "restore":
      return "正在恢复 workspace starter...";
    case "delete":
      return "正在永久删除 workspace starter...";
    case "refresh":
      return "正在从源 workflow 刷新 starter 快照...";
    case "rebase":
      return "正在基于 source workflow 执行 rebase...";
  }
}

export function buildWorkspaceStarterMutationSuccessMessage({
  action,
  sourceDiff,
  templateName
}: {
  action: WorkspaceStarterTemplateMutationAction;
  sourceDiff?: WorkspaceStarterSourceDiff | null;
  templateName: string;
}) {
  switch (action) {
    case "create":
      return `已保存 workspace starter：${templateName}。`;
    case "update":
      return `已更新 workspace starter：${templateName}。`;
    case "archive":
      return `已归档 workspace starter：${templateName}。`;
    case "restore":
      return `已恢复 workspace starter：${templateName}。`;
    case "delete":
      return `已永久删除 workspace starter：${templateName}。`;
    case "refresh": {
      const sandboxSuffix = buildWorkspaceStarterSandboxDriftSuccessSuffix(action, sourceDiff ?? null);
      return `已刷新 workspace starter：${templateName}。${sandboxSuffix}`;
    }
    case "rebase": {
      const sandboxSuffix = buildWorkspaceStarterSandboxDriftSuccessSuffix(action, sourceDiff ?? null);
      return `已完成 workspace starter rebase：${templateName}。${sandboxSuffix}`;
    }
  }
}

export function buildWorkspaceStarterMutationFallbackErrorMessage(
  action: WorkspaceStarterTemplateMutationAction
) {
  switch (action) {
    case "create":
      return "保存失败。";
    case "update":
      return "更新失败。";
    case "archive":
      return "归档失败。";
    case "restore":
      return "恢复失败。";
    case "delete":
      return "删除失败。";
    case "refresh":
      return "刷新失败。";
    case "rebase":
      return "rebase 失败。";
  }
}

export function buildWorkspaceStarterMutationNetworkErrorMessage(
  action: WorkspaceStarterTemplateMutationAction
) {
  switch (action) {
    case "create":
      return "无法连接后端保存 workspace starter，请确认 API 已启动。";
    case "update":
      return "无法连接后端更新 workspace starter，请确认 API 已启动。";
    case "archive":
      return "无法连接后端归档 workspace starter，请确认 API 已启动。";
    case "restore":
      return "无法连接后端恢复 workspace starter，请确认 API 已启动。";
    case "delete":
      return "无法连接后端永久删除 workspace starter，请确认 API 已启动。";
    case "refresh":
      return "无法连接后端刷新 starter，请确认 API 已启动。";
    case "rebase":
      return "无法连接后端执行 starter rebase，请确认 API 已启动。";
  }
}

export function buildWorkspaceStarterBulkActionPendingMessage(action: WorkspaceStarterBulkAction) {
  return `正在对当前筛选结果批量${getWorkspaceStarterBulkActionLabel(action)}...`;
}

export function buildWorkspaceStarterBulkActionErrorMessage(action: WorkspaceStarterBulkAction) {
  return `批量${getWorkspaceStarterBulkActionLabel(action)}失败。`;
}

export function buildWorkspaceStarterBulkActionSuccessMessage(
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

export const buildBulkActionMessage = buildWorkspaceStarterBulkActionSuccessMessage;

export function buildWorkspaceStarterBulkResultSurfaceCopy(): WorkspaceStarterBulkResultSurfaceCopy {
  return {
    recommendedNextStepDescription:
      "同一份 result receipt 现在会先投影稳定的 next-step presenter；`follow_up` 只保留为解释文本，不再承担主要导航语义。",
    focusDescription:
      "result receipt 已把“已处理 / 已跳过”的 starter 收口到同一张清单里；点击任一条目会自动切换筛选范围，并把右侧详情聚焦到对应模板的 source diff / metadata。"
  };
}

export function buildWorkspaceStarterMetadataIdleMessage() {
  return "更新后会直接写回 workspace starter library，创建页会立刻复用最新元数据。";
}

function buildWorkspaceStarterSandboxDriftSuccessSuffix(
  action: Extract<WorkspaceStarterTemplateMutationAction, "refresh" | "rebase">,
  sourceDiff: WorkspaceStarterSourceDiff | null
) {
  const sandboxDriftCount = countSummaryChanges(
    normalizeSourceDiffSummary(sourceDiff?.sandbox_dependency_summary)
  );

  if (sandboxDriftCount <= 0) {
    return "";
  }

  return action === "refresh"
    ? ` 已同步 ${sandboxDriftCount} 个 sandbox 依赖漂移节点。`
    : ` 已接受 ${sandboxDriftCount} 个 sandbox 依赖漂移节点的来源变更。`;
}

function countSummaryChanges(summary: WorkspaceStarterSourceDiffSummary | null) {
  if (!summary) {
    return 0;
  }

  return summary.added_count + summary.removed_count + summary.changed_count;
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

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
