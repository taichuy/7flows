type ServerSnapshotFetchOptions = Pick<RequestInit, "next">;

const WORKFLOW_INVENTORY_REVALIDATE_SECONDS = 5;
const WORKFLOW_LIBRARY_REVALIDATE_SECONDS = 30;
const PLUGIN_REGISTRY_REVALIDATE_SECONDS = 30;
const SYSTEM_OVERVIEW_REVALIDATE_SECONDS = 15;

export const AUTHORING_SNAPSHOT_TAGS = {
  workflowInventory: "authoring-workflow-inventory",
  workflowDetail: "authoring-workflow-detail",
  workflowLibrary: "authoring-workflow-library",
  pluginRegistry: "authoring-plugin-registry",
  systemOverview: "authoring-system-overview"
} as const;

function buildSnapshotFetchOptions(
  revalidate: number,
  tags: readonly string[]
): ServerSnapshotFetchOptions {
  return {
    next: {
      revalidate,
      tags: [...tags]
    }
  };
}

export function getWorkflowInventoryFetchOptions(): ServerSnapshotFetchOptions {
  return buildSnapshotFetchOptions(WORKFLOW_INVENTORY_REVALIDATE_SECONDS, [
    AUTHORING_SNAPSHOT_TAGS.workflowInventory
  ]);
}

export function getWorkflowDetailFetchOptions(workflowId: string): ServerSnapshotFetchOptions {
  return buildSnapshotFetchOptions(WORKFLOW_INVENTORY_REVALIDATE_SECONDS, [
    AUTHORING_SNAPSHOT_TAGS.workflowInventory,
    `${AUTHORING_SNAPSHOT_TAGS.workflowDetail}:${workflowId}`
  ]);
}

export function getWorkflowLibraryFetchOptions(): ServerSnapshotFetchOptions {
  return buildSnapshotFetchOptions(WORKFLOW_LIBRARY_REVALIDATE_SECONDS, [
    AUTHORING_SNAPSHOT_TAGS.workflowLibrary
  ]);
}

export function getPluginRegistryFetchOptions(): ServerSnapshotFetchOptions {
  return buildSnapshotFetchOptions(PLUGIN_REGISTRY_REVALIDATE_SECONDS, [
    AUTHORING_SNAPSHOT_TAGS.pluginRegistry
  ]);
}

export function getSystemOverviewFetchOptions(): ServerSnapshotFetchOptions {
  return buildSnapshotFetchOptions(SYSTEM_OVERVIEW_REVALIDATE_SECONDS, [
    AUTHORING_SNAPSHOT_TAGS.systemOverview
  ]);
}
