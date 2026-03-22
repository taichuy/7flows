"use client";

import Link from "next/link";

import type {
  WorkspaceStarterSourceDiff,
  WorkspaceStarterSourceGovernance,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import {
  buildWorkspaceStarterSourceActionDecision,
  buildWorkspaceStarterSourceGovernanceSurface
} from "./shared";

type WorkspaceStarterSourceCardProps = {
  template: WorkspaceStarterTemplateItem;
  sourceGovernance: WorkspaceStarterSourceGovernance | null;
  sourceDiff: WorkspaceStarterSourceDiff | null;
  isLoadingSourceDiff: boolean;
  isRefreshing: boolean;
  isRebasing: boolean;
  createWorkflowHref?: string | null;
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
  createWorkflowHref = null,
  onRefresh,
  onRebase
}: WorkspaceStarterSourceCardProps) {
  const hasSourceBinding = Boolean(template.created_from_workflow_id);
  const fallbackActionDecision = buildWorkspaceStarterSourceActionDecision(sourceDiff);
  const sourceGovernanceSurface = buildWorkspaceStarterSourceGovernanceSurface({
    template,
    createWorkflowHref,
    fallbackActionDecision
  });
  const presenter = sourceGovernanceSurface.presenter;
  const actionDecision = sourceGovernanceSurface.actionDecision;
  const canRefresh = hasSourceBinding && !isLoadingSourceDiff && actionDecision.canRefresh;
  const canRebase = hasSourceBinding && !isLoadingSourceDiff && actionDecision.canRebase;
  const shouldShowSourceActions = isLoadingSourceDiff || canRefresh || canRebase;
  const templateNextStep = template.recommended_next_step.trim();
  const recommendedNextStep = sourceGovernanceSurface.recommendedNextStep;
  const createWorkflowActionLabel =
    recommendedNextStep?.action === "create_workflow" ? recommendedNextStep.label : null;
  const governanceFollowUp = presenter.followUp;
  const shouldRenderStandaloneGovernanceFollowUp =
    Boolean(governanceFollowUp) && governanceFollowUp !== recommendedNextStep?.detail;
  const shouldRenderGovernanceSummaryStrip =
    Boolean(sourceGovernance) || presenter.kind === "unknown" || presenter.kind === "no_source";

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
        <span className="health-pill">{presenter.statusLabel}</span>
      </div>
      <p className="section-copy starter-summary-copy">
        {presenter.summary}
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
          {recommendedNextStep ? (
            <div className="entry-card compact-card">
              <div className="payload-card-header">
                <span className="status-meta">Recommended next step</span>
                <span className="event-chip">{recommendedNextStep.label}</span>
              </div>
              <p className="section-copy starter-summary-copy">{recommendedNextStep.detail}</p>
            </div>
          ) : (
            <p className="section-copy starter-summary-copy">
              {isLoadingSourceDiff
                ? "正在加载 source diff，稍后会把 refresh / rebase 建议收口到这里。"
                : governanceFollowUp || actionDecision.summary}
            </p>
          )}
          {shouldRenderStandaloneGovernanceFollowUp ? (
            <p className="binding-meta">{governanceFollowUp}</p>
          ) : null}
          {templateNextStep ? (
            <p className="section-copy starter-summary-copy">
              <strong>Template note:</strong> {templateNextStep}
            </p>
          ) : null}
          {shouldShowSourceActions || createWorkflowActionLabel ? (
            <div className="binding-actions">
              {shouldShowSourceActions ? (
                <>
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
                </>
              ) : null}
              {createWorkflowActionLabel && createWorkflowHref ? (
                <Link className="inline-link secondary" href={createWorkflowHref}>
                  {createWorkflowActionLabel}
                </Link>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {!hasSourceBinding && createWorkflowActionLabel && createWorkflowHref ? (
        <div className="binding-actions">
          <Link className="inline-link secondary" href={createWorkflowHref}>
            {createWorkflowActionLabel}
          </Link>
        </div>
      ) : null}
      {shouldRenderGovernanceSummaryStrip ? (
        <div className="summary-strip compact-strip">
          <div className="summary-card">
            <span>Template ver</span>
            <strong>{sourceGovernance?.template_version ?? template.created_from_workflow_version ?? "n/a"}</strong>
          </div>
          <div className="summary-card">
            <span>Source ver</span>
            <strong>{presenter.sourceVersion ?? "n/a"}</strong>
          </div>
          <div className="summary-card">
            <span>Governance kind</span>
            <strong>{presenter.kind}</strong>
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
