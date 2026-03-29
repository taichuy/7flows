import { WorkspaceAppListStage } from "@/components/workspace-apps-workbench/workspace-app-list-stage";
import { WorkspaceBrowseRail } from "@/components/workspace-apps-workbench/workspace-browse-rail";
import { WorkspaceCatalogHeader } from "@/components/workspace-apps-workbench/workspace-catalog-header";
import { WorkspaceCreateStrip } from "@/components/workspace-apps-workbench/workspace-create-strip";
import {
  getWorkspaceScopeSummary,
  type WorkspaceAppsWorkbenchProps
} from "@/components/workspace-apps-workbench/shared";

export function WorkspaceAppsWorkbench({
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
  quickCreateEntries,
  workspaceUtilityEntry,
  starterHighlights,
  starterCount,
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
          <WorkspaceCatalogHeader
            currentRoleLabel={currentRoleLabel}
            catalogDescription={catalogDescription}
            requestedKeyword={requestedKeyword}
            searchState={searchState}
          />

          <WorkspaceBrowseRail
            currentScopeSummary={currentScopeSummary}
            modeTabs={modeTabs}
            scopePills={scopePills}
            statusFilters={statusFilters}
            variant="inline"
            workspaceSignals={workspaceSignals}
          />

          <section className="workspace-catalog-stage">
            <WorkspaceCreateStrip
              quickCreateEntries={quickCreateEntries}
              requestedKeyword={requestedKeyword}
              starterCount={starterCount}
              starterHighlights={starterHighlights}
              workspaceUtilityEntry={workspaceUtilityEntry}
            />

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
