import type { PluginAdapterRegistryItem, PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { CredentialItem } from "@/lib/get-credentials";
import type {
  CallbackWaitingAutomationCheck,
  SandboxBackendCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type {
  WorkflowLibrarySourceLane,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type {
  WorkflowDetail,
  WorkflowListItem
} from "@/lib/get-workflows";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";

export type WorkflowEditorWorkbenchProps = {
  workflow: WorkflowDetail;
  workflows: WorkflowListItem[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
  initialCredentials?: CredentialItem[];
  initialRecentRuns?: WorkflowRunListItem[];
  currentEditorHref?: string;
  workflowLibraryHref?: string;
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
  hasScopedWorkspaceStarterFilters?: boolean;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
};
