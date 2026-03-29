import Link from "next/link";

import { formatTimestamp } from "@/lib/runtime-presenters";
import { getWorkspaceAppSurface, getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

type WorkspaceModeTab = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
};

type WorkspaceScopePill = {
  key: string;
  label: string;
  value: string;
  href: string;
};

type WorkspaceStatusFilter = {
  key: string;
  label: string;
  href: string;
  active: boolean;
};

type WorkspaceSignal = {
  label: string;
  value: string;
};

type WorkspaceQuickCreateEntry = {
  title: string;
  detail: string;
  href: string;
  badge: string;
};

type WorkspaceStarterHighlight = {
  id: string;
  name: string;
  description: string;
  href: string;
  track: string;
  priority: string;
  modeShortLabel: string;
};

type WorkspaceAppCard = {
  id: string;
  name: string;
  href: string;
  status: string;
  healthLabel: string;
  recommendedNextStep: string;
  updatedAt: string;
  nodeCount: number;
  publishCount: number;
  missingToolCount: number;
  followUpCount: number;
  mode: {
    label: string;
    shortLabel: string;
  };
  track: {
    id: string;
    priority: string;
    focus: string;
    summary: string;
  };
};

type WorkspaceAppsWorkbenchProps = {
  workspaceName: string;
  currentRoleLabel: string;
  currentUserDisplayName: string;
  requestedKeyword: string;
  activeModeLabel: string | null;
  activeModeDescription: string;
  visibleAppSummary: string;
  modeTabs: WorkspaceModeTab[];
  scopePills: WorkspaceScopePill[];
  statusFilters: WorkspaceStatusFilter[];
  workspaceSignals: WorkspaceSignal[];
  quickCreateEntries: WorkspaceQuickCreateEntry[];
  workspaceUtilityEntry: WorkspaceQuickCreateEntry | null;
  starterHighlights: WorkspaceStarterHighlight[];
  starterCount: number;
  filteredApps: WorkspaceAppCard[];
  searchState: {
    filter: string | null;
    mode: string | null;
    track: string | null;
    clearHref: string | null;
  };
};

function getWorkspaceScopeSummary({
  activeModeDescription,
  activeModeLabel,
  requestedKeyword
}: {
  activeModeDescription: string;
  activeModeLabel: string | null;
  requestedKeyword: string;
}) {
  return requestedKeyword
    ? `已按“${requestedKeyword}”聚焦应用`
    : activeModeLabel
      ? `当前筛选：${activeModeLabel}`
      : "全部应用";
}

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

function WorkspaceBrowseRail({
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

function WorkspaceCreateStrip({
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
    <aside className="workspace-create-strip workspace-catalog-card" aria-label="Workspace create strip">
      <div className="workspace-create-strip-copy">
        <p className="workspace-app-card-caption">Create</p>
        <h3>快速新建</h3>
        <p className="workspace-muted workspace-card-copy workspace-create-strip-summary">
          主入口直达 Studio，其它治理和团队入口退到次级。
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
            <span>Starter 起点</span>
            <strong>{primaryStarter.name}</strong>
            <small>{primaryStarter.priority} · {primaryStarter.modeShortLabel}</small>
          </Link>
        ) : (
          <div className="workspace-create-strip-starter">
            <span>Starter 起点</span>
            <strong>Blank Flow</strong>
            <small>保留最小 trigger → output 骨架。</small>
          </div>
        )}
      </div>
    </aside>
  );
}

function WorkspaceAppListColumns() {
  return (
    <div className="workspace-app-list-columns" aria-hidden="true">
      <span>应用</span>
      <span>模式</span>
      <span>状态</span>
      <span>重点</span>
      <span>操作</span>
    </div>
  );
}

function WorkspaceEmptyTile({ activeModeLabel }: { activeModeLabel: string | null }) {
  return (
    <article className="workspace-app-card workspace-app-empty-tile workspace-app-card-empty-dify workspace-catalog-card">
      <p className="workspace-app-card-caption">应用列表</p>
      <h3>当前筛选范围内还没有{activeModeLabel ? ` ${activeModeLabel}` : ""}应用</h3>
      <p className="workspace-muted workspace-card-copy">
        先从创建入口或 Starter 开始，然后进入 xyflow 补齐节点。
      </p>
      <div className="workspace-action-row workspace-app-card-actions">
        <Link className="workspace-primary-button compact" href="/workflows/new">
          立即创建
        </Link>
        <Link className="workspace-ghost-button compact" href="/workspace-starters">
          查看 Starter
        </Link>
      </div>
    </article>
  );
}

