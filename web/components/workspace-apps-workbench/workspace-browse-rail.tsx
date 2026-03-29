import Link from "next/link";

import type {
  WorkspaceModeTab,
  WorkspaceScopePill,
  WorkspaceSignal,
  WorkspaceStatusFilter
} from "@/components/workspace-apps-workbench/shared";

function WorkspaceScopePills({ scopePills }: { scopePills: WorkspaceScopePill[] }) {
  if (scopePills.length === 0) {
    return null;
  }

  return (
    <div className="workspace-scope-pills" aria-label="Workspace scopes">
      {scopePills.map((scopePill) => (
        <Link className="workspace-scope-pill" href={scopePill.href} key={scopePill.key}>
          <span>{scopePill.label}</span>
          <strong>{scopePill.value}</strong>
        </Link>
      ))}
    </div>
  );
}

export function WorkspaceBrowseRail({
  currentScopeSummary,
  modeTabs,
  statusFilters,
  workspaceSignals,
  scopePills,
  variant = "rail"
}: {
  currentScopeSummary: string;
  modeTabs: WorkspaceModeTab[];
  statusFilters: WorkspaceStatusFilter[];
  workspaceSignals: WorkspaceSignal[];
  scopePills: WorkspaceScopePill[];
  variant?: "rail" | "inline";
}) {
  const isInline = variant === "inline";

  return (
    <section
      className={`workspace-filter-rail workspace-catalog-card ${isInline ? "workspace-filter-rail-inline" : ""}`.trim()}
      aria-label="Workspace filters"
      data-component="workspace-browse-rail"
    >
      <div
        className={`workspace-filter-rail-header ${isInline ? "workspace-filter-rail-header-inline" : ""}`.trim()}
      >
        <div className="workspace-filter-rail-copy">
          <p className="workspace-app-card-caption">Directory</p>
          <h2>{isInline ? "应用目录" : "筛选应用"}</h2>
          <p className="workspace-muted workspace-card-copy">{currentScopeSummary}</p>
        </div>

        {isInline ? (
          <div className="workspace-filter-rail-signal-grid workspace-filter-rail-signal-grid-inline">
            {workspaceSignals.map((signal) => (
              <article className="workspace-filter-rail-signal" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`workspace-filter-rail-body ${isInline ? "workspace-filter-rail-body-inline" : ""}`.trim()}>
        <div className="workspace-filter-rail-group">
          <span className="workspace-filter-rail-label">应用类型</span>
          <div className="workspace-filter-rail-tab-list" aria-label="App modes">
            {modeTabs.map((modeTab) => (
              <Link
                className={`workspace-filter-rail-tab ${modeTab.active ? "active" : ""}`.trim()}
                href={modeTab.href}
                key={modeTab.key}
              >
                <span>{modeTab.label}</span>
                <strong>{modeTab.count}</strong>
              </Link>
            ))}
          </div>
        </div>

        <div className="workspace-filter-rail-group">
          <span className="workspace-filter-rail-label">状态</span>
          <div className="workspace-filter-row workspace-filter-row-board workspace-filter-rail-chip-list">
            {statusFilters.map((statusFilter) => (
              <Link
                className={`workspace-filter-chip ${statusFilter.active ? "active" : ""}`}
                href={statusFilter.href}
                key={statusFilter.key}
              >
                {statusFilter.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {!isInline ? (
        <div className="workspace-filter-rail-group">
          <span className="workspace-filter-rail-label">工作台信号</span>
          <div className="workspace-filter-rail-signal-grid">
            {workspaceSignals.map((signal) => (
              <article className="workspace-filter-rail-signal" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {scopePills.length > 0 ? <WorkspaceScopePills scopePills={scopePills} /> : null}
    </section>
  );
}
