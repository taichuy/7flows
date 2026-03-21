import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkflowEditorWorkbench } from "@/components/workflow-editor-workbench";
import { WorkflowPublishPanel } from "@/components/workflow-publish-panel";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpoints } from "@/lib/get-workflow-publish";
import { getWorkflowPublishGovernanceSnapshot } from "@/lib/get-workflow-publish-governance";
import { getWorkflowRuns } from "@/lib/get-workflow-runs";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
import type {
  WorkflowPublishInvocationActiveFilter
} from "@/lib/workflow-publish-governance";
import {
  resolvePublishWindowRange
} from "@/lib/workflow-publish-governance";
import { readWorkflowPublishActivityQueryScope } from "@/lib/workflow-publish-activity-query";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";

type WorkflowEditorPageProps = {
  params: Promise<{ workflowId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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

  const workspaceStarterViewState = readWorkspaceStarterLibraryViewState(
    resolvedSearchParams
  );
  const createWorkflowHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const workspaceStarterLibraryHref =
    buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    );
  const hasScopedWorkspaceStarterFilters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterViewState
  );
  const publishActivityQueryScope = readWorkflowPublishActivityQueryScope(
    resolvedSearchParams
  );

  const activeBindingId = publishActivityQueryScope.bindingId;
  const selectedRequestSurface = publishActivityQueryScope.requestSurface;
  const selectedCacheStatus = publishActivityQueryScope.cacheStatus;
  const requestedRunStatus = publishActivityQueryScope.runStatus;
  const requestedInvocationId = publishActivityQueryScope.invocationId;
  const publishTimeWindow = publishActivityQueryScope.timeWindow;
  const activeInvocationFilter =
    activeBindingId && publishedEndpoints.some((binding) => binding.id === activeBindingId)
      ? {
          bindingId: activeBindingId,
          status: publishActivityQueryScope.status ?? undefined,
          requestSource: publishActivityQueryScope.requestSource ?? undefined,
          requestSurface: selectedRequestSurface ?? undefined,
          cacheStatus: selectedCacheStatus ?? undefined,
          runStatus: requestedRunStatus ?? undefined,
          apiKeyId: publishActivityQueryScope.apiKeyId ?? undefined,
          reasonCode: publishActivityQueryScope.reasonCode ?? undefined,
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
          invocationId: requestedInvocationId ?? undefined
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
        sandboxBackends={systemOverview.sandbox_backends}
        recentRuns={recentRuns}
        createWorkflowHref={createWorkflowHref}
        workspaceStarterLibraryHref={workspaceStarterLibraryHref}
        hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
      />
      <WorkflowPublishPanel
        workflow={workflow}
        tools={pluginRegistry.tools}
        bindings={publishedEndpoints}
        cacheInventories={cacheInventories}
        apiKeysByBinding={apiKeysByBinding}
        invocationAuditsByBinding={invocationAuditsByBinding}
        invocationDetailsByBinding={invocationDetailsByBinding}
        selectedInvocationId={requestedInvocationId}
        rateLimitWindowAuditsByBinding={rateLimitWindowAuditsByBinding}
        callbackWaitingAutomation={systemOverview.callback_waiting_automation}
        sandboxReadiness={systemOverview.sandbox_readiness}
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
