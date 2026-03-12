import { getApiBaseUrl } from "@/lib/api-base-url";

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
