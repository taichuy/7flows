import type {
  PublishedEndpointInvocationCacheStatus,
  PublishedEndpointInvocationRequestSource,
  PublishedEndpointInvocationRequestSurface,
  PublishedEndpointInvocationStatus,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import type { WorkflowPublishInvocationFetchFilter } from "@/lib/get-workflow-publish-governance";
import {
  PUBLISHED_INVOCATION_CACHE_STATUSES,
  PUBLISHED_INVOCATION_REASON_CODES,
  PUBLISHED_INVOCATION_REQUEST_SURFACES
} from "@/lib/published-invocation-presenters";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";
import {
  type WorkflowPublishInvocationActiveFilter,
  resolvePublishWindowRange,
  resolvePublishTimeWindow
} from "@/lib/workflow-publish-governance";

export type WorkflowPublishActivitySearchParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

export type WorkflowPublishActivityQueryScope = WorkflowPublishInvocationActiveFilter & {
  invocationId: string | null;
};

export type WorkflowPublishActivityResolvedFilters = {
  governanceFetchFilter: WorkflowPublishInvocationFetchFilter | null;
  panelActiveFilter: WorkflowPublishInvocationActiveFilter;
  selectedInvocationId: string | null;
};

type WorkflowPublishActivityHrefOptions = {
  workflowId: string;
  bindingId?: string | null;
  activeInvocationFilter?: WorkflowPublishInvocationActiveFilter | null;
  invocationId?: string | null;
};

const PUBLISH_STATUSES = new Set<PublishedEndpointInvocationStatus>([
  "succeeded",
  "failed",
  "rejected"
]);
const PUBLISH_REQUEST_SOURCES = new Set<PublishedEndpointInvocationRequestSource>([
  "workflow",
  "alias",
  "path"
]);
const PUBLISH_REQUEST_SURFACES = new Set<PublishedEndpointInvocationRequestSurface>(
  PUBLISHED_INVOCATION_REQUEST_SURFACES
);
const PUBLISH_CACHE_STATUSES = new Set<PublishedEndpointInvocationCacheStatus>(
  PUBLISHED_INVOCATION_CACHE_STATUSES
);
const PUBLISH_REASON_CODES = new Set<string>(PUBLISHED_INVOCATION_REASON_CODES);

export const DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE: WorkflowPublishActivityQueryScope = {
  bindingId: null,
  status: null,
  requestSource: null,
  requestSurface: null,
  cacheStatus: null,
  runStatus: null,
  apiKeyId: null,
  reasonCode: null,
  timeWindow: "all",
  invocationId: null
};

export function readWorkflowPublishActivityQueryScope(
  searchParams: WorkflowPublishActivitySearchParamSource
): WorkflowPublishActivityQueryScope {
  const requestedStatus = firstSearchValue(searchParams, "publish_status");
  const requestedRequestSource = firstSearchValue(
    searchParams,
    "publish_request_source"
  );
  const requestedRequestSurface = firstSearchValue(
    searchParams,
    "publish_request_surface"
  );
  const requestedCacheStatus = firstSearchValue(searchParams, "publish_cache_status");
  const requestedReasonCode = firstSearchValue(searchParams, "publish_reason_code");

  return {
    bindingId: firstSearchValue(searchParams, "publish_binding") ?? null,
    status: PUBLISH_STATUSES.has(requestedStatus as PublishedEndpointInvocationStatus)
      ? (requestedStatus as PublishedEndpointInvocationStatus)
      : DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.status,
    requestSource: PUBLISH_REQUEST_SOURCES.has(
      requestedRequestSource as PublishedEndpointInvocationRequestSource
    )
      ? (requestedRequestSource as PublishedEndpointInvocationRequestSource)
      : DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.requestSource,
    requestSurface: PUBLISH_REQUEST_SURFACES.has(
      requestedRequestSurface as PublishedEndpointInvocationRequestSurface
    )
      ? (requestedRequestSurface as PublishedEndpointInvocationRequestSurface)
      : DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.requestSurface,
    cacheStatus: PUBLISH_CACHE_STATUSES.has(
      requestedCacheStatus as PublishedEndpointInvocationCacheStatus
    )
      ? (requestedCacheStatus as PublishedEndpointInvocationCacheStatus)
      : DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.cacheStatus,
    runStatus: firstSearchValue(searchParams, "publish_run_status") ?? null,
    apiKeyId: firstSearchValue(searchParams, "publish_api_key_id") ?? null,
    reasonCode: requestedReasonCode && PUBLISH_REASON_CODES.has(requestedReasonCode)
      ? requestedReasonCode
      : DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.reasonCode,
    timeWindow: resolvePublishTimeWindow(
      firstSearchValue(searchParams, "publish_window")
    ),
    invocationId: firstSearchValue(searchParams, "publish_invocation") ?? null
  };
}

export function buildWorkflowPublishActivitySearchParams(
  queryScope: Partial<WorkflowPublishActivityQueryScope> | null | undefined
) {
  const searchParams = new URLSearchParams();
  const normalizedBindingId = normalizeOptionalQueryValue(queryScope?.bindingId);
  const normalizedRunStatus = normalizeOptionalQueryValue(queryScope?.runStatus);
  const normalizedApiKeyId = normalizeOptionalQueryValue(queryScope?.apiKeyId);
  const normalizedReasonCode = normalizeOptionalQueryValue(queryScope?.reasonCode);
  const normalizedInvocationId = normalizeOptionalQueryValue(queryScope?.invocationId);
  const timeWindow = queryScope?.timeWindow ?? DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.timeWindow;

  if (normalizedBindingId) {
    searchParams.set("publish_binding", normalizedBindingId);
  }
  if (queryScope?.status) {
    searchParams.set("publish_status", queryScope.status);
  }
  if (queryScope?.requestSource) {
    searchParams.set("publish_request_source", queryScope.requestSource);
  }
  if (queryScope?.requestSurface) {
    searchParams.set("publish_request_surface", queryScope.requestSurface);
  }
  if (queryScope?.cacheStatus) {
    searchParams.set("publish_cache_status", queryScope.cacheStatus);
  }
  if (normalizedRunStatus) {
    searchParams.set("publish_run_status", normalizedRunStatus);
  }
  if (normalizedApiKeyId) {
    searchParams.set("publish_api_key_id", normalizedApiKeyId);
  }
  if (normalizedReasonCode) {
    searchParams.set("publish_reason_code", normalizedReasonCode);
  }
  if (timeWindow !== DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.timeWindow) {
    searchParams.set("publish_window", timeWindow);
  }
  if (normalizedInvocationId) {
    searchParams.set("publish_invocation", normalizedInvocationId);
  }

  return searchParams;
}

export function buildWorkflowPublishActivityHref({
  workflowId,
  bindingId,
  activeInvocationFilter,
  invocationId
}: WorkflowPublishActivityHrefOptions) {
  const workflowHref = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId,
    variant: "editor"
  }).href;
  const searchParams = buildWorkflowPublishActivitySearchParams({
    bindingId: normalizeOptionalQueryValue(bindingId) ?? activeInvocationFilter?.bindingId ?? null,
    status: activeInvocationFilter?.status ?? null,
    requestSource: activeInvocationFilter?.requestSource ?? null,
    requestSurface: activeInvocationFilter?.requestSurface ?? null,
    cacheStatus: activeInvocationFilter?.cacheStatus ?? null,
    runStatus: activeInvocationFilter?.runStatus ?? null,
    apiKeyId: activeInvocationFilter?.apiKeyId ?? null,
    reasonCode: activeInvocationFilter?.reasonCode ?? null,
    timeWindow: activeInvocationFilter?.timeWindow ?? DEFAULT_WORKFLOW_PUBLISH_ACTIVITY_QUERY_SCOPE.timeWindow,
    invocationId: invocationId ?? null
  });
  const query = searchParams.toString();

  return query ? `${workflowHref}?${query}` : workflowHref;
}

