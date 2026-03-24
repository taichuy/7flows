import type { Metadata } from "next";

import { WorkflowCreateWizard } from "@/components/workflow-create-wizard";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import {
  hasScopedWorkspaceStarterGovernanceFilters,
  pickWorkspaceStarterGovernanceQueryScope,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
import { getWorkflows } from "@/lib/get-workflows";

export const metadata: Metadata = {
  title: "New Workflow | 7Flows Studio"
};

type NewWorkflowPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewWorkflowPage({ searchParams }: NewWorkflowPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const workspaceStarterViewState = readWorkspaceStarterLibraryViewState(resolvedSearchParams);
  const shouldScopeWorkspaceStarters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterViewState
  );
  const [workflowLibrary, workflows, legacyAuthGovernanceSnapshot] = await Promise.all([
    getWorkflowLibrarySnapshot({
      businessTrack:
        workspaceStarterViewState.activeTrack === "all"
          ? undefined
          : workspaceStarterViewState.activeTrack,
      search: workspaceStarterViewState.searchQuery,
      sourceGovernanceKind:
        workspaceStarterViewState.sourceGovernanceKind === "all"
          ? undefined
          : workspaceStarterViewState.sourceGovernanceKind,
      needsFollowUp: workspaceStarterViewState.needsFollowUp,
      includeBuiltinStarters: !shouldScopeWorkspaceStarters
    }),
    getWorkflows(),
    getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot()
  ]);

  return (
    <WorkflowCreateWizard
      catalogToolCount={workflowLibrary.tools.length}
      governanceQueryScope={pickWorkspaceStarterGovernanceQueryScope(workspaceStarterViewState)}
      legacyAuthGovernanceSnapshot={legacyAuthGovernanceSnapshot}
      starters={workflowLibrary.starters}
      starterSourceLanes={workflowLibrary.starterSourceLanes}
      nodeCatalog={workflowLibrary.nodes}
      tools={workflowLibrary.tools}
      workflows={workflows}
    />
  );
}
