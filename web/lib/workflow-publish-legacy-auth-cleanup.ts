import type {
  WorkflowPublishedEndpointItem,
  WorkflowPublishedEndpointLegacyAuthCleanupResult
} from "@/lib/get-workflow-publish";

type WorkflowPublishLegacyAuthCleanupBindingItem = {
  bindingId: string;
  endpointId: string;
  endpointLabel: string;
  workflowVersion: string;
  lifecycleStatus: "draft" | "published" | "offline";
  detail: string;
};

export type WorkflowPublishLegacyAuthCleanupSurface = {
  shouldRender: boolean;
  title: string;
  description: string;
  candidateBindings: WorkflowPublishLegacyAuthCleanupBindingItem[];
  publishedBindings: WorkflowPublishLegacyAuthCleanupBindingItem[];
  offlineBindings: WorkflowPublishLegacyAuthCleanupBindingItem[];
  candidateBindingIds: string[];
  candidateSummary: string;
  blockedSummary: string;
  offlineSummary: string;
  actionLabel: string;
  pendingLabel: string;
  idleMessage: string;
};

function hasLegacyAuthIssue(binding: Pick<WorkflowPublishedEndpointItem, "issues">) {
  return Boolean(
    binding.issues?.some(
      (issue) => issue.category === "unsupported_auth_mode" && issue.blocks_lifecycle_publish
    )
  );
}

function formatEndpointLabel(
  binding: Pick<WorkflowPublishedEndpointItem, "endpoint_id" | "endpoint_name">
) {
  return binding.endpoint_name && binding.endpoint_name !== binding.endpoint_id
    ? `${binding.endpoint_name} (${binding.endpoint_id})`
    : binding.endpoint_id;
}

function buildBindingItem(
  binding: WorkflowPublishedEndpointItem
): WorkflowPublishLegacyAuthCleanupBindingItem {
  const endpointLabel = formatEndpointLabel(binding);

  if (binding.lifecycle_status === "draft") {
    return {
      bindingId: binding.id,
      endpointId: binding.endpoint_id,
      endpointLabel,
      workflowVersion: binding.workflow_version,
      lifecycleStatus: "draft",
      detail: `workflow ${binding.workflow_version} 仍是历史 legacy draft，可直接批量切到 offline。`
    };
  }

  if (binding.lifecycle_status === "published") {
    return {
      bindingId: binding.id,
      endpointId: binding.endpoint_id,
      endpointLabel,
      workflowVersion: binding.workflow_version,
      lifecycleStatus: "published",
      detail:
        "当前 binding 仍在 live publish 链路上；先补发支持 api_key/internal 的新版 binding，再决定是否下线，避免直接中断 endpoint。"
    };
  }

  return {
    bindingId: binding.id,
    endpointId: binding.endpoint_id,
    endpointLabel,
    workflowVersion: binding.workflow_version,
    lifecycleStatus: "offline",
    detail: `workflow ${binding.workflow_version} 已 offline，仅保留在治理 inventory 里。`
  };
}

function formatSummary(count: number, singular: string, emptyLabel: string) {
  if (count <= 0) {
    return emptyLabel;
  }
  return count === 1 ? `1 ${singular}` : `${count} ${singular}s`;
}

export function buildWorkflowPublishLegacyAuthCleanupSurface(
  bindings: WorkflowPublishedEndpointItem[]
): WorkflowPublishLegacyAuthCleanupSurface {
  const candidateBindings: WorkflowPublishLegacyAuthCleanupBindingItem[] = [];
  const publishedBindings: WorkflowPublishLegacyAuthCleanupBindingItem[] = [];
  const offlineBindings: WorkflowPublishLegacyAuthCleanupBindingItem[] = [];

  for (const binding of bindings) {
    if (!hasLegacyAuthIssue(binding)) {
      continue;
    }

    const item = buildBindingItem(binding);
    if (item.lifecycleStatus === "draft") {
      candidateBindings.push(item);
      continue;
    }

    if (item.lifecycleStatus === "published") {
      publishedBindings.push(item);
      continue;
    }

    offlineBindings.push(item);
  }

  return {
    shouldRender:
      candidateBindings.length > 0 || publishedBindings.length > 0 || offlineBindings.length > 0,
    title: "Legacy publish auth cleanup",
    description:
      "publish auth 不再承诺 token 后，publish 面板要把历史 binding backlog 变成可治理事实：draft legacy binding 可以批量下线，仍在 published 的 legacy binding 则继续显式保留为人工 follow-up。",
    candidateBindings,
    publishedBindings,
    offlineBindings,
    candidateBindingIds: candidateBindings.map((binding) => binding.bindingId),
    candidateSummary: formatSummary(
      candidateBindings.length,
      "draft cleanup candidate",
      "No draft cleanup candidates"
    ),
    blockedSummary: formatSummary(
      publishedBindings.length,
      "published blocker",
      "No live published blockers"
    ),
    offlineSummary: formatSummary(
      offlineBindings.length,
      "offline inventory item",
      "No offline inventory items"
    ),
    actionLabel: "批量下线 legacy draft bindings",
    pendingLabel: "批量 cleanup 中...",
    idleMessage:
      candidateBindings.length > 0
        ? "批量动作只会处理 draft legacy binding；published legacy binding 仍需先补发新版 binding。"
        : "当前没有可批量下线的 legacy draft binding。"
  };
}

export function buildWorkflowPublishLegacyAuthCleanupValidationMessage() {
  return "缺少可批量下线的 legacy auth draft binding。";
}

export function buildWorkflowPublishLegacyAuthCleanupFallbackErrorMessage() {
  return "批量清理 legacy publish auth draft binding 失败。";
}

export function buildWorkflowPublishLegacyAuthCleanupNetworkErrorMessage() {
  return "无法连接后端执行 legacy publish auth 批量清理，请确认 API 已启动。";
}

export function buildWorkflowPublishLegacyAuthCleanupSuccessMessage(
  result: WorkflowPublishedEndpointLegacyAuthCleanupResult
) {
  if (result.updated_count <= 0) {
    return "没有可批量下线的 legacy auth draft binding。";
  }

  if (result.skipped_count > 0) {
    return `已批量下线 ${result.updated_count} 条 legacy auth draft binding；另外 ${result.skipped_count} 条仍需逐项处理。`;
  }

  return `已批量下线 ${result.updated_count} 条 legacy auth draft binding。`;
}
