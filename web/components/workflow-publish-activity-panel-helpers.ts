import type {
  PluginToolRegistryItem,
} from "@/lib/get-plugin-registry";
import type {
  PublishedEndpointApiKeyItem,
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationFacetItem,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessGuardedResult } from "@/lib/sensitive-access";
import type { WorkflowPublishInvocationActiveFilter } from "@/lib/workflow-publish-governance";
import {
  PUBLISHED_RUN_STATUSES,
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel
} from "@/lib/published-invocation-presenters";

export type WorkflowPublishActivityPanelProps = {
  workflowId: string;
  tools: PluginToolRegistryItem[];
  binding: WorkflowPublishedEndpointItem;
  apiKeys: PublishedEndpointApiKeyItem[];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  selectedInvocationId: string | null;
  selectedInvocationDetail: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>;
  selectedInvocationDetailHref: string | null;
  clearInvocationDetailHref: string | null;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
  activeInvocationFilter: WorkflowPublishInvocationActiveFilter | null;
};

export const TIME_WINDOW_OPTIONS = [
  { value: "all", label: "全部时间" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" }
] as const;

export function facetCount(
  facets: PublishedEndpointInvocationFacetItem[] | undefined,
  value: string
) {
  return facets?.find((item) => item.value === value)?.count ?? 0;
}

export function formatTimeWindowLabel(value: "24h" | "7d" | "30d" | "all") {
  return TIME_WINDOW_OPTIONS.find((option) => option.value === value)?.label ?? "全部时间";
}

export function buildActiveFilterChips(
  activeInvocationFilter: WorkflowPublishActivityPanelProps["activeInvocationFilter"],
  apiKeys: PublishedEndpointApiKeyItem[]
) {
  if (!activeInvocationFilter) {
    return [];
  }

  const chips: string[] = [];
  if (activeInvocationFilter.status) {
    chips.push(`status ${activeInvocationFilter.status}`);
  }
  if (activeInvocationFilter.requestSource) {
    chips.push(`source ${activeInvocationFilter.requestSource}`);
  }
  if (activeInvocationFilter.requestSurface) {
    chips.push(formatPublishedInvocationSurfaceLabel(activeInvocationFilter.requestSurface));
  }
  if (activeInvocationFilter.cacheStatus) {
    chips.push(formatPublishedInvocationCacheStatusLabel(activeInvocationFilter.cacheStatus));
  }
  if (activeInvocationFilter.runStatus) {
    chips.push(formatPublishedRunStatusLabel(activeInvocationFilter.runStatus));
  }
  if (activeInvocationFilter.reasonCode) {
    chips.push(formatPublishedInvocationReasonLabel(activeInvocationFilter.reasonCode));
  }
  if (activeInvocationFilter.apiKeyId) {
    const apiKey = apiKeys.find((item) => item.id === activeInvocationFilter.apiKeyId);
    chips.push(`key ${apiKey?.name ?? apiKey?.key_prefix ?? activeInvocationFilter.apiKeyId}`);
  }
  if (activeInvocationFilter.timeWindow !== "all") {
    chips.push(formatTimeWindowLabel(activeInvocationFilter.timeWindow));
  }
  return chips;
}

export function buildRunStatusOptions(
  runStatusCounts: PublishedEndpointInvocationFacetItem[] | undefined
) {
  const dynamicValues = new Set((runStatusCounts ?? []).map((item) => item.value).filter(Boolean));
  for (const value of PUBLISHED_RUN_STATUSES) {
    dynamicValues.add(value);
  }
  return Array.from(dynamicValues);
}
