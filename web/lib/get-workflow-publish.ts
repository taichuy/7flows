import { getApiBaseUrl } from "@/lib/api-base-url";

export type PublishedEndpointInvocationStatus = "succeeded" | "failed" | "rejected";
export type PublishedEndpointInvocationRequestSource = "workflow" | "alias" | "path";
export type PublishedEndpointInvocationCacheStatus = "hit" | "miss" | "bypass";
export type PublishedEndpointInvocationRequestSurface =
  | "native.workflow"
  | "native.alias"
  | "native.path"
  | "openai.chat.completions"
  | "openai.responses"
  | "openai.unknown"
  | "anthropic.messages"
  | "unknown";

export type PublishedEndpointInvocationSummary = {
  total_count: number;
  succeeded_count: number;
  failed_count: number;
  rejected_count: number;
  cache_hit_count: number;
  cache_miss_count: number;
  cache_bypass_count: number;
  last_invoked_at?: string | null;
  last_status?: string | null;
  last_cache_status?: "hit" | "miss" | "bypass" | null;
  last_run_id?: string | null;
  last_run_status?: string | null;
  last_reason_code?: string | null;
};

export type PublishedEndpointInvocationItem = {
  id: string;
  workflow_id: string;
  binding_id: string;
  endpoint_id: string;
  endpoint_alias: string;
  route_path: string;
  protocol: string;
  auth_mode: string;
  request_source: PublishedEndpointInvocationRequestSource;
  request_surface: PublishedEndpointInvocationRequestSurface;
  status: PublishedEndpointInvocationStatus;
  cache_status: PublishedEndpointInvocationCacheStatus;
  api_key_id?: string | null;
  api_key_name?: string | null;
  api_key_prefix?: string | null;
  api_key_status?: "active" | "revoked" | null;
  run_id?: string | null;
  run_status?: string | null;
  reason_code?: string | null;
  error_message?: string | null;
  request_preview: {
    key_count?: number;
    keys?: string[];
    sample?: Record<string, unknown>;
  };
  response_preview?: Record<string, unknown> | null;
  duration_ms?: number | null;
  created_at: string;
  finished_at?: string | null;
};

export type PublishedEndpointInvocationFacetItem = {
  value: string;
  count: number;
  last_invoked_at?: string | null;
  last_status?: PublishedEndpointInvocationStatus | null;
};

export type PublishedEndpointInvocationApiKeyUsageItem = {
  api_key_id: string;
  name?: string | null;
  key_prefix?: string | null;
  status?: "active" | "revoked" | null;
  invocation_count: number;
  succeeded_count: number;
  failed_count: number;
  rejected_count: number;
  last_invoked_at?: string | null;
  last_status?: PublishedEndpointInvocationStatus | null;
};

export type PublishedEndpointInvocationFailureReasonItem = {
  message: string;
  count: number;
  last_invoked_at?: string | null;
};

export type PublishedEndpointInvocationBucketFacetItem = {
  value: string;
  count: number;
};

export type PublishedEndpointInvocationApiKeyBucketFacetItem = {
  api_key_id: string;
  name?: string | null;
  key_prefix?: string | null;
  count: number;
};

export type PublishedEndpointInvocationTimeBucketItem = {
  bucket_start: string;
  bucket_end: string;
  total_count: number;
  succeeded_count: number;
  failed_count: number;
  rejected_count: number;
  api_key_counts: PublishedEndpointInvocationApiKeyBucketFacetItem[];
  cache_status_counts: PublishedEndpointInvocationBucketFacetItem[];
  request_surface_counts: PublishedEndpointInvocationBucketFacetItem[];
  reason_counts: PublishedEndpointInvocationBucketFacetItem[];
};

export type PublishedEndpointInvocationFilters = {
  status?: PublishedEndpointInvocationStatus | null;
  request_source?: PublishedEndpointInvocationRequestSource | null;
  request_surface?: PublishedEndpointInvocationRequestSurface | null;
  cache_status?: PublishedEndpointInvocationCacheStatus | null;
  api_key_id?: string | null;
  reason_code?: string | null;
  created_from?: string | null;
  created_to?: string | null;
};

export type PublishedEndpointInvocationFacets = {
  status_counts: PublishedEndpointInvocationFacetItem[];
  request_source_counts: PublishedEndpointInvocationFacetItem[];
  request_surface_counts: PublishedEndpointInvocationFacetItem[];
  cache_status_counts: PublishedEndpointInvocationFacetItem[];
  reason_counts: PublishedEndpointInvocationFacetItem[];
  api_key_usage: PublishedEndpointInvocationApiKeyUsageItem[];
  recent_failure_reasons: PublishedEndpointInvocationFailureReasonItem[];
  timeline_granularity: "hour" | "day";
  timeline: PublishedEndpointInvocationTimeBucketItem[];
};

