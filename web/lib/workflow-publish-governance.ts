import type {
  PublishedEndpointInvocationCacheStatus,
  PublishedEndpointInvocationRequestSource,
  PublishedEndpointInvocationRequestSurface,
  PublishedEndpointInvocationStatus
} from "@/lib/get-workflow-publish";

export type PublishTimeWindow = "24h" | "7d" | "30d" | "all";

export type WorkflowPublishInvocationActiveFilter = {
  bindingId: string | null;
  status: PublishedEndpointInvocationStatus | null;
  requestSource: PublishedEndpointInvocationRequestSource | null;
  requestSurface: PublishedEndpointInvocationRequestSurface | null;
  cacheStatus: PublishedEndpointInvocationCacheStatus | null;
  apiKeyId: string | null;
  reasonCode: string | null;
  timeWindow: PublishTimeWindow;
};
