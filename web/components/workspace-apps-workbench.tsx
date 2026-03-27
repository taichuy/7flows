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

type WorkspaceTrackTab = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
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
  trackTabs: WorkspaceTrackTab[];
  statusFilters: WorkspaceStatusFilter[];
  workspaceSignals: WorkspaceSignal[];
  quickCreateEntries: WorkspaceQuickCreateEntry[];
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

function WorkspaceSummaryBar({ workspaceSignals }: { workspaceSignals: WorkspaceSignal[] }) {
  return (
    <div className="workspace-summary-bar" aria-label="Workspace overview">
      {workspaceSignals.map((signal) => (
        <article className="workspace-summary-stat" key={signal.label}>
          <span>{signal.label}</span>
          <strong>{signal.value}</strong>
        </article>
      ))}
    </div>
  );
}

function WorkspaceCreateBoardCard({
  activeModeDescription,
  activeModeLabel,
  quickCreateEntries,
  starterHighlights,
  starterCount
}: {
  activeModeDescription: string;
  activeModeLabel: string | null;
  quickCreateEntries: WorkspaceQuickCreateEntry[];
  starterHighlights: WorkspaceStarterHighlight[];
  starterCount: number;
}) {
  const visibleStarterHighlights = starterHighlights.slice(0, 2);

  return (
    <article className="workspace-app-card workspace-create-board-card" key="workspace-create-card">
      <div className="workspace-create-board-head">
        <div className="workspace-create-board-copy">
          <p className="workspace-app-card-caption">创建应用</p>
          <h3>
            {activeModeLabel
              ? `优先创建 ${activeModeLabel} 应用`
              : "从空白应用、模板或团队 Starter 开始"}
          </h3>
          <p className="workspace-muted workspace-card-copy">
            {activeModeLabel
              ? `${activeModeDescription} 创建完成后直接进入 xyflow，不在工作台复制第二套执行心智。`
              : "保留 Dify 的创建心智，但所有真实编排仍回到 7Flows 的 xyflow 主链。"}
          </p>
        </div>

        <Link className="workspace-ghost-button compact workspace-create-board-library-link" href="/workspace-starters">
          打开 Starter 模板库
        </Link>
      </div>

      <div className="workspace-create-board-actions">
        {quickCreateEntries.map((entry) => (
          <Link className="workspace-create-link workspace-create-link-inline" href={entry.href} key={entry.title}>
            <div className="workspace-create-link-copy">
              <span>{entry.title}</span>
              <small>{entry.detail}</small>
            </div>
            <strong className="workspace-create-link-badge">{entry.badge}</strong>
          </Link>
        ))}
      </div>

      <div className="workspace-create-board-footer">
        <div className="workspace-create-board-footnotes">
          <span className="workspace-create-footnote">编排事实源：xyflow</span>
          <span className="workspace-create-footnote">Starter 模板：{starterCount} 个</span>
        </div>

        {visibleStarterHighlights.length > 0 ? (
          <div className="workspace-create-board-starters">
            <p className="workspace-app-card-caption">Starter 模板精选</p>
            {visibleStarterHighlights.map((starter) => (
              <Link className="workspace-create-board-starter" href={starter.href} key={starter.id}>
                <strong>{starter.name}</strong>
                <span>
                  {starter.priority} · {starter.modeShortLabel}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function WorkspaceEmptyTile({ activeModeLabel }: { activeModeLabel: string | null }) {
  return (
    <article className="workspace-app-card workspace-app-empty-tile workspace-app-card-empty-dify">
      <p className="workspace-app-card-caption">应用列表</p>
      <h3>当前筛选范围内还没有{activeModeLabel ? ` ${activeModeLabel}` : ""}应用</h3>
      <p className="workspace-muted workspace-card-copy">
        先从左侧创建入口发起，或者直接挑一个 Starter 作为起点；创建后继续进入 xyflow 编辑器补齐节点、调试和发布语义。
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
  return (
    <article className="workspace-app-card workspace-app-card-product workspace-app-card-product-flat" key={card.id}>
      <div className="workspace-app-card-header workspace-app-card-header-flat">
        <div className="workspace-app-card-identity">
          <div className="workspace-app-icon" aria-hidden="true">
            {getWorkspaceBadgeLabel(card.name, "A")}
          </div>
          <div>
            <div className="workspace-app-card-title-row">
              <h3>{card.name}</h3>
              <span className="workspace-mode-pill">{card.mode.shortLabel}</span>
            </div>
            <p className="workspace-app-subtitle">
              {currentUserDisplayName} · 最近更新 {formatTimestamp(card.updatedAt)}
            </p>
          </div>
        </div>
        <div className="workspace-app-state-column">
          <span className={`workspace-status-pill ${card.status === "published" ? "healthy" : "draft"}`}>
            {card.status === "published" ? "已发布" : "草稿"}
          </span>
          {card.followUpCount > 0 ? (
            <span className="workspace-status-pill warning">{card.followUpCount} 个待办</span>
          ) : null}
        </div>
      </div>

      <p className="workspace-app-focus">{card.track.focus}</p>

      <div className="workspace-app-inline-metrics workspace-app-inline-metrics-wrap" aria-label={`${card.name} metrics`}>
        <span className="workspace-app-inline-metric accent">{card.track.priority}</span>
        <span className="workspace-app-inline-metric">{card.track.id}</span>
        <span className="workspace-app-inline-metric">{card.nodeCount} 个节点</span>
        <span className="workspace-app-inline-metric">{card.publishCount} 个发布端点</span>
        <span className="workspace-app-inline-metric">{card.healthLabel}</span>
        {card.missingToolCount > 0 ? (
          <span className="workspace-app-inline-metric warning">{card.missingToolCount} 个工具缺口</span>
        ) : null}
      </div>

      <div className="workspace-app-next-step-panel">
        <span className="workspace-app-card-caption">Recommended next step</span>
        <p className="workspace-app-next-step">推荐下一步：{card.recommendedNextStep}</p>
        <p className="workspace-app-meta workspace-app-meta-detail">{card.track.summary}</p>
      </div>

      <div className="workspace-app-footer workspace-app-footer-inline">
        <div>
          <p className="workspace-app-meta">
            {card.status === "published"
              ? "继续维护已发布版本，必要时从 runs 回看线上调用。"
              : "草稿仍回到 xyflow 继续编排，不在 workspace 壳层分叉执行语义。"}
          </p>
        </div>
        <div className="workspace-action-row workspace-app-card-actions">
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
  trackTabs,
  statusFilters,
  workspaceSignals,
  quickCreateEntries,
  starterHighlights,
  starterCount,
  filteredApps,
  searchState
}: WorkspaceAppsWorkbenchProps) {
  return (
    <main className="workspace-main workspace-home-main workspace-home-main-flat">
      <section className="workspace-panel workspace-dashboard-panel">
        <div className="workspace-dashboard-header">
          <div>
            <p className="workspace-eyebrow">Workspace / Apps</p>
            <div className="workspace-dashboard-title-row">
              <h1>{workspaceName} 应用工作台</h1>
              <span className="workspace-tag accent">当前身份：{currentRoleLabel}</span>
              <span className="workspace-tag">默认管理员已可用</span>
              <span className="workspace-tag">xyflow 编排事实源</span>
            </div>
            <p className="workspace-muted workspace-copy-wide">
              像 Dify 一样先在工作台搜索、筛选和创建应用，再进入 7Flows 自己的 xyflow 编排、运行诊断和发布治理主链。
            </p>
          </div>

          <div className="workspace-action-row workspace-dashboard-actions">
            <Link className="workspace-primary-button compact" href="/workflows/new">
              + 新建应用
            </Link>
            <Link className="workspace-ghost-button compact" href="/workspace-starters">
              查看 Starter
            </Link>
          </div>
        </div>

        <WorkspaceSummaryBar workspaceSignals={workspaceSignals} />

        <div className="workspace-dashboard-toolbar">
          <div className="workspace-mode-tabs" aria-label="App modes">
            {modeTabs.map((modeTab) => (
              <Link
                className={`workspace-mode-tab ${modeTab.active ? "active" : ""}`}
                href={modeTab.href}
                key={modeTab.key}
              >
                <span>{modeTab.label}</span>
                <strong>{modeTab.count}</strong>
              </Link>
            ))}
          </div>

          <div className="workspace-dashboard-toolbar-row">
            <div className="workspace-filter-row">
              <span className="workspace-toolbar-meta">应用筛选</span>
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

            <form action="/workspace" className="workspace-search-form">
              {searchState.filter ? <input name="filter" type="hidden" value={searchState.filter} /> : null}
              {searchState.mode ? <input name="mode" type="hidden" value={searchState.mode} /> : null}
              {searchState.track ? <input name="track" type="hidden" value={searchState.track} /> : null}
              <input
                className="workspace-search-input"
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

          <div className="workspace-filter-row workspace-track-filter-row workspace-track-filter-row-compact" aria-label="Business tracks">
            <span className="workspace-toolbar-meta">业务轨道</span>
            {trackTabs.map((trackTab) => (
              <Link
                className={`workspace-filter-chip workspace-track-filter-chip ${trackTab.active ? "active" : ""}`}
                href={trackTab.href}
                key={trackTab.key}
              >
                <span>{trackTab.label}</span>
                <strong>{trackTab.count}</strong>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-panel workspace-app-board-panel">
        <div className="workspace-app-section-header workspace-app-section-header-compact">
          <div>
            <p className="workspace-eyebrow">Applications</p>
            <h2>应用目录 · {visibleAppSummary}</h2>
            <p className="workspace-muted workspace-copy-wide">
              {activeModeLabel
                ? `当前聚焦 ${activeModeLabel} 应用：${activeModeDescription}`
                : "保留 Dify 式应用工作台心智，但不在 workspace 壳层伪造第二套执行事实。"}
            </p>
          </div>
        </div>

        <div className="workspace-app-grid workspace-app-grid-board">
          <WorkspaceCreateBoardCard
            activeModeDescription={activeModeDescription}
            activeModeLabel={activeModeLabel}
            quickCreateEntries={quickCreateEntries}
            starterCount={starterCount}
            starterHighlights={starterHighlights}
          />

          {filteredApps.length === 0 ? <WorkspaceEmptyTile activeModeLabel={activeModeLabel} /> : null}

          {filteredApps.map((card) => (
            <WorkspaceAppTile card={card} currentUserDisplayName={currentUserDisplayName} key={card.id} />
          ))}
        </div>
      </section>
    </main>
  );
}