function WorkspaceAppTile({
  card,
  currentUserDisplayName
}: {
  card: WorkspaceAppCard;
  currentUserDisplayName: string;
}) {
  const appSurface = getWorkspaceAppSurface({
    followUpCount: card.followUpCount,
    healthLabel: card.healthLabel,
    missingToolCount: card.missingToolCount,
    publishCount: card.publishCount,
    status: card.status
  });
  const trackLabel = `${card.track.priority} · ${card.track.id}`;

  return (
    <article className="workspace-app-row workspace-catalog-card" key={card.id}>
      <div className="workspace-app-row-cell workspace-app-row-cell-primary">
        <div className="workspace-app-card-identity workspace-app-row-identity">
          <div className="workspace-app-icon" aria-hidden="true">
            {getWorkspaceBadgeLabel(card.name, "A")}
          </div>
          <div>
            <div className="workspace-app-card-title-row workspace-app-row-title-row">
              <h3>{card.name}</h3>
            </div>
            <p className="workspace-app-subtitle workspace-app-subtitle-dify workspace-app-subtitle-compact">
              {card.nodeCount} 个节点 · {currentUserDisplayName}
            </p>
            <p className="workspace-muted workspace-app-row-updated">最近更新 {formatTimestamp(card.updatedAt)}</p>
          </div>
        </div>
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-mode">
        <span className="workspace-mode-pill">{card.mode.shortLabel}</span>
        <span className="workspace-app-row-track">{trackLabel}</span>
        <span className="workspace-app-footnote">{appSurface.publishLabel}</span>
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-status">
        <span className={`workspace-status-pill ${appSurface.statusTone}`}>
          {appSurface.statusLabel}
        </span>
        <span className={`workspace-app-inline-metric workspace-app-row-signal ${card.followUpCount > 0 ? "warning" : ""}`}>
          {appSurface.signalLabel}
        </span>
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-summary">
        <div className="workspace-app-meta-row workspace-app-row-meta" aria-label={`${card.name} workspace hints`}>
          <span className="workspace-app-meta-pill">{card.track.focus}</span>
          {card.followUpCount > 0 ? (
            <span className="workspace-app-meta-pill warning">待治理：{card.followUpCount}</span>
          ) : null}
          {card.publishCount > 0 ? (
            <span className="workspace-app-meta-pill">{appSurface.publishLabel}</span>
          ) : null}
        </div>
        {appSurface.showDetailPanel && appSurface.detailToggleLabel ? (
          <details className="workspace-app-row-details">
            <summary>{appSurface.detailToggleLabel}</summary>
            <div className="workspace-app-row-details-panel">
              <p className="workspace-muted workspace-app-row-helper">{appSurface.digest}</p>
              <div className="workspace-app-row-details-meta">
                <span className="workspace-app-footnote">{appSurface.publishLabel}</span>
                <span className="workspace-app-footnote">最近更新 {formatTimestamp(card.updatedAt)}</span>
              </div>
            </div>
          </details>
        ) : (
          <p className="workspace-muted workspace-app-row-helper workspace-app-row-helper-inline">
            {appSurface.digest}
          </p>
        )}
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-actions">
        <Link className="workspace-primary-button compact" href={card.href}>
          进入 Studio
        </Link>
        <Link className="workspace-ghost-button compact" href="/runs">
          查看运行
        </Link>
      </div>
    </article>
  );
}

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
      : "搜索、筛选后直接进入 Studio。";

  return (
    <main className="workspace-main workspace-home-main workspace-home-main-flat workspace-board-page">
      <section className="workspace-apps-dify-shell">
        <section className="workspace-apps-dify-stage">
          <section className="workspace-apps-stage-header workspace-catalog-card">
            <div className="workspace-apps-stage-copy">
              <p className="workspace-eyebrow">Workspace</p>
              <div className="workspace-apps-stage-title-row">
                <h1>应用工作台</h1>
                <span className="workspace-tag accent">当前身份：{currentRoleLabel}</span>
              </div>
              <p className="workspace-muted workspace-apps-stage-copy-text">{catalogDescription}</p>
            </div>

            <form action="/workspace" className="workspace-search-form workspace-search-form-board workspace-search-form-studio workspace-apps-stage-search">
              {searchState.filter ? <input name="filter" type="hidden" value={searchState.filter} /> : null}
              {searchState.mode ? <input name="mode" type="hidden" value={searchState.mode} /> : null}
              {searchState.track ? <input name="track" type="hidden" value={searchState.track} /> : null}
              <input
                className="workspace-search-input workspace-search-input-board"
                defaultValue={requestedKeyword}
                name="keyword"
                placeholder="搜索应用或治理焦点"
                type="search"
              />
              <button className="workspace-primary-button compact" type="submit">
                搜索
              </button>
              {searchState.clearHref ? (
                <Link className="workspace-ghost-button compact" href={searchState.clearHref}>
                  清除
                </Link>
              ) : null}
            </form>
          </section>

          <WorkspaceBrowseRail
            currentScopeSummary={currentScopeSummary}
            modeTabs={modeTabs}
            scopePills={scopePills}
            statusFilters={statusFilters}
            variant="inline"
            workspaceSignals={workspaceSignals}
          />

          <section className="workspace-catalog-stage">
            <section className="workspace-app-list-stage workspace-catalog-card">
              <div className="workspace-app-list-stage-header">
                <div>
                  <p className="workspace-app-list-stage-summary">{visibleAppSummary}</p>
                  <p className="workspace-muted workspace-app-list-stage-copy">
                    应用目录优先，治理细节按需展开。
                  </p>
                </div>
              </div>

              <div className="workspace-app-list-shell">
                {filteredApps.length > 0 ? <WorkspaceAppListColumns /> : null}
                {filteredApps.length === 0 ? <WorkspaceEmptyTile activeModeLabel={activeModeLabel} /> : null}

                {filteredApps.map((card) => (
                  <WorkspaceAppTile card={card} currentUserDisplayName={currentUserDisplayName} key={card.id} />
                ))}
              </div>
            </section>

            <WorkspaceCreateStrip
              quickCreateEntries={quickCreateEntries}
              requestedKeyword={requestedKeyword}
              starterCount={starterCount}
              starterHighlights={starterHighlights}
              workspaceUtilityEntry={workspaceUtilityEntry}
            />
          </section>
        </section>
      </section>
    </main>
  );
}
