import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkflowEditorWorkbench } from "@/components/workflow-editor-workbench";
import { WorkflowPublishPanel } from "@/components/workflow-publish-panel";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import {
  type PublishedEndpointInvocationCacheStatus,
  type PublishedEndpointInvocationRequestSurface,
  type PublishedEndpointInvocationRequestSource,
  type PublishedEndpointInvocationStatus,
  getWorkflowPublishedEndpoints
} from "@/lib/get-workflow-publish";
import { getWorkflowPublishGovernanceSnapshot } from "@/lib/get-workflow-publish-governance";
import { getWorkflowRuns } from "@/lib/get-workflow-runs";
import type {
  WorkflowPublishInvocationActiveFilter
} from "@/lib/workflow-publish-governance";
import {
  resolvePublishTimeWindow,
  resolvePublishWindowRange
} from "@/lib/workflow-publish-governance";
import {
  PUBLISHED_INVOCATION_CACHE_STATUSES,
  PUBLISHED_INVOCATION_REASON_CODES,
  PUBLISHED_INVOCATION_REQUEST_SURFACES
} from "@/lib/published-invocation-presenters";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";

type WorkflowEditorPageProps = {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PUBLISH_STATUSES: PublishedEndpointInvocationStatus[] = [
  "succeeded",
  "failed",
  "rejected"
];
const PUBLISH_REQUEST_SOURCES: PublishedEndpointInvocationRequestSource[] = [
  "workflow",
  "alias",
  "path"
];

function firstSearchValue(
  value: string | string[] | undefined
) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  params
}: WorkflowEditorPageProps): Promise<Metadata> {
  const { workflowId } = await params;

  return {
    title: `Workflow ${workflowId} | 7Flows Studio`
  };
}

export default async function WorkflowEditorPage({
  params,
  searchParams
}: WorkflowEditorPageProps) {
  const { workflowId } = await params;
  const resolvedSearchParams = await searchParams;
  const [workflow, workflows, workflowLibrary, pluginRegistry, systemOverview, recentRuns, publishedEndpoints] = await Promise.all([
    getWorkflowDetail(workflowId),
    getWorkflows(),
    getWorkflowLibrarySnapshot(),
    getPluginRegistrySnapshot(),
    getSystemOverview(),
    getWorkflowRuns(workflowId),
    getWorkflowPublishedEndpoints(workflowId, {
      includeAllVersions: true
    })
  ]);

  if (!workflow) {
    notFound();
  }

  const activeBindingId = firstSearchValue(resolvedSearchParams.publish_binding);
  const requestedStatus = firstSearchValue(resolvedSearchParams.publish_status);
  const requestedRequestSource = firstSearchValue(
    resolvedSearchParams.publish_request_source
  );
  const requestedRequestSurface = firstSearchValue(
    resolvedSearchParams.publish_request_surface
  );
  const requestedCacheStatus = firstSearchValue(
    resolvedSearchParams.publish_cache_status
  );
  const requestedRunStatus = firstSearchValue(
    resolvedSearchParams.publish_run_status
  );
  const requestedApiKeyId = firstSearchValue(resolvedSearchParams.publish_api_key_id);
  const requestedReasonCode = firstSearchValue(
    resolvedSearchParams.publish_reason_code
  );
  const requestedInvocationId = firstSearchValue(
    resolvedSearchParams.publish_invocation
  );
  const publishTimeWindow = resolvePublishTimeWindow(
    firstSearchValue(resolvedSearchParams.publish_window)
  );
  const selectedRequestSurface = PUBLISHED_INVOCATION_REQUEST_SURFACES.includes(
    requestedRequestSurface as PublishedEndpointInvocationRequestSurface
  )
    ? (requestedRequestSurface as PublishedEndpointInvocationRequestSurface)
    : null;
  const selectedCacheStatus = PUBLISHED_INVOCATION_CACHE_STATUSES.includes(
    requestedCacheStatus as PublishedEndpointInvocationCacheStatus
  )
    ? (requestedCacheStatus as PublishedEndpointInvocationCacheStatus)
    : null;
  const activeInvocationFilter =
    activeBindingId && publishedEndpoints.some((binding) => binding.id === activeBindingId)
      ? {
          bindingId: activeBindingId,
          status: PUBLISH_STATUSES.includes(
            requestedStatus as PublishedEndpointInvocationStatus
          )
            ? (requestedStatus as PublishedEndpointInvocationStatus)
            : undefined,
          requestSource: PUBLISH_REQUEST_SOURCES.includes(
            requestedRequestSource as PublishedEndpointInvocationRequestSource
          )
            ? (requestedRequestSource as PublishedEndpointInvocationRequestSource)
            : undefined,
          requestSurface: selectedRequestSurface ?? undefined,
          cacheStatus: selectedCacheStatus ?? undefined,
          runStatus: requestedRunStatus?.trim() ? requestedRunStatus.trim() : undefined,
          apiKeyId: requestedApiKeyId?.trim() ? requestedApiKeyId.trim() : undefined,
          reasonCode: PUBLISHED_INVOCATION_REASON_CODES.includes(
            requestedReasonCode as (typeof PUBLISHED_INVOCATION_REASON_CODES)[number]
          )
            ? requestedReasonCode
            : undefined,
          ...resolvePublishWindowRange(publishTimeWindow)
        }
      : null;

  const {
    cacheInventories,
    apiKeysByBinding,
    invocationAuditsByBinding,
    invocationDetailsByBinding,
    rateLimitWindowAuditsByBinding
  } = await getWorkflowPublishGovernanceSnapshot(workflow.id, publishedEndpoints, {
    activeInvocationFilter: activeInvocationFilter
      ? {
          ...activeInvocationFilter,
          invocationId: requestedInvocationId?.trim() ? requestedInvocationId.trim() : undefined
        }
      : null
  });

  return (
    <>
      <WorkflowEditorWorkbench
        workflow={workflow}
        workflows={workflows}
        nodeCatalog={workflowLibrary.nodes}
        nodeSourceLanes={workflowLibrary.nodeSourceLanes}
        toolSourceLanes={workflowLibrary.toolSourceLanes}
        tools={workflowLibrary.tools}
        adapters={pluginRegistry.adapters}
        sandboxReadiness={systemOverview.sandbox_readiness}
        recentRuns={recentRuns}
      />
      <WorkflowPublishPanel
        workflow={workflow}
        tools={pluginRegistry.tools}
        bindings={publishedEndpoints}
        cacheInventories={cacheInventories}
        apiKeysByBinding={apiKeysByBinding}
        invocationAuditsByBinding={invocationAuditsByBinding}
        invocationDetailsByBinding={invocationDetailsByBinding}
        selectedInvocationId={requestedInvocationId?.trim() ? requestedInvocationId.trim() : null}
        rateLimitWindowAuditsByBinding={rateLimitWindowAuditsByBinding}
        activeInvocationFilter={{
          bindingId: activeInvocationFilter?.bindingId ?? null,
          status: activeInvocationFilter?.status ?? null,
          requestSource: activeInvocationFilter?.requestSource ?? null,
          requestSurface: activeInvocationFilter?.requestSurface ?? selectedRequestSurface,
          cacheStatus: activeInvocationFilter?.cacheStatus ?? selectedCacheStatus,
          runStatus: activeInvocationFilter?.runStatus ?? requestedRunStatus?.trim() ?? null,
          apiKeyId: activeInvocationFilter?.apiKeyId ?? null,
          reasonCode: activeInvocationFilter?.reasonCode ?? null,
          timeWindow: publishTimeWindow
        } satisfies WorkflowPublishInvocationActiveFilter}
      />
    </>
  );
}
