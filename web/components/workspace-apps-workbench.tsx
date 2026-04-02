import { WorkspaceAppListStage } from "@/components/workspace-apps-workbench/workspace-app-list-stage";
import { WorkspaceBrowseRail } from "@/components/workspace-apps-workbench/workspace-browse-rail";
import { WorkspaceCatalogHeader } from "@/components/workspace-apps-workbench/workspace-catalog-header";
import {
  getWorkspaceScopeSummary,
  type WorkspaceAppsWorkbenchProps
} from "@/components/workspace-apps-workbench/shared";

export function WorkspaceAppsWorkbench({
  workspaceName,
  currentRoleLabel,
  currentUserDisplayName,
  requestedKeyword,
  activeModeLabel,
  activeModeDescription,
  visibleAppSummary,
  modeTabs,
  scopePills,
  statusFilters,
  workspaceSignals,
  focusedCreateHref,
  workspaceUtilityEntry,
  starterCount,
  workflowCreateWizardProps,
  filteredApps,
  searchState
}: WorkspaceAppsWorkbenchProps) {
  const currentScopeSummary = getWorkspaceScopeSummary({
    activeModeDescription,
    activeModeLabel,
    requestedKeyword
  });
  const catalogDescription = requestedKeyword
    ? `当前按“${requestedKeyword}”筛选，命中后直接进入 Studio。`
    : activeModeLabel
      ? `当前聚焦 ${activeModeLabel}。`
      : "创建、筛选后直接进入 Studio。";

  return (
    <main className="workspace-main workspace-home-main workspace-home-main-flat workspace-board-page">
      <section className="workspace-apps-dify-shell">
        <section className="workspace-apps-dify-stage">
          <section className="workspace-board-overview" data-component="workspace-board-overview">
          <WorkspaceCatalogHeader
            workspaceName={workspaceName}
            currentRoleLabel={currentRoleLabel}
            catalogDescription={catalogDescription}
            workspaceSignals={workspaceSignals}
          />

          <WorkspaceBrowseRail
            currentScopeSummary={currentScopeSummary}
            modeTabs={modeTabs}
            scopePills={scopePills}
            statusFilters={statusFilters}
            requestedKeyword={requestedKeyword}
            searchState={searchState}
            focusedCreateHref={focusedCreateHref}
            workspaceUtilityEntry={workspaceUtilityEntry}
          />
          </section>

          <section className="workspace-catalog-stage">
            <WorkspaceAppListStage
              activeModeLabel={activeModeLabel}
              currentUserDisplayName={currentUserDisplayName}
              filteredApps={filteredApps}
              visibleAppSummary={visibleAppSummary}
            />
          </section>
        </section>
      </section>
    </main>
  );
}
