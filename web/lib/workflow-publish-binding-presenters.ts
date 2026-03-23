import type {
  PublishedEndpointInvocationExportFormat,
  PublishedEndpointApiKeyItem,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";

export type WorkflowPublishBindingMetaRow = {
  key: string;
  label: string;
  value: string;
};

export type WorkflowPublishBindingSummaryCard = {
  key: string;
  label: string;
  value: string;
};

export type WorkflowPublishBindingCardSurface = {
  lifecycleLabel: string;
  endpointSummary: string;
  protocolChips: string[];
  activityRows: WorkflowPublishBindingMetaRow[];
  policyRows: WorkflowPublishBindingMetaRow[];
  cacheInventorySummaryCards: WorkflowPublishBindingSummaryCard[];
  cacheInventoryVaryLabels: string[];
  apiKeyGovernanceEmptyState: string;
};

export type WorkflowPublishLifecycleActionSurface = {
  nextStatus: "published" | "offline";
  submitLabel: string;
  pendingLabel: string;
  preflightDescription: string | null;
};

export type WorkflowPublishExportActionSurface = {
  format: PublishedEndpointInvocationExportFormat;
  idleLabel: string;
  pendingLabel: string;
};

export type WorkflowPublishApiKeyManagerSurface = {
  title: string;
  description: string;
  summaryCards: WorkflowPublishBindingSummaryCard[];
  nameFieldLabel: string;
  namePlaceholder: string;
  createButtonLabel: string;
  createPendingLabel: string;
  revokeButtonLabel: string;
  revokePendingLabel: string;
  secretLabel: string;
  createdLabel: string;
  lastUsedLabel: string;
  emptyState: string;
};

export type WorkflowPublishApiKeyMutationAction = "create" | "revoke";

export type WorkflowPublishLifecycleMutationStatus = "published" | "offline";

type WorkflowPublishLifecycleStatusSurface = {
  label: string;
  resultLabel: string;
};

function resolveWorkflowPublishExportLabel(format: PublishedEndpointInvocationExportFormat) {
  return format === "json" ? "导出 activity JSON" : "导出 activity JSONL";
}

function buildWorkflowPublishLifecycleStatusSurface(
  lifecycleStatus: string | null | undefined
): WorkflowPublishLifecycleStatusSurface {
  const resolvedStatus = lifecycleStatus?.trim();

  if (resolvedStatus === "draft") {
    return {
      label: "草稿",
      resultLabel: "草稿"
    };
  }

  if (resolvedStatus === "published") {
    return {
      label: "已发布",
      resultLabel: "已发布"
    };
  }

  if (resolvedStatus === "offline") {
    return {
      label: "已下线",
      resultLabel: "已下线"
    };
  }

  if (resolvedStatus) {
    return {
      label: `状态 ${resolvedStatus}`,
      resultLabel: `状态已切换为 ${resolvedStatus}`
    };
  }

  return {
    label: "状态未知",
    resultLabel: "状态已更新"
  };
}

function buildWorkflowPublishBindingMetaRow(
  key: string,
  label: string,
  value: string
): WorkflowPublishBindingMetaRow {
  return {
    key,
    label,
    value
  };
}

function buildWorkflowPublishBindingSummaryCard(
  key: string,
  label: string,
  value: string
): WorkflowPublishBindingSummaryCard {
  return {
    key,
    label,
    value
  };
}

function formatRateLimitPolicy(
  rateLimitPolicy: WorkflowPublishedEndpointItem["rate_limit_policy"]
): string {
  if (!rateLimitPolicy) {
    return "disabled";
  }

  return `${rateLimitPolicy.requests} / ${rateLimitPolicy.windowSeconds}s`;
}

function formatCachePolicy(
  cachePolicy: WorkflowPublishedEndpointItem["cache_policy"]
): string {
  if (!cachePolicy?.enabled) {
    return "disabled";
  }

  return `ttl ${cachePolicy.ttl}s · max ${cachePolicy.maxEntries}`;
}

function resolveLatestApiKeyLastUsedAt(apiKeys: PublishedEndpointApiKeyItem[]) {
  let latestValue: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const apiKey of apiKeys) {
    if (apiKey.status !== "active" || !apiKey.last_used_at) {
      continue;
    }

    const nextTimestamp = new Date(apiKey.last_used_at).getTime();
    if (!Number.isFinite(nextTimestamp) || nextTimestamp <= latestTimestamp) {
      continue;
    }

    latestTimestamp = nextTimestamp;
    latestValue = apiKey.last_used_at;
  }

  return latestValue;
}

