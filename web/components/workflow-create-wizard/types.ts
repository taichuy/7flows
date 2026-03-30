import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import type {
  WorkflowLibrarySourceLane,
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkflowListItem } from "@/lib/get-workflows";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";

export type WorkflowCreateWizardProps = {
  catalogToolCount: number;
  governanceQueryScope: WorkspaceStarterGovernanceQueryScope;
  legacyAuthGovernanceSnapshot?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workflows: WorkflowListItem[];
  starters: WorkflowLibraryStarterItem[];
  starterSourceLanes: WorkflowLibrarySourceLane[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  tools: PluginToolRegistryItem[];
};
