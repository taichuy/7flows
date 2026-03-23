import type {
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
  const varyBy =
    cacheSummary && cacheSummary.vary_by.length > 0
      ? cacheSummary.vary_by
      : ["full-payload"];

  return {
    lifecycleLabel: binding.lifecycle_status,
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
