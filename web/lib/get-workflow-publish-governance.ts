import {
  getPublishedEndpointApiKeys,
  getPublishedEndpointCacheInventory,
  getPublishedEndpointInvocationDetail,
  getPublishedEndpointInvocations,
  type PublishedEndpointApiKeyItem,
  type PublishedEndpointInvocationRequestSurface,
  type PublishedEndpointInvocationListResponse,
  type WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessGuardedResult } from "@/lib/sensitive-access";
import type {
  PublishedEndpointCacheInventoryResponse,
  PublishedEndpointInvocationDetailResponse
} from "@/lib/get-workflow-publish";

export type WorkflowPublishGovernanceSnapshot = {
  cacheInventories: Record<string, SensitiveAccessGuardedResult<PublishedEndpointCacheInventoryResponse>>;
  apiKeysByBinding: Record<string, PublishedEndpointApiKeyItem[]>;
  invocationAuditsByBinding: Record<string, PublishedEndpointInvocationListResponse | null>;
  invocationDetailsByBinding: Record<
    string,
    SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>
  >;
  rateLimitWindowAuditsByBinding: Record<
    string,
    PublishedEndpointInvocationListResponse | null
  >;
};

type WorkflowPublishInvocationFilter = {
  bindingId: string;
  invocationId?: string;
  status?: "succeeded" | "failed" | "rejected";
  requestSource?: "workflow" | "alias" | "path";
  requestSurface?: PublishedEndpointInvocationRequestSurface;
  cacheStatus?: "hit" | "miss" | "bypass";
  runStatus?: string;
  apiKeyId?: string;
  reasonCode?: string;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
};

function toRecord<T>(
  entries: ReadonlyArray<readonly [string, T]>
): Record<string, T> {
  return Object.fromEntries(entries) as Record<string, T>;
}

export async function getWorkflowPublishGovernanceSnapshot(
  workflowId: string,
  bindings: WorkflowPublishedEndpointItem[],
  options?: {
    activeInvocationFilter?: WorkflowPublishInvocationFilter | null;
  }
): Promise<WorkflowPublishGovernanceSnapshot> {
  const [
    cacheInventoryEntries,
    apiKeyEntries,
    invocationAuditEntries,
    invocationDetailEntries,
    rateLimitWindowEntries
  ] = await Promise.all([
    Promise.all(
      bindings
        .filter((binding) => binding.cache_inventory?.enabled)
        .map(async (binding) => [
          binding.id,
          await getPublishedEndpointCacheInventory(workflowId, binding.id)
        ] as const)
    ),
    Promise.all(
      bindings
        .filter((binding) => binding.auth_mode === "api_key")
        .map(async (binding) => [
          binding.id,
          await getPublishedEndpointApiKeys(workflowId, binding.id)
        ] as const)
    ),
    Promise.all(
      bindings.map(async (binding) => [
        binding.id,
        await getPublishedEndpointInvocations(
          workflowId,
          binding.id,
          options?.activeInvocationFilter?.bindingId === binding.id
            ? {
                limit: options.activeInvocationFilter.limit ?? 12,
                status: options.activeInvocationFilter.status,
                requestSource: options.activeInvocationFilter.requestSource,
                requestSurface: options.activeInvocationFilter.requestSurface,
                cacheStatus: options.activeInvocationFilter.cacheStatus,
                runStatus: options.activeInvocationFilter.runStatus,
                apiKeyId: options.activeInvocationFilter.apiKeyId,
                reasonCode: options.activeInvocationFilter.reasonCode,
                createdFrom: options.activeInvocationFilter.createdFrom,
                createdTo: options.activeInvocationFilter.createdTo
              }
            : {
                limit: 5
              }
        )
      ] as const)
    ),
    Promise.all(
      bindings.map(async (binding) => [
        binding.id,
        options?.activeInvocationFilter?.bindingId === binding.id &&
        options.activeInvocationFilter.invocationId
          ? await getPublishedEndpointInvocationDetail(
              workflowId,
              binding.id,
              options.activeInvocationFilter.invocationId
            )
          : null
      ] as const)
    ),
    Promise.all(
      bindings
        .filter((binding) => binding.rate_limit_policy)
        .map(async (binding) => [
          binding.id,
          await getPublishedEndpointInvocations(workflowId, binding.id, {
            limit: 5,
            createdFrom: new Date(
              Date.now() - (binding.rate_limit_policy?.windowSeconds ?? 0) * 1000
            ).toISOString()
          })
        ] as const)
    )
  ]);

  return {
    cacheInventories: toRecord(cacheInventoryEntries),
    apiKeysByBinding: toRecord(apiKeyEntries),
    invocationAuditsByBinding: toRecord(invocationAuditEntries),
    invocationDetailsByBinding: toRecord(invocationDetailEntries),
    rateLimitWindowAuditsByBinding: toRecord(rateLimitWindowEntries)
  };
}