export function resolveWorkflowPublishActivityFilters(
  queryScope: WorkflowPublishActivityQueryScope,
  bindings: ReadonlyArray<Pick<WorkflowPublishedEndpointItem, "id">>
): WorkflowPublishActivityResolvedFilters {
  const resolvedBindingId =
    queryScope.bindingId && bindings.some((binding) => binding.id === queryScope.bindingId)
      ? queryScope.bindingId
      : null;

  return {
    governanceFetchFilter: resolvedBindingId
      ? {
          bindingId: resolvedBindingId,
          invocationId: queryScope.invocationId ?? undefined,
          status: queryScope.status ?? undefined,
          requestSource: queryScope.requestSource ?? undefined,
          requestSurface: queryScope.requestSurface ?? undefined,
          cacheStatus: queryScope.cacheStatus ?? undefined,
          runStatus: queryScope.runStatus ?? undefined,
          apiKeyId: queryScope.apiKeyId ?? undefined,
          reasonCode: queryScope.reasonCode ?? undefined,
          ...resolvePublishWindowRange(queryScope.timeWindow)
        }
      : null,
    panelActiveFilter: {
      bindingId: resolvedBindingId,
      status: resolvedBindingId ? queryScope.status : null,
      requestSource: resolvedBindingId ? queryScope.requestSource : null,
      requestSurface: queryScope.requestSurface,
      cacheStatus: queryScope.cacheStatus,
      runStatus: queryScope.runStatus,
      apiKeyId: resolvedBindingId ? queryScope.apiKeyId : null,
      reasonCode: resolvedBindingId ? queryScope.reasonCode : null,
      timeWindow: queryScope.timeWindow
    },
    selectedInvocationId: resolvedBindingId ? queryScope.invocationId : null
  };
}

function firstSearchValue(
  searchParams: WorkflowPublishActivitySearchParamSource,
  key: string
) {
  if (searchParams instanceof URLSearchParams) {
    return normalizeOptionalQueryValue(searchParams.get(key)) ?? undefined;
  }

  const value = searchParams[key];
  if (typeof value === "string") {
    return normalizeOptionalQueryValue(value) ?? undefined;
  }

  if (Array.isArray(value)) {
    return normalizeOptionalQueryValue(value[0]) ?? undefined;
  }

  return undefined;
}

function normalizeOptionalQueryValue(value: string | null | undefined) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : null;
}
