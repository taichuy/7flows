import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { RunExecutionView } from "@/lib/get-run-views";
import {
  buildOperatorRunDetailCandidate,
  buildOperatorRecommendedNextStep,
  buildOperatorRunSnapshotMetaRows,
  buildOperatorFollowUpSurfaceCopy
} from "@/lib/operator-follow-up-presenters";
import {
  buildExecutionFocusSectionSurfaceCopy,
  formatExecutionFocusArtifactSummary,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";
import {
  buildRunDetailExecutionFocusSurfaceCopy,
  buildRunDiagnosticsOperatorFollowUpSurfaceCopy
} from "@/lib/workbench-entry-surfaces";

type RunDiagnosticsOperatorFollowUpCardProps = {
  executionView: RunExecutionView;
};

export function RunDiagnosticsOperatorFollowUpCard({
  executionView
}: RunDiagnosticsOperatorFollowUpCardProps) {
  const snapshot = executionView.run_snapshot;
  const followUp = executionView.run_follow_up;

  if (!snapshot && !followUp?.explanation && !executionView.execution_focus_explanation) {
    return null;
  }

  const surfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const diagnosticsSurfaceCopy = buildRunDiagnosticsOperatorFollowUpSurfaceCopy();
  const executionSurfaceCopy = buildRunDetailExecutionFocusSurfaceCopy();
  const focusSurfaceCopy = buildExecutionFocusSectionSurfaceCopy("diagnostics");
  const snapshotMetaRows = buildOperatorRunSnapshotMetaRows({
    runStatus: snapshot?.status ?? executionView.status,
    currentNodeId: snapshot?.current_node_id ?? null,
    focusNodeLabel: buildFocusNodeLabel(snapshot),
    waitingReason: snapshot?.waiting_reason ?? null,
    surfaceCopy
  });
  const primarySignal =
    snapshot?.callback_waiting_explanation?.primary_signal?.trim() ||
    snapshot?.execution_focus_explanation?.primary_signal?.trim() ||
    executionView.execution_focus_explanation?.primary_signal?.trim() ||
    followUp?.explanation?.primary_signal?.trim() ||
    null;
  const recommendedNextStep = buildOperatorRecommendedNextStep({
    callback: buildOperatorRunDetailCandidate({
      active: hasCallbackWaitingFacts(snapshot),
      label: "observe waiting",
      detail:
        snapshot?.callback_waiting_explanation?.follow_up ??
        executionView.execution_focus_explanation?.follow_up ??
        null,
      runId: executionView.run_id,
      fallbackDetail: diagnosticsSurfaceCopy.callbackFallbackDetail,
      surfaceCopy
    }),
    execution: buildOperatorRunDetailCandidate({
      active: hasExecutionFacts(snapshot, executionView),
      label: "inspect execution focus",
      detail:
        snapshot?.execution_focus_explanation?.follow_up ??
        executionView.execution_focus_explanation?.follow_up ??
        null,
      runId: executionView.run_id,
      fallbackDetail: executionSurfaceCopy.recommendedNextStepFallbackDetail,
      surfaceCopy
    }),
    operatorFollowUp: followUp?.explanation?.follow_up ?? null,
    operatorLabel: "operator follow-up"
  });
  const focusNodeEvidence = snapshot
    ? {
        artifact_refs: snapshot.execution_focus_artifact_refs,
        artifacts: snapshot.execution_focus_artifacts,
        tool_calls: snapshot.execution_focus_tool_calls,
        effective_execution_class:
          snapshot.execution_focus_tool_calls[0]?.effective_execution_class ?? null,
        execution_executor_ref:
          snapshot.execution_focus_tool_calls[0]?.execution_executor_ref ?? null,
        execution_sandbox_backend_id:
          snapshot.execution_focus_tool_calls[0]?.execution_sandbox_backend_id ?? null,
        execution_sandbox_runner_kind:
          snapshot.execution_focus_tool_calls[0]?.execution_sandbox_runner_kind ?? null
      }
    : null;
  const focusArtifacts = focusNodeEvidence
    ? listExecutionFocusArtifactPreviews(focusNodeEvidence)
    : [];
  const focusToolCallSummaries = focusNodeEvidence
    ? listExecutionFocusToolCallSummaries(focusNodeEvidence)
    : [];
  const focusArtifactSummary = focusNodeEvidence
    ? formatExecutionFocusArtifactSummary(focusNodeEvidence)
    : null;
  const focusSkillTrace = snapshot?.execution_focus_skill_trace ?? null;

  return (
    <section>
      <div className="section-heading compact-heading">
        <div>
          <span className="binding-label">Canonical operator follow-up</span>
        </div>
        <div className="tool-badge-row">
          <span className="event-chip">run {executionView.run_id}</span>
          {snapshot?.execution_focus_node_run_id ? (
            <span className="event-chip">focus run {snapshot.execution_focus_node_run_id}</span>
          ) : null}
          {focusSkillTrace?.reference_count ? (
            <span className="event-chip">skill refs {focusSkillTrace.reference_count}</span>
          ) : null}
        </div>
      </div>
      <p className="section-copy entry-copy">
        {diagnosticsSurfaceCopy.description}
      </p>
      {primarySignal ? <p className="section-copy entry-copy">{primarySignal}</p> : null}
      {snapshotMetaRows.length > 0 ? (
        <div className="summary-strip">
          {snapshotMetaRows.map((row) => (
            <article className="summary-card compact-card" key={row.key}>
              <div className="summary-label">{row.label}</div>
              <div className="summary-value">{row.value}</div>
            </article>
          ))}
        </div>
      ) : null}
      {recommendedNextStep ? (
        <article className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{surfaceCopy.recommendedNextStepTitle}</span>
            <span className="event-chip">{recommendedNextStep.label}</span>
            {recommendedNextStep.href && recommendedNextStep.href_label ? (
              <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                {recommendedNextStep.href_label}
              </Link>
            ) : null}
          </div>
          <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
        </article>
      ) : null}
      {snapshot ? (
        <CallbackWaitingSummaryCard
          lifecycle={snapshot.callback_waiting_lifecycle ?? null}
          callbackWaitingExplanation={snapshot.callback_waiting_explanation ?? null}
          waitingReason={snapshot.waiting_reason ?? null}
          scheduledResumeDelaySeconds={snapshot.scheduled_resume_delay_seconds ?? null}
          scheduledResumeSource={snapshot.scheduled_resume_source ?? null}
          scheduledWaitingStatus={snapshot.scheduled_waiting_status ?? null}
          scheduledResumeScheduledAt={snapshot.scheduled_resume_scheduled_at ?? null}
          scheduledResumeDueAt={snapshot.scheduled_resume_due_at ?? null}
          scheduledResumeRequeuedAt={snapshot.scheduled_resume_requeued_at ?? null}
          scheduledResumeRequeueSource={snapshot.scheduled_resume_requeue_source ?? null}
          runId={executionView.run_id}
          nodeRunId={snapshot.execution_focus_node_run_id ?? null}
          focusNodeEvidence={focusNodeEvidence}
          focusSkillReferenceLoads={focusSkillTrace?.loads ?? []}
          focusSkillReferenceCount={focusSkillTrace?.reference_count ?? 0}
          focusSkillReferenceNodeId={snapshot.execution_focus_node_id ?? null}
          focusSkillReferenceNodeName={snapshot.execution_focus_node_name ?? null}
          showFocusExecutionFacts
          showInlineActions={false}
        />
      ) : null}
      {focusNodeEvidence ? (
        <OperatorFocusEvidenceCard
          title="Focused tool execution"
          artifactSummary={focusArtifactSummary}
          artifactCount={snapshot?.execution_focus_artifact_count}
          artifactRefCount={snapshot?.execution_focus_artifact_ref_count ?? 0}
          toolCallCount={snapshot?.execution_focus_tool_call_count}
          toolCallSummaries={focusToolCallSummaries}
          artifacts={focusArtifacts}
        />
      ) : null}
      {focusSkillTrace?.loads.length ? (
        <SkillReferenceLoadList
          skillReferenceLoads={focusSkillTrace.loads}
          title={surfaceCopy.focusedSkillTraceTitle}
          description={focusSurfaceCopy.focusedSkillTraceDescription}
        />
      ) : null}
    </section>
  );
}

function buildFocusNodeLabel(snapshot: RunExecutionView["run_snapshot"]) {
  const focusNodeName = snapshot?.execution_focus_node_name?.trim();
  const focusNodeId = snapshot?.execution_focus_node_id?.trim();

  if (focusNodeName && focusNodeId) {
    return `${focusNodeName} (${focusNodeId})`;
  }

  return focusNodeName || focusNodeId || null;
}

function hasCallbackWaitingFacts(snapshot: RunExecutionView["run_snapshot"]) {
  return Boolean(
    snapshot?.callback_waiting_explanation ||
      snapshot?.callback_waiting_lifecycle ||
      snapshot?.waiting_reason ||
      snapshot?.scheduled_resume_due_at ||
      snapshot?.scheduled_resume_delay_seconds
  );
}

function hasExecutionFacts(
  snapshot: RunExecutionView["run_snapshot"],
  executionView: RunExecutionView
) {
  return Boolean(
    snapshot?.execution_focus_explanation ||
      snapshot?.execution_focus_node_id ||
      executionView.execution_focus_node ||
      executionView.execution_focus_reason
  );
}