export function buildWorkflowPublishBindingCardSurface(
  binding: WorkflowPublishedEndpointItem
): WorkflowPublishBindingCardSurface {
  const activity = binding.activity;
  const cacheSummary = binding.cache_inventory;
  const lifecycleSurface = buildWorkflowPublishLifecycleStatusSurface(
    binding.lifecycle_status
  );
  const varyBy =
    cacheSummary && cacheSummary.vary_by.length > 0
      ? cacheSummary.vary_by
      : ["full-payload"];

  return {
    lifecycleLabel: lifecycleSurface.label,
    endpointSummary: `${binding.endpoint_id} · alias ${binding.endpoint_alias} · path ${binding.route_path}`,
    protocolChips: [
      binding.protocol,
      binding.auth_mode,
      `workflow ${binding.workflow_version} -> ${binding.target_workflow_version}`,
      binding.streaming ? "streaming" : "non-streaming"
    ],
    activityRows: [
      buildWorkflowPublishBindingMetaRow("total", "Total", String(activity?.total_count ?? 0)),
      buildWorkflowPublishBindingMetaRow(
        "success",
        "Success",
        String(activity?.succeeded_count ?? 0)
      ),
      buildWorkflowPublishBindingMetaRow(
        "cache",
        "Cache",
        `hit ${activity?.cache_hit_count ?? 0} / miss ${activity?.cache_miss_count ?? 0}`
      ),
      buildWorkflowPublishBindingMetaRow(
        "last-call",
        "Last call",
        formatTimestamp(activity?.last_invoked_at)
      )
    ],
    policyRows: [
      buildWorkflowPublishBindingMetaRow(
        "rate-limit",
        "Rate limit",
        formatRateLimitPolicy(binding.rate_limit_policy)
      ),
      buildWorkflowPublishBindingMetaRow(
        "cache-policy",
        "Cache policy",
        formatCachePolicy(binding.cache_policy)
      ),
      buildWorkflowPublishBindingMetaRow(
        "published-at",
        "Published at",
        formatTimestamp(binding.published_at)
      ),
      buildWorkflowPublishBindingMetaRow("updated", "Updated", formatTimestamp(binding.updated_at))
    ],
    cacheInventorySummaryCards: [
      buildWorkflowPublishBindingSummaryCard(
        "enabled",
        "Enabled",
        cacheSummary?.enabled ? "yes" : "no"
      ),
      buildWorkflowPublishBindingSummaryCard(
        "entries",
        "Entries",
        String(cacheSummary?.active_entry_count ?? 0)
      ),
      buildWorkflowPublishBindingSummaryCard(
        "total-hits",
        "Total hits",
        String(cacheSummary?.total_hit_count ?? 0)
      ),
      buildWorkflowPublishBindingSummaryCard(
        "nearest-expiry",
        "Nearest expiry",
        formatTimestamp(cacheSummary?.nearest_expires_at)
      )
    ],
    cacheInventoryVaryLabels: varyBy.map((fieldPath) => `vary ${fieldPath}`),
    apiKeyGovernanceEmptyState: `当前 binding 使用 auth_mode=${binding.auth_mode}，不需要单独管理 published API key。`
  };
}

export function buildWorkflowPublishApiKeyManagerSurface(
  apiKeys: PublishedEndpointApiKeyItem[]
): WorkflowPublishApiKeyManagerSurface {
  const activeKeys = apiKeys.filter((apiKey) => apiKey.status === "active");

  return {
    title: "API key governance",
    description: "仅对 `auth_mode=api_key` 的 endpoint 生效。secret 只在创建后回显一次。",
    summaryCards: [
      buildWorkflowPublishBindingSummaryCard("active-keys", "Active keys", String(activeKeys.length)),
      buildWorkflowPublishBindingSummaryCard(
        "last-used",
        "Last used",
        formatTimestamp(resolveLatestApiKeyLastUsedAt(activeKeys))
      )
    ],
    nameFieldLabel: "Key name",
    namePlaceholder: "例如 Production Gateway",
    createButtonLabel: "创建 API key",
    createPendingLabel: "创建中...",
    revokeButtonLabel: "撤销",
    revokePendingLabel: "撤销中...",
    secretLabel: "One-time secret",
    createdLabel: "Created",
    lastUsedLabel: "Last used",
    emptyState:
      "当前还没有 active API key。若该 endpoint 已发布给外部系统，建议先创建独立 key 再分发。"
  };
}

export function buildWorkflowPublishApiKeySecretReceiptCopy(keyPrefix?: string | null) {
  return `prefix ${keyPrefix?.trim() || "unknown"}。刷新页面后将无法再次查看该 secret。`;
}

export function buildWorkflowPublishApiKeyMutationValidationMessage(
  action: WorkflowPublishApiKeyMutationAction
) {
  return action === "create"
    ? "缺少 API key 所需信息，无法创建。"
    : "缺少 API key 标识，无法撤销。";
}

export function buildWorkflowPublishApiKeyMutationFallbackErrorMessage(
  action: WorkflowPublishApiKeyMutationAction
) {
  return action === "create" ? "创建 API key 失败。" : "撤销 API key 失败。";
}

export function buildWorkflowPublishApiKeyMutationNetworkErrorMessage(
  action: WorkflowPublishApiKeyMutationAction
) {
  return action === "create"
    ? "无法连接后端创建 API key，请确认 API 已启动。"
    : "无法连接后端撤销 API key，请确认 API 已启动。";
}

