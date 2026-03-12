import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkflowEditorWorkbench } from "@/components/workflow-editor-workbench";
import { WorkflowPublishPanel } from "@/components/workflow-publish-panel";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import {
  getPublishedEndpointApiKeys,
  type PublishedEndpointCacheInventoryResponse,
  getPublishedEndpointCacheInventory,
  getWorkflowPublishedEndpoints
} from "@/lib/get-workflow-publish";
import { getWorkflowRuns } from "@/lib/get-workflow-runs";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";

type WorkflowEditorPageProps = {
  params: Promise<{ workflowId: string }>;
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
  params
}: WorkflowEditorPageProps) {
  const { workflowId } = await params;
  const [workflow, workflows, workflowLibrary, recentRuns, publishedEndpoints] = await Promise.all([
    getWorkflowDetail(workflowId),
    getWorkflows(),
    getWorkflowLibrarySnapshot(),
    getWorkflowRuns(workflowId),
    getWorkflowPublishedEndpoints(workflowId, {
      includeAllVersions: true
    })
  ]);

  if (!workflow) {
    notFound();
  }

  const cacheInventoryEntries = await Promise.all(
    publishedEndpoints
      .filter((binding) => binding.cache_inventory?.enabled)
      .map(async (binding) => [
        binding.id,
        await getPublishedEndpointCacheInventory(workflow.id, binding.id)
      ] as const)
  );
  const cacheInventories = Object.fromEntries(
    cacheInventoryEntries
  ) as Record<string, PublishedEndpointCacheInventoryResponse | null>;
  const apiKeyEntries = await Promise.all(
    publishedEndpoints
      .filter((binding) => binding.auth_mode === "api_key")
      .map(async (binding) => [
        binding.id,
        await getPublishedEndpointApiKeys(workflow.id, binding.id)
      ] as const)
  );
  const apiKeysByBinding = Object.fromEntries(apiKeyEntries) as Record<
    string,
    Awaited<ReturnType<typeof getPublishedEndpointApiKeys>>
  >;

  return (
    <>
      <WorkflowEditorWorkbench
        workflow={workflow}
        workflows={workflows}
        nodeCatalog={workflowLibrary.nodes}
        nodeSourceLanes={workflowLibrary.nodeSourceLanes}
        toolSourceLanes={workflowLibrary.toolSourceLanes}
        tools={workflowLibrary.tools}
        recentRuns={recentRuns}
      />
      <WorkflowPublishPanel
        workflow={workflow}
        bindings={publishedEndpoints}
        cacheInventories={cacheInventories}
        apiKeysByBinding={apiKeysByBinding}
      />
    </>
  );
}
