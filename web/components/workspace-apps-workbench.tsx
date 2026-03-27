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
  canManageMembers: boolean;
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

function WorkspaceSignalRail({
  workspaceSignals,
  focusLabel,
  activeModeDescription
}: {
  workspaceSignals: WorkspaceSignal[];
  focusLabel: string;
  activeModeDescription: string;
}) {
  return (
    <div className="workspace-signal-rail" aria-label="Workspace overview">
      {workspaceSignals.map((signal) => (
        <article className="workspace-signal-chip" key={signal.label}>
          <span>{signal.label}</span>
          <strong>{signal.value}</strong>
        </article>
      ))}
      <article className="workspace-signal-chip workspace-signal-chip-focus">
        <span>当前入口焦点</span>
        <strong>{focusLabel}</strong>
        <p className="workspace-muted workspace-card-copy">{activeModeDescription}</p>
      </article>
    </div>
  );
}

function WorkspaceCreateTile({
  activeModeLabel,
  activeModeDescription,
  quickCreateEntries,
  starterCount
}: {
  activeModeLabel: string | null;
  activeModeDescription: string;
  quickCreateEntries: WorkspaceQuickCreateEntry[];
  starterCount: number;
}) {
  return (
    <article className="workspace-app-card workspace-create-tile workspace-create-tile-dify workspace-app-card-dify">
      <div>
        <p className="workspace-app-card-caption">创建应用</p>
        <h3>{activeModeLabel ? `优先创建 ${activeModeLabel} 应用` : "从空白 ChatFlow、Starter 或团队协作开始"}</h3>
        <p className="workspace-muted workspace-card-copy">
          {activeModeLabel
            ? `${activeModeDescription} 创建后直接进入 xyflow 编辑器，不额外复制执行语义。`
            : "像 Dify 一样先在工作台创建应用，但只展示当前已经落地的入口。"}
        </p>
      </div>

      <div className="workspace-create-list workspace-create-list-dify">
        {quickCreateEntries.map((entry) => (
          <Link className="workspace-create-link" href={entry.href} key={entry.title}>
            <div className="workspace-create-link-copy">
              <span>{entry.title}</span>
              <small>{entry.detail}</small>
            </div>
            <strong className="workspace-create-link-badge">{entry.badge}</strong>
          </Link>
        ))}
      </div>

      <div className="workspace-create-footnote-row">
        <span className="workspace-create-footnote">编排事实源：xyflow</span>
        <span className="workspace-create-footnote">Starter 模板：{starterCount} 个</span>
      </div>
    </article>
  );
}

