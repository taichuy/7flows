import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  WorkflowLibrarySourceLane,
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkflowListItem } from "@/lib/get-workflows";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-types";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";
import type { WorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import type { WorkspaceStarterSourceGovernanceKind } from "@/lib/get-workspace-starters";

export type WorkflowCreateWizardBootstrapRequest = {
  governanceQueryScope: WorkspaceStarterGovernanceQueryScope;
  includeLegacyAuthGovernanceSnapshot: boolean;
  libraryQuery: {
    businessTrack?: WorkflowBusinessTrack;
    search?: string;
    sourceGovernanceKind?: WorkspaceStarterSourceGovernanceKind;
    needsFollowUp: boolean;
    includeBuiltinStarters: boolean;
    includeStarterDefinitions: true;
  };
};

export type WorkflowCreateWizardEntryProps = {
  bootstrapRequest: WorkflowCreateWizardBootstrapRequest;
};

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