export type PublishedEndpointInvocationListResponse = {
  filters: PublishedEndpointInvocationFilters;
  summary: PublishedEndpointInvocationSummary;
  facets: PublishedEndpointInvocationFacets;
  items: PublishedEndpointInvocationItem[];
};

export type PublishedEndpointCacheInventorySummary = {
  enabled: boolean;
  ttl?: number | null;
  max_entries?: number | null;
  vary_by: string[];
  active_entry_count: number;
  total_hit_count: number;
  last_hit_at?: string | null;
  nearest_expires_at?: string | null;
  latest_created_at?: string | null;
};

export type PublishedEndpointCacheInventoryItem = {
  id: string;
  binding_id: string;
  cache_key: string;
  response_preview: {
    key_count?: number;
    keys?: string[];
    sample?: Record<string, unknown>;
  };
  hit_count: number;
  last_hit_at?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type PublishedEndpointCacheInventoryResponse = {
  summary: PublishedEndpointCacheInventorySummary;
  items: PublishedEndpointCacheInventoryItem[];
};

export type PublishedEndpointApiKeyItem = {
  id: string;
  workflow_id: string;
  endpoint_id: string;
  name: string;
  key_prefix: string;
  status: "active" | "revoked";
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowPublishedEndpointItem = {
  id: string;
  workflow_id: string;
  workflow_version_id: string;
  workflow_version: string;
  target_workflow_version_id: string;
  target_workflow_version: string;
  compiled_blueprint_id: string;
  endpoint_id: string;
  endpoint_name: string;
  endpoint_alias: string;
  route_path: string;
  protocol: string;
  auth_mode: string;
  streaming: boolean;
  lifecycle_status: "draft" | "published" | "offline";
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  rate_limit_policy?:
    | {
        requests: number;
        windowSeconds: number;
      }
    | null;
  cache_policy?:
    | {
        enabled: boolean;
        ttl: number;
        maxEntries: number;
        varyBy: string[];
      }
    | null;
  published_at?: string | null;
  unpublished_at?: string | null;
  created_at: string;
  updated_at: string;
  activity?: PublishedEndpointInvocationSummary | null;
  cache_inventory?: PublishedEndpointCacheInventorySummary | null;
};

export async function getWorkflowPublishedEndpoints(
  workflowId: string | null | undefined,
  options?: {
    includeAllVersions?: boolean;
  }
): Promise<WorkflowPublishedEndpointItem[]> {
  const normalizedWorkflowId = workflowId?.trim();
  if (!normalizedWorkflowId) {
    return [];
  }

  const searchParams = new URLSearchParams();
  if (options?.includeAllVersions ?? true) {
    searchParams.set("include_all_versions", "true");
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(normalizedWorkflowId)}/published-endpoints?${searchParams.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as WorkflowPublishedEndpointItem[];
  } catch {
    return [];
  }
}

export async function getPublishedEndpointCacheInventory(
  workflowId: string,
  bindingId: string,
  limit = 5
): Promise<PublishedEndpointCacheInventoryResponse | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/cache-entries?limit=${Math.min(
        Math.max(limit, 1),
        20
      )}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PublishedEndpointCacheInventoryResponse;
  } catch {
    return null;
  }
}

export async function getPublishedEndpointApiKeys(
  workflowId: string,
  bindingId: string
): Promise<PublishedEndpointApiKeyItem[]> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/api-keys`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as PublishedEndpointApiKeyItem[];
  } catch {
    return [];
  }
}

export async function getPublishedEndpointInvocations(
  workflowId: string,
  bindingId: string,
  options?: {
    limit?: number;
    status?: PublishedEndpointInvocationStatus;
    requestSource?: PublishedEndpointInvocationRequestSource;
    requestSurface?: PublishedEndpointInvocationRequestSurface;
    cacheStatus?: PublishedEndpointInvocationCacheStatus;
    apiKeyId?: string;
    reasonCode?: string;
    createdFrom?: string;
    createdTo?: string;
  }
): Promise<PublishedEndpointInvocationListResponse | null> {
  try {
    const searchParams = new URLSearchParams();
    searchParams.set(
      "limit",
      String(Math.min(Math.max(options?.limit ?? 5, 1), 20))
    );
    if (options?.status) {
      searchParams.set("status", options.status);
    }
    if (options?.requestSource) {
      searchParams.set("request_source", options.requestSource);
    }
    if (options?.requestSurface) {
      searchParams.set("request_surface", options.requestSurface);
    }
    if (options?.cacheStatus) {
      searchParams.set("cache_status", options.cacheStatus);
    }
    if (options?.apiKeyId) {
      searchParams.set("api_key_id", options.apiKeyId);
    }
    if (options?.reasonCode) {
      searchParams.set("reason_code", options.reasonCode);
    }
    if (options?.createdFrom) {
      searchParams.set("created_from", options.createdFrom);
    }
    if (options?.createdTo) {
      searchParams.set("created_to", options.createdTo);
    }

    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/invocations?${searchParams.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PublishedEndpointInvocationListResponse;
  } catch {
    return null;
  }
}
