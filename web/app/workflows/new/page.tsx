import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WorkflowCreateWizardEntry } from "@/components/workflow-create-wizard-entry";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import {
  hasScopedWorkspaceStarterGovernanceFilters,
  pickWorkspaceStarterGovernanceQueryScope,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";

export const metadata: Metadata = {
  title: "New Workflow | 7Flows Studio"
};

type NewWorkflowPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewWorkflowPage({ searchParams }: NewWorkflowPageProps) {
  const workspaceContext = await getServerWorkspaceContext();
  if (!workspaceContext) {
    redirect("/login?next=/workflows/new");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const workspaceStarterViewState = readWorkspaceStarterLibraryViewState(resolvedSearchParams);
  const shouldScopeWorkspaceStarters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterViewState
  );
  const governanceQueryScope = pickWorkspaceStarterGovernanceQueryScope(
    workspaceStarterViewState
  );
  const shouldLoadLegacyAuthGovernanceSnapshot =
    shouldScopeWorkspaceStarters || workspaceStarterViewState.selectedTemplateId !== null;

  return (
    <WorkspaceShell
      activeNav="workflows"
      layout="focused"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      <div className="workspace-main workspace-workflow-create-main">
        <WorkflowCreateWizardEntry
          bootstrapRequest={{
            governanceQueryScope,
            includeLegacyAuthGovernanceSnapshot: shouldLoadLegacyAuthGovernanceSnapshot,
            libraryQuery: {
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
              includeBuiltinStarters: !shouldScopeWorkspaceStarters,
              includeStarterDefinitions: true
            }
          }}
        />
      </div>
    </WorkspaceShell>
  );
}