export function buildWorkflowPublishApiKeyMutationSuccessMessage({
  action,
  name,
  keyId
}: {
  action: WorkflowPublishApiKeyMutationAction;
  name?: string | null;
  keyId?: string | null;
}) {
  const resolvedName = name?.trim() || keyId?.trim() || "API key";

  return action === "create"
    ? `${resolvedName} 已创建，请立即保存 secret，本页不会再次展示。`
    : `${resolvedName} 已撤销。`;
}

function resolveWorkflowPublishLifecycleMutationVerb(
  nextStatus: WorkflowPublishLifecycleMutationStatus
) {
  return nextStatus === "published" ? "发布" : "下线";
}

function formatWorkflowPublishLifecycleMutationResult(
  lifecycleStatus: string | null | undefined,
  nextStatus: WorkflowPublishLifecycleMutationStatus
) {
  return buildWorkflowPublishLifecycleStatusSurface(
    lifecycleStatus?.trim() || nextStatus
  ).resultLabel;
}

export function buildWorkflowPublishLifecycleMutationValidationMessage() {
  return "缺少发布 binding 信息，无法更新发布状态。";
}

export function buildWorkflowPublishLifecycleMutationFallbackErrorMessage(
  nextStatus: WorkflowPublishLifecycleMutationStatus
) {
  return `${resolveWorkflowPublishLifecycleMutationVerb(nextStatus)} endpoint 失败。`;
}

export function buildWorkflowPublishLifecycleMutationNetworkErrorMessage(
  nextStatus: WorkflowPublishLifecycleMutationStatus
) {
  return `无法连接后端${resolveWorkflowPublishLifecycleMutationVerb(nextStatus)} endpoint，请确认 API 已启动。`;
}

export function buildWorkflowPublishLifecycleMutationSuccessMessage({
  endpointName,
  bindingId,
  lifecycleStatus,
  nextStatus
}: {
  endpointName?: string | null;
  bindingId?: string | null;
  lifecycleStatus?: string | null;
  nextStatus: WorkflowPublishLifecycleMutationStatus;
}) {
  const resolvedName = endpointName?.trim() || bindingId?.trim() || "Endpoint";
  const result = formatWorkflowPublishLifecycleMutationResult(
    lifecycleStatus,
    nextStatus
  );

  return `${resolvedName} ${result}。`;
}

export function buildWorkflowPublishLifecycleActionSurface({
  currentStatus,
  sandboxReadiness
}: {
  currentStatus: "draft" | "published" | "offline";
  sandboxReadiness?: SandboxReadinessCheck | null;
}): WorkflowPublishLifecycleActionSurface {
  const nextStatus = currentStatus === "published" ? "offline" : "published";
  const submitLabel = currentStatus === "published" ? "下线 endpoint" : "发布 endpoint";
  const sandboxPreflightHint = formatSandboxReadinessPreflightHint(sandboxReadiness);

  return {
    nextStatus,
    submitLabel,
    pendingLabel: "提交中...",
    preflightDescription: sandboxPreflightHint
      ? `当前 lifecycle action 只切换 binding 对外状态；若后续 sampled run 仍依赖 strong-isolation，请先核对：${sandboxPreflightHint}`
      : null
  };
}

export function buildWorkflowPublishExportActionSurface(
  format: PublishedEndpointInvocationExportFormat
): WorkflowPublishExportActionSurface {
  return {
    format,
    idleLabel: resolveWorkflowPublishExportLabel(format),
    pendingLabel: `导出 ${format.toUpperCase()}...`
  };
}

export function buildWorkflowPublishExportReadinessHint(
  sandboxReadiness?: SandboxReadinessCheck | null
) {
  const sandboxPreflightHint = formatSandboxReadinessPreflightHint(sandboxReadiness);

  return sandboxPreflightHint
    ? `当前 activity export 只导出历史 invocation 事实；若要判断这个 binding 现在还能否继续承载 strong-isolation 路径，仍要回到 live readiness 对照：${sandboxPreflightHint}`
    : null;
}

export function buildWorkflowPublishExportSuccessMessage({
  format,
  limit
}: {
  format: PublishedEndpointInvocationExportFormat;
  limit: number;
}) {
  return `${resolveWorkflowPublishExportLabel(format)} 已开始下载（最多 ${limit} 条过滤后的 invocation）。`;
}

export function buildWorkflowPublishExportNetworkErrorMessage(
  format: PublishedEndpointInvocationExportFormat
) {
  return `无法导出 ${format.toUpperCase()}，请确认 API 已启动。`;
}

export function buildWorkflowPublishExportFallbackErrorMessage({
  format,
  status
}: {
  format: PublishedEndpointInvocationExportFormat;
  status: number;
}) {
  return `导出 ${format.toUpperCase()} 失败，API 返回 ${status}。`;
}
