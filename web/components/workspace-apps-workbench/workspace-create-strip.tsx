import Link from "next/link";

import type {
  WorkspaceQuickCreateEntry,
  WorkspaceStarterHighlight
} from "@/components/workspace-apps-workbench/shared";

export function WorkspaceCreateStrip({
  quickCreateEntries,
  requestedKeyword,
  starterCount,
  starterHighlights,
  workspaceUtilityEntry
}: {
  quickCreateEntries: WorkspaceQuickCreateEntry[];
  requestedKeyword: string;
  starterCount: number;
  starterHighlights: WorkspaceStarterHighlight[];
  workspaceUtilityEntry: WorkspaceQuickCreateEntry | null;
}) {
  const [primaryEntry, ...secondaryEntries] = quickCreateEntries;
  const visibleSecondaryEntries = secondaryEntries.slice(0, 1);
  const primaryStarter = starterHighlights[0] ?? null;

  return (
    <section
      className="workspace-create-strip workspace-catalog-card"
      aria-label="Workspace create strip"
      data-component="workspace-create-strip"
    >
      <div className="workspace-create-strip-copy">
        <p className="workspace-app-card-caption">Create</p>
        <h3>快速新建</h3>
        <p className="workspace-muted workspace-card-copy workspace-create-strip-summary">
          把创建入口收回主区，先选路径，再进入 Studio。
        </p>
        <div className="workspace-create-strip-footnotes">
          <span className="workspace-app-footnote">Starter {starterCount} 个</span>
          <span className="workspace-app-footnote">
            {requestedKeyword ? `当前搜索：${requestedKeyword}` : "创建页沿用当前筛选"}
          </span>
        </div>
      </div>

      <div className="workspace-create-strip-actions">
        {primaryEntry ? (
          <Link className="workspace-create-strip-primary" href={primaryEntry.href}>
            <div>
              <span>{primaryEntry.title}</span>
              <small>{primaryEntry.detail}</small>
            </div>
            <strong>{primaryEntry.badge}</strong>
          </Link>
        ) : null}

        <div className="workspace-create-strip-secondary-list">
          {visibleSecondaryEntries.map((entry) => (
            <Link className="workspace-create-strip-action" href={entry.href} key={entry.title}>
              <div>
                <span>{entry.title}</span>
                <small>{entry.detail}</small>
              </div>
              <strong>{entry.badge}</strong>
            </Link>
          ))}

          {workspaceUtilityEntry ? (
            <Link className="workspace-create-strip-action" href={workspaceUtilityEntry.href}>
              <div>
                <span>{workspaceUtilityEntry.title}</span>
                <small>{workspaceUtilityEntry.detail}</small>
              </div>
              <strong>{workspaceUtilityEntry.badge}</strong>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="workspace-create-strip-footer">
        {primaryStarter ? (
          <Link className="workspace-create-strip-starter" href={primaryStarter.href}>
            <span>推荐 Starter</span>
            <strong>{primaryStarter.name}</strong>
            <small>{primaryStarter.priority} · {primaryStarter.modeShortLabel}</small>
          </Link>
        ) : (
          <div className="workspace-create-strip-starter">
            <span>推荐 Starter</span>
            <strong>Blank Flow</strong>
            <small>保留最小 trigger → output 骨架。</small>
          </div>
        )}
      </div>
    </section>
  );
}
