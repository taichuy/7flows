import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  parseSensitiveAccessGuardedResponse,
  type SensitiveAccessGuardedResult
} from "@/lib/sensitive-access";
import type {
  PublishedEndpointApiKeyItem,
  PublishedEndpointCacheInventoryResponse,
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationExportFormat,
  PublishedEndpointInvocationListOptions,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  WorkflowPublishedEndpointItem
} from "@/lib/workflow-publish-types";

function getWorkflowPublishLegacyAuthBaseUrl() {
  return typeof window === "undefined" ? getApiBaseUrl() : "";
}

export async function getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot(): Promise<WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null> {
  try {
    const response = await fetch(
      `${getWorkflowPublishLegacyAuthBaseUrl()}/api/workflows/published-endpoints/legacy-auth-governance`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot;
  } catch {
    return null;
  }
}

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
): Promise<SensitiveAccessGuardedResult<PublishedEndpointCacheInventoryResponse>> {
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

    return await parseSensitiveAccessGuardedResponse<PublishedEndpointCacheInventoryResponse>(
      response
    );
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
  options?: PublishedEndpointInvocationListOptions
): Promise<PublishedEndpointInvocationListResponse | null> {
  try {
    const searchParams = buildPublishedEndpointInvocationSearchParams(options, {
      defaultLimit: 5,
      maxLimit: 20
    });

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

export function buildPublishedEndpointInvocationExportUrl(
  workflowId: string,
  bindingId: string,
  options: PublishedEndpointInvocationListOptions | undefined,
  format: PublishedEndpointInvocationExportFormat
) {
  const searchParams = buildPublishedEndpointInvocationSearchParams(options, {
    defaultLimit: 200,
    maxLimit: 1000
  });
  searchParams.set("format", format);

  return `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
    workflowId
  )}/published-endpoints/${encodeURIComponent(bindingId)}/invocations/export?${searchParams.toString()}`;
}

export async function getPublishedEndpointInvocationDetail(
  workflowId: string,
  bindingId: string,
  invocationId: string
): Promise<SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/invocations/${encodeURIComponent(invocationId)}`,
      {
        cache: "no-store"
      }
    );

    return await parseSensitiveAccessGuardedResponse<PublishedEndpointInvocationDetailResponse>(
      response
    );
  } catch {
    return null;
  }
}

function buildPublishedEndpointInvocationSearchParams(
  options: PublishedEndpointInvocationListOptions | undefined,
  limits: {
    defaultLimit: number;
    maxLimit: number;
  }
) {
  const searchParams = new URLSearchParams();
  searchParams.set(
    "limit",
    String(Math.min(Math.max(options?.limit ?? limits.defaultLimit, 1), limits.maxLimit))
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
  if (options?.runStatus) {
    searchParams.set("run_status", options.runStatus);
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
  return searchParams;
}
