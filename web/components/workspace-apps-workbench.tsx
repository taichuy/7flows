import Link from "next/link";

import { formatTimestamp } from "@/lib/runtime-presenters";
import { getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

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

function WorkspaceSummaryBar({
  workspaceSignals,
  compact = false
}: {
  workspaceSignals: WorkspaceSignal[];
  compact?: boolean;
}) {
  return (
    <div
      className={`workspace-summary-bar workspace-summary-bar-studio${compact ? " workspace-summary-bar-inline" : ""}`}
      aria-label="Workspace overview"
    >
      {workspaceSignals.map((signal) => (
        <article
          className={`workspace-summary-stat workspace-summary-stat-studio${compact ? " workspace-summary-stat-inline" : ""}`}
          key={signal.label}
        >
          <span>{signal.label}</span>
          <strong>{signal.value}</strong>
        </article>
      ))}
    </div>
  );
}

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
      : "当前展示全部应用";
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

function WorkspaceCreateRail({
  activeModeDescription,
  activeModeLabel,
  quickCreateEntries,
  starterHighlights,
  requestedKeyword,
  starterCount,
  workspaceUtilityEntry
}: {
  activeModeDescription: string;
  activeModeLabel: string | null;
  quickCreateEntries: WorkspaceQuickCreateEntry[];
  starterHighlights: WorkspaceStarterHighlight[];
  requestedKeyword: string;
  starterCount: number;
  workspaceUtilityEntry: WorkspaceQuickCreateEntry | null;
}) {
  const primaryStarter = starterHighlights[0] ?? null;
  const [primaryEntry, ...secondaryEntries] = quickCreateEntries;
  const currentScopeSummary = getWorkspaceScopeSummary({
    activeModeDescription,
    activeModeLabel,
    requestedKeyword
  });

  return (
    <div className="workspace-create-rail" aria-label="Workspace create actions">
      <div className="workspace-create-rail-copy">
        <p className="workspace-app-card-caption">Create</p>
        <h3>{activeModeLabel ? `${activeModeLabel} 创建入口` : "像 Dify 一样从应用入口开始"}</h3>
        <p className="workspace-muted workspace-card-copy workspace-create-rail-summary">
          {requestedKeyword ? `${currentScopeSummary}，命中后直接继续进入 xyflow。` : activeModeDescription}
        </p>
      </div>

      <div className="workspace-create-rail-actions">
        {primaryEntry ? (
          <Link className="workspace-create-rail-primary" href={primaryEntry.href}>
            <div>
              <strong>{primaryEntry.title}</strong>
              <p>{primaryEntry.detail}</p>
            </div>
            <span>{primaryEntry.badge}</span>
          </Link>
        ) : null}

        <div className="workspace-create-rail-secondary-list">
          {secondaryEntries.map((entry) => (
            <Link className="workspace-create-rail-secondary" href={entry.href} key={entry.title}>
              <div>
                <strong>{entry.title}</strong>
                <p>{entry.detail}</p>
              </div>
              <span>{entry.badge}</span>
            </Link>
          ))}

          {workspaceUtilityEntry ? (
            <Link className="workspace-create-rail-utility" href={workspaceUtilityEntry.href}>
              <strong>{workspaceUtilityEntry.title}</strong>
              <p>{workspaceUtilityEntry.detail}</p>
              <span>{workspaceUtilityEntry.badge}</span>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="workspace-create-rail-side">
        <div className="workspace-create-rail-footnotes">
          <span className="workspace-app-footnote">筛选后创建，创建后直达 xyflow</span>
          <span className="workspace-app-footnote">Starter 模板：{starterCount} 个</span>
        </div>

        {primaryStarter ? (
          <Link className="workspace-create-rail-starter" href={primaryStarter.href}>
            <span>推荐 Starter</span>
            <strong>{primaryStarter.name}</strong>
            <small>
              {primaryStarter.priority} · {primaryStarter.modeShortLabel} · {primaryStarter.description}
            </small>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceEmptyTile({ activeModeLabel }: { activeModeLabel: string | null }) {
  return (
    <article className="workspace-app-card workspace-app-empty-tile workspace-app-card-empty-dify workspace-catalog-card">
      <p className="workspace-app-card-caption">应用列表</p>
      <h3>当前筛选范围内还没有{activeModeLabel ? ` ${activeModeLabel}` : ""}应用</h3>
      <p className="workspace-muted workspace-card-copy">
        先从创建入口发起，或者直接挑一个 Starter 作为起点；创建后继续进入 xyflow 编辑器补齐节点、调试和发布语义。
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
  const signalLabel =
    card.followUpCount > 0
      ? `${card.followUpCount} 个治理待办`
      : card.missingToolCount > 0
        ? `${card.missingToolCount} 个工具缺口`
        : card.healthLabel;
  const appDigest =
    card.status === "published"
      ? "已发布，可继续核对版本、运行与调用状态。"
      : card.followUpCount > 0
        ? `优先处理 ${card.followUpCount} 个治理待办，再继续进入画布。`
        : "草稿已就绪，可直接回到 xyflow 继续编排。";

  return (
    <article className="workspace-app-row workspace-catalog-card" key={card.id}>
      <div className="workspace-app-row-main">
        <div className="workspace-app-row-header">
          <div className="workspace-app-card-identity workspace-app-row-identity">
            <div className="workspace-app-icon" aria-hidden="true">
              {getWorkspaceBadgeLabel(card.name, "A")}
            </div>
            <div>
              <div className="workspace-app-card-title-row workspace-app-row-title-row">
                <h3>{card.name}</h3>
                <span className="workspace-mode-pill">{card.mode.shortLabel}</span>
              </div>
              <p className="workspace-app-subtitle workspace-app-subtitle-dify workspace-app-subtitle-compact">
                {card.track.priority} · {currentUserDisplayName} · 最近更新 {formatTimestamp(card.updatedAt)}
              </p>
            </div>
          </div>

          <span className={`workspace-status-pill ${card.status === "published" ? "healthy" : "draft"}`}>
            {card.status === "published" ? "已发布" : "草稿"}
          </span>
        </div>

        <p className="workspace-app-description workspace-app-row-description">{appDigest}</p>

        <div className="workspace-app-next-step" aria-label={`${card.name} next step`}>
          <span>下一步</span>
          <p>{card.recommendedNextStep}</p>
        </div>

        <div className="workspace-app-meta-row workspace-app-row-meta" aria-label={`${card.name} workspace hints`}>
          <span className="workspace-app-meta-pill">{card.mode.label}</span>
          <span className="workspace-app-meta-pill">{card.track.focus}</span>
          {card.missingToolCount > 0 ? <span className="workspace-app-meta-pill warning">工具缺口：{card.missingToolCount}</span> : null}
        </div>
      </div>

      <div className="workspace-app-row-side">
        <div className="workspace-app-row-metrics" aria-label={`${card.name} metrics`}>
          <span className="workspace-app-inline-metric">{card.nodeCount} 个节点</span>
          <span className="workspace-app-inline-metric">{card.publishCount} 个发布端点</span>
          <span className={`workspace-app-inline-metric ${card.followUpCount > 0 ? "warning" : ""}`}>
            {signalLabel}
          </span>
        </div>

        <div className="workspace-app-row-actions">
          <Link className="workspace-primary-button compact" href={card.href}>
            继续进入 xyflow
          </Link>
          <Link className="workspace-ghost-button compact" href="/runs">
            查看运行
          </Link>
        </div>
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
    ? `当前按“${requestedKeyword}”筛选应用；命中后直接进入 xyflow 继续编排。`
    : activeModeLabel
      ? `当前聚焦 ${activeModeLabel}：${activeModeDescription}`
      : "参考 Dify 的工作室：工作台先承担创建、筛选和继续进入 Studio 这三件事。";

  return (
    <main className="workspace-main workspace-home-main workspace-home-main-flat workspace-board-page">
      <section className="workspace-studio-shell">
        <section className="workspace-workbench-shell-card">
          <div className="workspace-workbench-hero">
            <div className="workspace-board-hero-copy workspace-studio-header-copy workspace-workbench-copy">
              <p className="workspace-eyebrow">Workspace / Apps</p>
              <div className="workspace-board-title-row">
                <h1>{workspaceName} 应用工作台</h1>
                <span className="workspace-tag accent">当前身份：{currentRoleLabel}</span>
              </div>
              <p className="workspace-muted workspace-copy-wide workspace-board-hero-copy-text">{catalogDescription}</p>
            </div>

            <div className="workspace-workbench-meta-row">
              <WorkspaceSummaryBar compact workspaceSignals={workspaceSignals} />
              <WorkspaceScopePills scopePills={scopePills} />
              <p className="workspace-workbench-scope-summary">{currentScopeSummary}</p>
            </div>
          </div>
        </section>

        <section className="workspace-board-toolbar-shell workspace-board-toolbar-shell-studio">
          <div className="workspace-mode-tabs workspace-mode-tabs-board" aria-label="App modes">
            {modeTabs.map((modeTab) => (
              <Link className={`workspace-mode-tab ${modeTab.active ? "active" : ""}`} href={modeTab.href} key={modeTab.key}>
                <span>{modeTab.label}</span>
                <strong>{modeTab.count}</strong>
              </Link>
            ))}
          </div>

          <div className="workspace-board-toolbar-row workspace-board-toolbar-row-studio">
            <div className="workspace-filter-row workspace-filter-row-board">
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

            <form action="/workspace" className="workspace-search-form workspace-search-form-board workspace-search-form-studio">
              {searchState.filter ? <input name="filter" type="hidden" value={searchState.filter} /> : null}
              {searchState.mode ? <input name="mode" type="hidden" value={searchState.mode} /> : null}
              {searchState.track ? <input name="track" type="hidden" value={searchState.track} /> : null}
              <input
                className="workspace-search-input workspace-search-input-board"
                defaultValue={requestedKeyword}
                name="keyword"
                placeholder="搜索应用、Agent、工具链或治理焦点"
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
          </div>
        </section>

        <section className="workspace-app-section workspace-app-section-dify workspace-catalog-section workspace-catalog-section-studio">
          <div className="workspace-app-section-header workspace-app-section-header-dify workspace-app-section-header-board">
            <div className="workspace-app-section-heading">
              <p className="workspace-eyebrow">Applications</p>
              <h2>应用目录 · {visibleAppSummary}</h2>
              <p className="workspace-muted workspace-copy-wide">
                保留创建、筛选和继续进入 Studio 三条主链，不在这里堆编辑器说明。
              </p>
            </div>

            <WorkspaceCreateRail
              activeModeDescription={activeModeDescription}
              activeModeLabel={activeModeLabel}
              quickCreateEntries={quickCreateEntries}
              requestedKeyword={requestedKeyword}
              starterCount={starterCount}
              starterHighlights={starterHighlights}
              workspaceUtilityEntry={workspaceUtilityEntry}
            />
          </div>

          <div className="workspace-app-list-shell">
            {filteredApps.length === 0 ? <WorkspaceEmptyTile activeModeLabel={activeModeLabel} /> : null}

            {filteredApps.map((card) => (
              <WorkspaceAppTile card={card} currentUserDisplayName={currentUserDisplayName} key={card.id} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
