import React from "react";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { RunDetail } from "@/lib/get-run-detail";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildRunDetailExecutionFocusViewModel } from "@/lib/run-detail-execution-focus";
import {
  formatExecutionFocusArtifactSummary,
  formatExecutionFocusReasonLabel,
  formatMetricSummary,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusRuntimeFactBadges,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";

type RunDetailExecutionFocusCardProps = {
  run: RunDetail;
  title?: string;
  description?: string | null;
  className?: string;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function RunDetailExecutionFocusCard({
  run,
  title = "Canonical execution focus",
  description = null,
  className = "",
  sandboxReadiness = null
}: RunDetailExecutionFocusCardProps) {
  const focus = buildRunDetailExecutionFocusViewModel(run);
  if (!focus) {
    return null;
  }
  const shouldDeferToCallbackWaitingSummary = focus.hasCallbackSummary;
  const executionFactBadges = listExecutionFocusRuntimeFactBadges(focus.evidence);

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
        {focus.followUp && !shouldDeferToCallbackWaitingSummary ? (
          <p className="binding-meta">{focus.followUp}</p>
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
            callbackWaitingExplanation={focus.callbackWaitingExplanation}
            lifecycle={focus.callbackWaitingLifecycle}
            focusNodeEvidence={focus.evidence}
            focusSkillReferenceCount={focus.skillReferenceCount}
            focusSkillReferenceLoads={focus.skillReferenceLoads}
            focusSkillReferenceNodeId={focus.nodeId}
            focusSkillReferenceNodeName={focus.nodeName}
            nodeRunId={focus.nodeRunId}
            runId={run.id}
            scheduledResumeDelaySeconds={focus.scheduledResumeDelaySeconds}
            scheduledResumeDueAt={focus.scheduledResumeDueAt}
            scheduledResumeRequeuedAt={focus.scheduledResumeRequeuedAt}
            scheduledResumeRequeueSource={focus.scheduledResumeRequeueSource}
            scheduledResumeScheduledAt={focus.scheduledResumeScheduledAt}
            scheduledResumeSource={focus.scheduledResumeSource}
            scheduledWaitingStatus={focus.scheduledWaitingStatus}
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
                  <span className="status-meta">Focused skill trace</span>
                  <span className="event-chip">refs {focus.skillReferenceCount}</span>
                </div>
                <p className="section-copy entry-copy">
                  当前 diagnostics / overlay 已直接消费 run detail 里的 execution focus
                  skill trace，不必再等 execution view 才知道当前聚焦节点注入了哪些参考资料。
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
                  title="Injected references"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
