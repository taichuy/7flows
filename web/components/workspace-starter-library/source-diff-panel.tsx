"use client";

import type { WorkspaceStarterSourceDiff } from "@/lib/get-workspace-starters";

type WorkspaceStarterSourceDiffPanelProps = {
  sourceDiff: WorkspaceStarterSourceDiff | null;
  isLoading: boolean;
  isRebasing: boolean;
  onRebase: () => void;
};

export function WorkspaceStarterSourceDiffPanel({
  sourceDiff,
  isLoading,
  isRebasing,
  onRebase
}: WorkspaceStarterSourceDiffPanelProps) {
  const rebaseRecommendation = getRebaseRecommendation(sourceDiff);

  return (
    <article className="diagnostic-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Diff</p>
          <h2>Source drift detail</h2>
        </div>
        <p className="section-copy">
          用后端统一 diff 结果展示 template snapshot 与 source workflow 的差异，避免治理页继续各自拼接判断逻辑。
        </p>
      </div>

      {isLoading ? (
        <p className="empty-state">正在加载 source diff...</p>
      ) : !sourceDiff ? (
        <p className="empty-state">当前模板没有可用的 source diff。</p>
      ) : (
        <>
          <div className="summary-strip compact-strip">
            <div className="summary-card">
              <span>Node changes</span>
              <strong>
                {sourceDiff.node_summary.added_count +
                  sourceDiff.node_summary.removed_count +
                  sourceDiff.node_summary.changed_count}
              </strong>
            </div>
            <div className="summary-card">
              <span>Edge changes</span>
              <strong>
                {sourceDiff.edge_summary.added_count +
                  sourceDiff.edge_summary.removed_count +
                  sourceDiff.edge_summary.changed_count}
              </strong>
            </div>
            <div className="summary-card">
              <span>Workflow name</span>
              <strong>{sourceDiff.workflow_name_changed ? "Drifted" : "Synced"}</strong>
            </div>
            <div className="summary-card">
              <span>Rebase fields</span>
              <strong>{sourceDiff.rebase_fields.length}</strong>
            </div>
          </div>

          <div className="binding-card compact-card">
            <div className="binding-card-header">
              <div>
                <p className="entry-card-title">Suggested rebase fields</p>
                <p className="binding-meta">
                  {sourceDiff.changed
                    ? "当源 workflow 已发生演进时，rebase 会同步这些 source-derived 字段。"
                    : "当前 template snapshot 已与 source workflow 对齐。"}
                </p>
              </div>
              <span className="health-pill">{sourceDiff.changed ? "needs sync" : "synced"}</span>
            </div>
            <p className="section-copy starter-summary-copy">{rebaseRecommendation}</p>
            <div className="starter-tag-row">
              {sourceDiff.rebase_fields.length > 0 ? (
                sourceDiff.rebase_fields.map((field) => (
                  <span className="event-chip" key={field}>
                    {field}
                  </span>
                ))
              ) : (
                <span className="event-chip">no rebase needed</span>
              )}
            </div>
            <div className="binding-actions">
              <button
                className="sync-button secondary"
                type="button"
                onClick={onRebase}
                disabled={!sourceDiff.changed || isRebasing}
              >
                {isRebasing ? "Rebase 中..." : "执行 rebase"}
              </button>
            </div>
          </div>

          <DiffSection
            title="Node diff"
            summary={sourceDiff.node_summary}
            entries={sourceDiff.node_entries}
          />
          <DiffSection
            title="Edge diff"
            summary={sourceDiff.edge_summary}
            entries={sourceDiff.edge_entries}
          />
        </>
      )}
    </article>
  );
}

function DiffSection({
  title,
  summary,
  entries
}: {
  title: string;
  summary: WorkspaceStarterSourceDiff["node_summary"];
  entries: WorkspaceStarterSourceDiff["node_entries"];
}) {
  return (
    <div className="binding-card compact-card">
      <div className="binding-card-header">
        <div>
          <p className="entry-card-title">{title}</p>
          <p className="binding-meta">
            template {summary.template_count} / source {summary.source_count}
          </p>
        </div>
        <span className="health-pill">
          +{summary.added_count} / -{summary.removed_count} / ~{summary.changed_count}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="section-copy starter-summary-copy">当前这一层没有差异。</p>
      ) : (
        <div className="governance-node-list">
          {entries.map((entry) => (
            <div className="binding-card compact-card" key={`${entry.status}-${entry.id}`}>
              <div className="binding-card-header">
                <div>
                  <p className="entry-card-title">{entry.label}</p>
                  <p className="binding-meta">{entry.id}</p>
                </div>
                <span className="health-pill">{entry.status}</span>
              </div>
              {entry.changed_fields.length > 0 ? (
                <div className="starter-tag-row">
                  {entry.changed_fields.map((field) => (
                    <span className="event-chip" key={`${entry.id}-${field}`}>
                      {field}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getRebaseRecommendation(sourceDiff: WorkspaceStarterSourceDiff | null) {
  if (!sourceDiff) {
    return "当前没有可用于判断 drift 决策的来源信息。";
  }

  if (!sourceDiff.changed) {
    return "当前模板快照和来源 workflow 已对齐，无需执行 rebase。";
  }

  const definitionDrift =
    sourceDiff.node_summary.added_count +
      sourceDiff.node_summary.removed_count +
      sourceDiff.node_summary.changed_count +
      sourceDiff.edge_summary.added_count +
      sourceDiff.edge_summary.removed_count +
      sourceDiff.edge_summary.changed_count >
    0;

  if (definitionDrift && sourceDiff.workflow_name_changed) {
    return "源 workflow 的 definition 和默认名称都已变化。如果模板要继续跟随来源演进，优先执行 rebase；如果只想先观察最新快照，可先 refresh 再决定是否接受名称同步。";
  }

  if (definitionDrift) {
    return "当前 drift 主要来自 definition 演进。若团队确认模板应继续继承源 workflow，执行 rebase 可以一次同步 definition 与 source version。";
  }

  if (sourceDiff.workflow_name_changed) {
    return "当前 drift 主要来自默认 workflow 名称变化。refresh 只会更新快照与版本；如果希望模板命名也跟随来源，请执行 rebase。";
  }

  return "当前存在来源漂移，建议先检查变更字段，再决定是否执行 rebase。";
}
