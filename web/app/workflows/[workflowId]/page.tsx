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
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  pickWorkspaceStarterGovernanceQueryScope,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
import {
  readWorkflowPublishActivityQueryScope,
  resolveWorkflowPublishActivityFilters
} from "@/lib/workflow-publish-activity-query";
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
  const workflowLibraryHref = buildWorkflowLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const createWorkflowHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const workspaceStarterLibraryHref =
    buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    );
  const workspaceStarterGovernanceQueryScope = pickWorkspaceStarterGovernanceQueryScope(
    workspaceStarterViewState
  );
  const hasScopedWorkspaceStarterFilters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterViewState
  );
  const publishActivityQueryScope = readWorkflowPublishActivityQueryScope(
    resolvedSearchParams
  );
  const publishActivityFilters = resolveWorkflowPublishActivityFilters(
    publishActivityQueryScope,
    publishedEndpoints
  );

  const {
    cacheInventories,
    apiKeysByBinding,
    invocationAuditsByBinding,
    invocationDetailsByBinding,
    rateLimitWindowAuditsByBinding
  } = await getWorkflowPublishGovernanceSnapshot(workflow.id, publishedEndpoints, {
    activeInvocationFilter: publishActivityFilters.governanceFetchFilter
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
        callbackWaitingAutomation={systemOverview.callback_waiting_automation}
        sandboxReadiness={systemOverview.sandbox_readiness}
        sandboxBackends={systemOverview.sandbox_backends}
        recentRuns={recentRuns}
        workflowLibraryHref={workflowLibraryHref}
        createWorkflowHref={createWorkflowHref}
        workspaceStarterLibraryHref={workspaceStarterLibraryHref}
        hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
        workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
      />
      <WorkflowPublishPanel
        workflow={workflow}
        tools={pluginRegistry.tools}
        bindings={publishedEndpoints}
        cacheInventories={cacheInventories}
        apiKeysByBinding={apiKeysByBinding}
        invocationAuditsByBinding={invocationAuditsByBinding}
        invocationDetailsByBinding={invocationDetailsByBinding}
        selectedInvocationId={publishActivityFilters.selectedInvocationId}
        rateLimitWindowAuditsByBinding={rateLimitWindowAuditsByBinding}
        callbackWaitingAutomation={systemOverview.callback_waiting_automation}
        sandboxReadiness={systemOverview.sandbox_readiness}
        activeInvocationFilter={publishActivityFilters.panelActiveFilter}
        workflowLibraryHref={workflowLibraryHref}
        workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
      />
    </>
  );
}
