import Link from "next/link";

import type { WorkspaceAppCard } from "@/components/workspace-apps-workbench/shared";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { getWorkspaceAppSurface, getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

function WorkspaceAppListColumns() {
  return (
    <div className="workspace-app-list-columns" aria-hidden="true">
      <span>应用</span>
      <span>模式</span>
      <span>状态</span>
      <span>摘要</span>
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
            <p className="workspace-muted workspace-app-row-updated">
              最近更新 {formatTimestamp(card.updatedAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-mode">
        <div className="workspace-app-row-mode-badge">
          <strong>{card.mode.label}</strong>
          <span className="workspace-app-footnote">{appSurface.publishLabel}</span>
        </div>
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-status">
        <span className={`workspace-status-pill ${appSurface.statusTone}`}>
          {appSurface.statusLabel}
        </span>
        <span
          className={`workspace-app-inline-metric workspace-app-row-signal ${card.followUpCount > 0 ? "warning" : ""}`}
        >
          {appSurface.signalLabel}
        </span>
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-summary">
        <div className="workspace-app-meta-row workspace-app-row-meta" aria-label={`${card.name} workspace hints`}>
          <span className="workspace-app-meta-pill">{trackLabel}</span>
          <span className="workspace-app-meta-pill">{card.nodeCount} 个节点</span>
          {card.followUpCount > 0 ? (
            <span className="workspace-app-meta-pill warning">待治理：{card.followUpCount}</span>
          ) : null}
          {card.publishCount > 0 ? (
            <span className="workspace-app-meta-pill">{appSurface.publishLabel}</span>
          ) : null}
        </div>
        <p className="workspace-muted workspace-app-row-helper workspace-app-row-helper-inline">
          {appSurface.digest}
        </p>
        {appSurface.showDetailPanel && appSurface.detailToggleLabel ? (
          <details className="workspace-app-row-details">
            <summary>{appSurface.detailToggleLabel}</summary>
            <div className="workspace-app-row-details-panel">
              <p className="workspace-muted workspace-app-row-helper">{card.recommendedNextStep}</p>
              <div className="workspace-app-row-details-meta">
                <span className="workspace-app-footnote">{appSurface.publishLabel}</span>
                <span className="workspace-app-footnote">
                  最近更新 {formatTimestamp(card.updatedAt)}
                </span>
              </div>
            </div>
          </details>
        ) : null}
      </div>

      <div className="workspace-app-row-cell workspace-app-row-cell-actions">
        <Link className="workspace-primary-button compact" href={card.href}>
          进入 Studio
        </Link>
      </div>
    </article>
  );
}

export function WorkspaceAppListStage({
  visibleAppSummary,
  filteredApps,
  activeModeLabel,
  currentUserDisplayName
}: {
  visibleAppSummary: string;
  filteredApps: WorkspaceAppCard[];
  activeModeLabel: string | null;
  currentUserDisplayName: string;
}) {
  return (
    <section
      className="workspace-app-list-stage workspace-catalog-card"
      data-component="workspace-app-list-stage"
    >
      <div className="workspace-app-list-stage-header">
        <div>
          <p className="workspace-app-list-stage-summary">{visibleAppSummary}</p>
          <p className="workspace-muted workspace-app-list-stage-copy">
            主入口先创建应用，治理细节按需展开。
          </p>
        </div>
      </div>

      <div className="workspace-app-list-shell">
        {filteredApps.length > 0 ? <WorkspaceAppListColumns /> : null}
        {filteredApps.length === 0 ? <WorkspaceEmptyTile activeModeLabel={activeModeLabel} /> : null}

        {filteredApps.map((card) => (
          <WorkspaceAppTile
            card={card}
            currentUserDisplayName={currentUserDisplayName}
            key={card.id}
          />
        ))}
      </div>
    </section>
  );
}
