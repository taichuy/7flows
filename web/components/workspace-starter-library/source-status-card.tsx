"use client";

import type {
  WorkspaceStarterSourceActionDecisionPayload,
  WorkspaceStarterSourceDiff,
  WorkspaceStarterSourceGovernance,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import { buildWorkspaceStarterSourceActionDecision } from "./shared";

type WorkspaceStarterSourceCardProps = {
  template: WorkspaceStarterTemplateItem;
  sourceGovernance: WorkspaceStarterSourceGovernance | null;
  sourceDiff: WorkspaceStarterSourceDiff | null;
  isLoadingSourceDiff: boolean;
  isRefreshing: boolean;
  isRebasing: boolean;
  onRefresh: () => void;
  onRebase: () => void;
};

export function WorkspaceStarterSourceCard({
  template,
  sourceGovernance,
  sourceDiff,
  isLoadingSourceDiff,
  isRefreshing,
  isRebasing,
  onRefresh,
  onRebase
}: WorkspaceStarterSourceCardProps) {
  const hasSourceBinding = Boolean(template.created_from_workflow_id);
  const actionDecisionPayload =
    sourceGovernance?.action_decision ?? sourceDiff?.action_decision ?? null;
  const fallbackActionDecision = buildWorkspaceStarterSourceActionDecision(sourceDiff);
  const actionDecision = actionDecisionPayload
    ? normalizeActionDecision(actionDecisionPayload)
    : fallbackActionDecision;
  const canRefresh = hasSourceBinding && !isLoadingSourceDiff && actionDecision.canRefresh;
  const canRebase = hasSourceBinding && !isLoadingSourceDiff && actionDecision.canRebase;
  const templateNextStep = template.recommended_next_step.trim();

  return (
    <div className="binding-card compact-card">
      <div className="binding-card-header">
        <div>
          <p className="entry-card-title">Source workflow drift</p>
          <p className="binding-meta">
            {sourceGovernance?.source_workflow_name?.trim() ||
              template.created_from_workflow_id ||
              "no workflow binding"}
          </p>
        </div>
        <span className="health-pill">{sourceGovernance?.status_label ?? "-"}</span>
      </div>
      <p className="section-copy starter-summary-copy">
        {sourceGovernance?.outcome_explanation?.primary_signal?.trim() ||
          sourceGovernance?.summary ||
          "暂无来源治理状态。"}
      </p>
      {hasSourceBinding ? (
        <>
          <div className="starter-tag-row">
            <span className="health-pill">
              {isLoadingSourceDiff ? "loading diff" : actionDecision.statusLabel}
            </span>
            {!isLoadingSourceDiff
              ? actionDecision.factChips.map((item) => (
                  <span className="event-chip" key={`${template.id}-${item}`}>
                    {item}
                  </span>
                ))
              : null}
          </div>
          <p className="section-copy starter-summary-copy">
            {isLoadingSourceDiff
              ? "正在加载 source diff，稍后会把 refresh / rebase 建议收口到这里。"
              : sourceGovernance?.outcome_explanation?.follow_up?.trim() || actionDecision.summary}
          </p>
          {templateNextStep ? (
            <p className="section-copy starter-summary-copy">
              <strong>Template note:</strong> {templateNextStep}
            </p>
          ) : null}
          <div className="binding-actions">
            <button
              className={
                actionDecision.recommendedAction === "refresh"
                  ? "sync-button"
                  : "sync-button secondary"
              }
              type="button"
              onClick={onRefresh}
              disabled={!canRefresh || isRefreshing}
            >
              {isRefreshing ? "刷新中..." : "从源 workflow 刷新快照"}
            </button>
            <button
              className={
                actionDecision.recommendedAction === "rebase"
                  ? "sync-button"
                  : "sync-button secondary"
              }
              type="button"
              onClick={onRebase}
              disabled={!canRebase || isRebasing}
            >
              {isRebasing ? "Rebase 中..." : "执行 rebase"}
            </button>
          </div>
        </>
      ) : null}
      {sourceGovernance ? (
        <div className="summary-strip compact-strip">
          <div className="summary-card">
            <span>Template ver</span>
            <strong>{sourceGovernance.template_version ?? "n/a"}</strong>
          </div>
          <div className="summary-card">
            <span>Source ver</span>
            <strong>{sourceGovernance.source_version ?? "n/a"}</strong>
          </div>
          <div className="summary-card">
            <span>Governance kind</span>
            <strong>{sourceGovernance.kind}</strong>
          </div>
          <div className="summary-card">
            <span>Recommended</span>
            <strong>{actionDecision.recommendedAction}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeActionDecision(actionDecision: WorkspaceStarterSourceActionDecisionPayload) {
  return {
    recommendedAction: actionDecision.recommended_action,
    statusLabel: actionDecision.status_label,
    summary: actionDecision.summary,
    canRefresh: actionDecision.can_refresh,
    canRebase: actionDecision.can_rebase,
    factChips: actionDecision.fact_chips
  };
}
