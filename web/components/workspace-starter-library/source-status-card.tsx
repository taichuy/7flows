"use client";

import { WorkbenchEntryLink } from "@/components/workbench-entry-links";

import type {
  WorkspaceStarterSourceDiff,
  WorkspaceStarterSourceGovernance,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import {
  buildWorkspaceStarterSourceCardSurface,
  buildWorkspaceStarterSourceActionDecision,
  buildWorkspaceStarterSourceGovernanceSurface
} from "./shared";
import { WorkspaceStarterFollowUpCard } from "./follow-up-card";

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
  const sourceCardSurface = buildWorkspaceStarterSourceCardSurface({
    template,
    sourceGovernance,
    sourceGovernanceSurface,
    isLoadingSourceDiff
  });
  const presenter = sourceGovernanceSurface.presenter;
  const actionDecision = sourceGovernanceSurface.actionDecision;
  const canRefresh = hasSourceBinding && !isLoadingSourceDiff && actionDecision.canRefresh;
  const canRebase = hasSourceBinding && !isLoadingSourceDiff && actionDecision.canRebase;
  const shouldShowSourceActions = isLoadingSourceDiff || canRefresh || canRebase;
  const templateNextStep = template.recommended_next_step.trim();
  const recommendedNextStep = sourceGovernanceSurface.recommendedNextStep;
  const recommendedNextStepEntryKey = recommendedNextStep?.entryKey;
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
            {sourceCardSurface.sourceLabel}
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
              {sourceCardSurface.actionStatusLabel}
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
            <WorkspaceStarterFollowUpCard
              detail={recommendedNextStep.detail}
              label={recommendedNextStep.label}
              primaryResourceSummary={recommendedNextStep.primaryResourceSummary}
            />
          ) : (
            <p className="section-copy starter-summary-copy">
              {sourceCardSurface.fallbackDetail}
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
          {shouldShowSourceActions || recommendedNextStepEntryKey ? (
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
              {recommendedNextStepEntryKey ? (
                <WorkbenchEntryLink
                  className="inline-link secondary"
                  linkKey={recommendedNextStepEntryKey}
                  override={recommendedNextStep?.entryOverride}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      {!hasSourceBinding && recommendedNextStepEntryKey ? (
        <div className="binding-actions">
          <WorkbenchEntryLink
            className="inline-link secondary"
            linkKey={recommendedNextStepEntryKey}
            override={recommendedNextStep?.entryOverride}
          />
        </div>
      ) : null}
      {shouldRenderGovernanceSummaryStrip ? (
        <div className="summary-strip compact-strip">
          {sourceCardSurface.summaryCards.map((card) => (
            <div className="summary-card" key={`${card.label}-${card.value}`}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