function WorkspaceEmptyTile({ activeModeLabel }: { activeModeLabel: string | null }) {
  return (
    <article className="workspace-app-card workspace-app-card-empty workspace-app-card-empty-dify workspace-app-card-dify">
      <p className="workspace-app-card-caption">应用列表</p>
      <h3>当前筛选范围内还没有{activeModeLabel ? ` ${activeModeLabel} 应用` : "应用"}</h3>
      <p className="workspace-muted workspace-card-copy">
        现在可以直接从空白 ChatFlow 创建，也可以先从下方推荐 Starter 进入；创建后继续进入 xyflow 编辑器补节点、调试和发布语义。
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

function WorkspaceStarterTile({ starter }: { starter: WorkspaceStarterHighlight }) {
  return (
    <article className="workspace-app-card workspace-app-card-starter workspace-app-card-dify" key={starter.id}>
      <div className="workspace-app-card-header">
        <div className="workspace-app-card-identity">
          <div className="workspace-app-icon workspace-app-icon-starter" aria-hidden="true">
            {getWorkspaceBadgeLabel(starter.name, "S")}
          </div>
          <div>
            <p className="workspace-app-card-caption">Starter 模板</p>
            <div className="workspace-app-card-title-row">
              <h3>{starter.name}</h3>
              <span className="workspace-mode-pill">{starter.modeShortLabel}</span>
            </div>
            <p className="workspace-app-subtitle">
              {starter.track} · {starter.priority}
            </p>
          </div>
        </div>
      </div>

      <p className="workspace-app-focus">{starter.description}</p>
      <p className="workspace-muted workspace-card-copy">
        先用这个 Starter 起草入口，再进入 xyflow 继续补节点、工具绑定与发布语义。
      </p>

      <div className="workspace-app-inline-metrics">
        <span className="workspace-app-inline-metric accent">{starter.priority}</span>
        <span className="workspace-app-inline-metric">{starter.track}</span>
        <span className="workspace-app-inline-metric">{starter.modeShortLabel}</span>
      </div>

      <div className="workspace-app-footer workspace-app-footer-inline">
        <p className="workspace-app-meta">推荐作为空工作台的首个应用入口。</p>
        <div className="workspace-action-row workspace-app-card-actions">
          <Link className="workspace-primary-button compact" href={starter.href}>
            从 Starter 创建
          </Link>
          <Link className="workspace-ghost-button compact" href="/workspace-starters">
            查看模板库
          </Link>
        </div>
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
    <article className="workspace-app-card workspace-app-card-product workspace-app-card-dify" key={card.id}>
      <div className="workspace-app-card-header">
        <div className="workspace-app-card-identity">
          <div className="workspace-app-icon" aria-hidden="true">
            {getWorkspaceBadgeLabel(card.name, "A")}
          </div>
          <div>
            <p className="workspace-app-card-caption">{card.mode.label}</p>
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
      <p className="workspace-muted workspace-card-copy">推荐下一步：{card.recommendedNextStep}</p>

      <div className="workspace-app-inline-metrics" aria-label={`${card.name} metrics`}>
        <span className="workspace-app-inline-metric accent">{card.track.priority}</span>
        <span className="workspace-app-inline-metric">{card.track.id}</span>
        <span className="workspace-app-inline-metric">{card.nodeCount} 个节点</span>
        <span className="workspace-app-inline-metric">{card.publishCount} 个发布端点</span>
        <span className="workspace-app-inline-metric">
          {card.followUpCount > 0 ? `${card.followUpCount} 个治理待办` : "治理已就绪"}
        </span>
        {card.missingToolCount > 0 ? (
          <span className="workspace-app-inline-metric warning">{card.missingToolCount} 个工具缺口</span>
        ) : null}
      </div>

      <div className="workspace-app-footer workspace-app-footer-inline">
        <p className="workspace-app-meta">{card.healthLabel}</p>
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
  canManageMembers,
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
  const focusLabel = activeModeLabel ? `${activeModeLabel} 入口` : "全部应用入口";
  const shouldRenderStarterShowcase = filteredApps.length === 0 && starterHighlights.length > 0;

  return (
    <main className="workspace-main workspace-home-main">
      <section className="workspace-panel workspace-app-catalog-shell workspace-app-catalog-shell-dify">
        <div className="workspace-app-catalog-header workspace-app-catalog-header-dify">
          <div>
            <p className="workspace-eyebrow">Workspace / Apps</p>
            <div className="workspace-app-catalog-title-row">
              <h1>{workspaceName} 应用工作台</h1>
              <span className="workspace-tag accent">当前身份：{currentRoleLabel}</span>
              <span className="workspace-tag">默认管理员已可用</span>
              <span className="workspace-tag">xyflow 编排事实源</span>
            </div>
            <p className="workspace-muted workspace-copy-wide">
              先像 Dify 一样在工作台收敛应用入口、应用筛选与成员协作，再进入 7Flows 自己的
              xyflow 编辑器继续节点编排、运行诊断和发布治理。
            </p>
          </div>
          <div className="workspace-action-row workspace-app-catalog-actions">
            <Link className="workspace-primary-button compact" href="/workflows/new">
              + 新建应用
            </Link>
            <Link className="workspace-ghost-button compact" href="/workspace-starters">
              查看 Starter
            </Link>
            {canManageMembers ? (
              <Link className="workspace-ghost-button compact" href="/admin/members">
                团队设置
              </Link>
            ) : null}
          </div>
        </div>

        <div className="workspace-app-toolbar-dify">
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

          <div className="workspace-app-catalog-toolbar-row workspace-app-catalog-toolbar-row-dify">
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

        <WorkspaceSignalRail
          activeModeDescription={activeModeDescription}
          focusLabel={focusLabel}
          workspaceSignals={workspaceSignals}
        />
      </section>

      <section className="workspace-app-section workspace-app-section-dify">
        <div className="workspace-app-section-header workspace-app-section-header-dify">
          <div>
            <p className="workspace-eyebrow">Applications</p>
            <h2>{visibleAppSummary}</h2>
            <p className="workspace-muted workspace-copy-wide">
              {activeModeLabel
                ? `当前聚焦 ${activeModeLabel} 应用：${activeModeDescription}`
                : "保留 Dify 式应用工作台心智，但不在 workspace 壳层伪造第二套执行事实。"}
            </p>
          </div>
          <div className="workspace-action-row">
            <Link className="workspace-ghost-button compact" href="/workspace-starters">
              查看 Starter
            </Link>
            {canManageMembers ? (
              <Link className="workspace-ghost-button compact" href="/admin/members">
                团队设置
              </Link>
            ) : null}
          </div>
        </div>

        <div className="workspace-app-board workspace-app-grid-dify">
          <WorkspaceCreateTile
            activeModeDescription={activeModeDescription}
            activeModeLabel={activeModeLabel}
            quickCreateEntries={quickCreateEntries}
            starterCount={starterCount}
          />

          {filteredApps.length === 0 ? <WorkspaceEmptyTile activeModeLabel={activeModeLabel} /> : null}

          {shouldRenderStarterShowcase ? starterHighlights.map((starter) => <WorkspaceStarterTile key={starter.id} starter={starter} />) : null}

          {filteredApps.map((card) => (
            <WorkspaceAppTile card={card} currentUserDisplayName={currentUserDisplayName} key={card.id} />
          ))}
        </div>
      </section>
    </main>
  );
}
