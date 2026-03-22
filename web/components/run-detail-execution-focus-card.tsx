import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { RunDetail } from "@/lib/get-run-detail";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  buildOperatorRecommendedActionCandidate,
  buildOperatorFollowUpSurfaceCopy,
  buildSharedOrLocalOperatorCandidate,
  buildOperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import {
  buildSandboxReadinessFollowUpCandidate,
  shouldPreferSharedSandboxReadinessFollowUp
} from "@/lib/system-overview-follow-up-presenters";
import { buildRunDetailExecutionFocusViewModel } from "@/lib/run-detail-execution-focus";
import {
  formatExecutionFocusArtifactSummary,
  formatExecutionFocusReasonLabel,
  formatMetricSummary,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusRuntimeFactBadges,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";
import { buildRunDetailExecutionFocusSurfaceCopy } from "@/lib/workbench-entry-surfaces";

type RunDetailExecutionFocusCardProps = {
  run: RunDetail;
  title?: string;
  description?: string | null;
  className?: string;
  sandboxReadiness?: SandboxReadinessCheck | null;
  recommendedNextStepHref?: string | null;
  recommendedNextStepHrefLabel?: string | null;
};

export function RunDetailExecutionFocusCard({
  run,
  title = "Canonical execution focus",
  description = null,
  className = "",
  sandboxReadiness = null,
  recommendedNextStepHref = null,
  recommendedNextStepHrefLabel = null
}: RunDetailExecutionFocusCardProps) {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const executionSurfaceCopy = buildRunDetailExecutionFocusSurfaceCopy();
  const focus = buildRunDetailExecutionFocusViewModel(run);
  if (!focus) {
    return null;
  }
  const executionFactBadges = listExecutionFocusRuntimeFactBadges(focus.evidence);
  const explicitExecutionFollowUp = run.execution_focus_explanation?.follow_up?.trim() || null;
  const executionNeedsSharedSandboxFollowUp = shouldPreferSharedSandboxReadinessFollowUp({
    blockedExecution: focus.reason === "blocked_execution",
    signals: [focus.primarySignal, explicitExecutionFollowUp, focus.nodeType]
  });
  const sharedSandboxCandidate = executionNeedsSharedSandboxFollowUp
    ? buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness")
    : null;
  const shouldDeferToCallbackWaitingSummary = focus.hasCallbackSummary && !sharedSandboxCandidate;
  const canonicalExecutionCandidate = buildOperatorRecommendedActionCandidate({
    action: run.run_follow_up?.recommended_action ?? null,
    detail: explicitExecutionFollowUp ?? run.run_follow_up?.explanation?.follow_up ?? null,
    fallbackDetail: executionSurfaceCopy.recommendedNextStepFallbackDetail,
    scope: "any",
    surfaceCopy: operatorSurfaceCopy
  });
  const executionCandidate = buildSharedOrLocalOperatorCandidate({
    sharedCandidate: sharedSandboxCandidate ?? canonicalExecutionCandidate,
    active: true,
    href: recommendedNextStepHref,
    runId: run.id,
    label: "execution focus",
    detail: explicitExecutionFollowUp ?? run.run_follow_up?.explanation?.follow_up ?? null,
    hrefLabel: recommendedNextStepHrefLabel,
    fallbackDetail: executionSurfaceCopy.recommendedNextStepFallbackDetail,
    surfaceCopy: operatorSurfaceCopy
  });
  const recommendedNextStep = !shouldDeferToCallbackWaitingSummary
    ? buildOperatorRecommendedNextStep({
        execution: executionCandidate
      })
    : null;
  const shouldRenderStandaloneExecutionFollowUp =
    !shouldDeferToCallbackWaitingSummary &&
    Boolean(explicitExecutionFollowUp) &&
    explicitExecutionFollowUp !== recommendedNextStep?.detail;

  return (
    <div className={className}>
      <div className="entry-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">{title}</span>
          <span className="event-chip">
            {formatExecutionFocusReasonLabel(focus.reason)}
          </span>
          <span className="event-chip">node run {focus.nodeRunId}</span>
        </div>

        {description ? <p className="section-copy entry-copy">{description}</p> : null}
        {focus.primarySignal && !shouldDeferToCallbackWaitingSummary ? (
          <p className="section-copy entry-copy">{focus.primarySignal}</p>
        ) : null}
        {shouldRenderStandaloneExecutionFollowUp ? (
          <p className="section-copy entry-copy">{explicitExecutionFollowUp}</p>
        ) : null}
        {recommendedNextStep ? (
          <div className="entry-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">{operatorSurfaceCopy.recommendedNextStepTitle}</span>
              <span className="event-chip">{recommendedNextStep.label}</span>
              {recommendedNextStep.href && recommendedNextStep.href_label ? (
                <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                  {recommendedNextStep.href_label}
                </Link>
              ) : null}
            </div>
            <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
          </div>
        ) : null}

        <div className="tool-badge-row">
          <span className="event-chip">{focus.nodeName}</span>
          <span className="event-chip">{focus.nodeType}</span>
          {focus.artifactCount > 0 ? (
            <span className="event-chip">artifacts {focus.artifactCount}</span>
          ) : null}
          {focus.artifactRefCount > 0 ? (
            <span className="event-chip">artifact refs {focus.artifactRefCount}</span>
          ) : null}
          {focus.toolCallCount > 0 ? (
            <span className="event-chip">tool calls {focus.toolCallCount}</span>
          ) : null}
          {focus.rawRefCount > 0 ? (
            <span className="event-chip">raw refs {focus.rawRefCount}</span>
          ) : null}
          {focus.skillReferenceCount > 0 ? (
            <span className="event-chip">skill refs {focus.skillReferenceCount}</span>
          ) : null}
          {!shouldDeferToCallbackWaitingSummary
            ? executionFactBadges.map((badge) => (
                <span className="event-chip" key={`${focus.nodeRunId}-${badge}`}>
                  {badge}
                </span>
              ))
            : null}
        </div>

        <p className="binding-meta">node {focus.nodeId}</p>

        {run.execution_focus_node ? (
          <SandboxExecutionReadinessCard
            node={run.execution_focus_node}
            readiness={sandboxReadiness}
          />
        ) : null}

        {focus.hasCallbackSummary ? (
          <CallbackWaitingSummaryCard
            callbackTickets={focus.callbackTickets}
            callbackWaitingExplanation={focus.callbackWaitingExplanation}
            lifecycle={focus.callbackWaitingLifecycle}
            focusNodeEvidence={focus.evidence}
            focusSkillReferenceCount={focus.skillReferenceCount}
            focusSkillReferenceLoads={focus.skillReferenceLoads}
            focusSkillReferenceNodeId={focus.nodeId}
            focusSkillReferenceNodeName={focus.nodeName}
            inboxHref={focus.callbackSummaryInboxHref}
            nodeRunId={focus.nodeRunId}
            operatorFollowUp={run.run_follow_up?.explanation?.follow_up ?? null}
            recommendedAction={run.run_follow_up?.recommended_action ?? null}
            preferCanonicalRecommendedNextStep
            runId={run.id}
            scheduledResumeDelaySeconds={focus.scheduledResumeDelaySeconds}
            scheduledResumeDueAt={focus.scheduledResumeDueAt}
            scheduledResumeRequeuedAt={focus.scheduledResumeRequeuedAt}
            scheduledResumeRequeueSource={focus.scheduledResumeRequeueSource}
            scheduledResumeScheduledAt={focus.scheduledResumeScheduledAt}
            scheduledResumeSource={focus.scheduledResumeSource}
            scheduledWaitingStatus={focus.scheduledWaitingStatus}
            sensitiveAccessEntries={focus.sensitiveAccessEntries}
            showFocusExecutionFacts={shouldDeferToCallbackWaitingSummary}
            showInlineActions={false}
            waitingReason={focus.waitingReason}
          />
        ) : null}

        {!focus.hasCallbackSummary ? (
          <>
            <OperatorFocusEvidenceCard
              artifactCount={focus.artifactCount}
              artifactRefCount={focus.artifactRefCount}
              artifacts={listExecutionFocusArtifactPreviews(focus.evidence)}
              artifactSummary={formatExecutionFocusArtifactSummary(focus.evidence)}
              title="Focused execution evidence"
              toolCallCount={focus.toolCallCount}
              toolCallSummaries={listExecutionFocusToolCallSummaries(focus.evidence)}
            />

            {focus.skillReferenceCount > 0 ? (
              <div className="entry-card compact-card">
                <div className="payload-card-header">
                  <span className="status-meta">{operatorSurfaceCopy.focusedSkillTraceTitle}</span>
                  <span className="event-chip">refs {focus.skillReferenceCount}</span>
                </div>
                <p className="section-copy entry-copy">
                  {executionSurfaceCopy.focusedSkillTraceDescription}
                </p>
                <div className="tool-badge-row">
                  {formatMetricSummary(focus.skillReferencePhaseCounts) ? (
                    <span className="event-chip">
                      phases {formatMetricSummary(focus.skillReferencePhaseCounts)}
                    </span>
                  ) : null}
                  {formatMetricSummary(focus.skillReferenceSourceCounts) ? (
                    <span className="event-chip">
                      sources {formatMetricSummary(focus.skillReferenceSourceCounts)}
                    </span>
                  ) : null}
                </div>
                <SkillReferenceLoadList
                  description="当前 execution focus 节点已注入的 skill references。"
                  skillReferenceLoads={focus.skillReferenceLoads}
                  title={operatorSurfaceCopy.injectedReferencesTitle}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
