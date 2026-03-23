import React from "react";
import Link from "next/link";

import { normalizeOperatorRunFollowUp } from "@/app/actions/run-snapshot";
import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { RunExecutionNodeItem, RunExecutionView } from "@/lib/get-run-views";
import {
  buildOperatorRecommendedActionCandidate,
  buildSharedOrLocalOperatorCandidate,
  buildOperatorRecommendedNextStep,
  buildOperatorRunSnapshotMetaRows,
  buildOperatorFollowUpSurfaceCopy,
  type OperatorRecommendedActionLike
} from "@/lib/operator-follow-up-presenters";
import {
  buildOperatorRunFollowUpSampleInboxContext,
  resolveOperatorRunFollowUpSample
} from "@/lib/operator-run-follow-up-samples";
import {
  buildCallbackWaitingAutomationFollowUpCandidate,
  buildSandboxReadinessFollowUpCandidate,
  shouldPreferSharedSandboxReadinessFollowUp
} from "@/lib/system-overview-follow-up-presenters";
import {
  buildExecutionFocusSectionSurfaceCopy,
  formatExecutionFocusArtifactSummary,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";
import { buildRunDiagnosticsExecutionTimelineHref } from "@/lib/run-diagnostics-links";
import { buildSensitiveAccessTimelineInboxHref } from "@/lib/sensitive-access-links";
import {
  buildRunDetailExecutionFocusSurfaceCopy,
  buildRunDiagnosticsOperatorFollowUpSurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import { buildRunDetailHref } from "@/lib/workbench-links";

type RunDiagnosticsOperatorFollowUpCardProps = {
  executionView: RunExecutionView;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function RunDiagnosticsOperatorFollowUpCard({
  executionView,
  callbackWaitingAutomation,
  sandboxReadiness = null
}: RunDiagnosticsOperatorFollowUpCardProps) {
  const snapshot = executionView.run_snapshot;
  const followUp = executionView.run_follow_up;
  const normalizedRunFollowUp = normalizeOperatorRunFollowUp(followUp ?? null);

  if (!snapshot && !followUp?.explanation && !executionView.execution_focus_explanation) {
    return null;
  }

  const surfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const diagnosticsSurfaceCopy = buildRunDiagnosticsOperatorFollowUpSurfaceCopy();
  const executionSurfaceCopy = buildRunDetailExecutionFocusSurfaceCopy();
  const focusSurfaceCopy = buildExecutionFocusSectionSurfaceCopy("diagnostics");
  const currentRunHref = buildRunDetailHref(executionView.run_id);
  const executionTimelineHref = buildRunDiagnosticsExecutionTimelineHref(executionView.run_id);
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
  const callbackFollowUp = snapshot?.callback_waiting_explanation?.follow_up ?? null;
  const executionFollowUp =
    snapshot?.execution_focus_explanation?.follow_up ??
    executionView.execution_focus_explanation?.follow_up ??
    null;
  const hasCallbackFacts = hasCallbackWaitingFacts(snapshot);
  const hasExecutionFocusFacts = hasExecutionFacts(snapshot, executionView);
  const sharedCallbackCandidate = hasCallbackFacts
    ? buildCallbackWaitingAutomationFollowUpCandidate(
        callbackWaitingAutomation,
        "callback recovery"
      )
    : null;
  const canonicalCallbackCandidate = buildOperatorRecommendedActionCandidate({
    action: followUp?.recommended_action ?? null,
    detail: callbackFollowUp ?? followUp?.explanation?.follow_up ?? null,
    fallbackDetail: diagnosticsSurfaceCopy.callbackFallbackDetail,
    scope: "callback",
    surfaceCopy
  });
  const sampledCallbackContext =
    sharedCallbackCandidate || canonicalCallbackCandidate
      ? null
      : buildOperatorRunFollowUpSampleInboxContext({
          runFollowUp: normalizedRunFollowUp,
          runId: executionView.run_id
        });
  const sampledCallbackAction: OperatorRecommendedActionLike | null = sampledCallbackContext
    ? {
        kind: sampledCallbackContext.kind,
        entry_key: "operatorInbox",
        href: sampledCallbackContext.href,
        label: sampledCallbackContext.hrefLabel ?? surfaceCopy.openInboxSliceLabel
      }
    : null;
  const sampledCallbackCandidate = buildOperatorRecommendedActionCandidate({
    action: sampledCallbackAction,
    detail: callbackFollowUp ?? followUp?.explanation?.follow_up ?? null,
    fallbackDetail: diagnosticsSurfaceCopy.callbackFallbackDetail,
    scope: "callback",
    surfaceCopy
  });
  const executionNeedsSharedSandboxFollowUp = shouldPreferSharedSandboxReadinessFollowUp({
    blockedExecution:
      executionView.execution_focus_reason === "blocked_execution" ||
      snapshot?.execution_focus_reason === "blocked_execution",
    signals: [
      snapshot?.execution_focus_explanation?.primary_signal,
      executionFollowUp,
      executionView.execution_focus_explanation?.primary_signal,
      executionView.execution_focus_explanation?.follow_up,
      snapshot?.execution_focus_node_type
    ]
  });
  const sharedSandboxCandidate = hasExecutionFocusFacts && executionNeedsSharedSandboxFollowUp
    ? buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness")
    : null;
  const canonicalExecutionCandidate = buildOperatorRecommendedActionCandidate({
    action: followUp?.recommended_action ?? null,
    detail: executionFollowUp ?? followUp?.explanation?.follow_up ?? null,
    fallbackDetail: executionSurfaceCopy.recommendedNextStepFallbackDetail,
    scope: "execution",
    surfaceCopy
  });
  const recommendedNextStep = buildOperatorRecommendedNextStep({
    callback: buildSharedOrLocalOperatorCandidate({
      sharedCandidate:
        sharedCallbackCandidate ?? canonicalCallbackCandidate ?? sampledCallbackCandidate,
      active: hasCallbackFacts,
      currentHref: currentRunHref,
      href: executionTimelineHref,
      label: "observe waiting",
      detail: callbackFollowUp ?? followUp?.explanation?.follow_up ?? null,
      hrefLabel: "jump to execution timeline",
      fallbackDetail: diagnosticsSurfaceCopy.callbackFallbackDetail,
      surfaceCopy
    }),
    execution: buildSharedOrLocalOperatorCandidate({
      sharedCandidate: sharedSandboxCandidate ?? canonicalExecutionCandidate,
      active: hasExecutionFocusFacts,
      currentHref: currentRunHref,
      href: executionTimelineHref,
      label: "inspect execution focus",
      detail: executionFollowUp ?? followUp?.explanation?.follow_up ?? null,
      hrefLabel: "jump to execution timeline",
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
  const sampledFollowUp = resolveOperatorRunFollowUpSample(normalizedRunFollowUp, executionView.run_id);
  const callbackSummaryFocusNode = resolveCallbackSummaryFocusNode(executionView, snapshot);
  const callbackSummaryInboxHref =
    buildCallbackSummaryInboxHref({
      runId: executionView.run_id,
      snapshot,
      focusNode: callbackSummaryFocusNode
    }) ?? sampledCallbackContext?.href ?? null;
  const callbackSummaryCallbackTickets =
    (callbackSummaryFocusNode?.callback_tickets.length ?? 0) > 0
      ? callbackSummaryFocusNode?.callback_tickets ?? []
      : sampledFollowUp?.callbackTickets ?? [];
  const callbackSummarySensitiveAccessEntries =
    (callbackSummaryFocusNode?.sensitive_access_entries.length ?? 0) > 0
      ? callbackSummaryFocusNode?.sensitive_access_entries ?? []
      : sampledFollowUp?.sensitiveAccessEntries ?? [];
  const callbackSummaryRecommendedAction =
    canonicalCallbackCandidate == null && sampledCallbackAction
      ? sampledCallbackAction
      : (followUp?.recommended_action ?? null);
  const callbackSummaryNodeRunId =
    snapshot?.execution_focus_node_run_id ??
    callbackSummaryFocusNode?.node_run_id ??
    sampledFollowUp?.snapshot?.executionFocusNodeRunId ??
    null;
  const callbackSummaryNodeId =
    snapshot?.execution_focus_node_id ??
    callbackSummaryFocusNode?.node_id ??
    sampledFollowUp?.snapshot?.executionFocusNodeId ??
    null;
  const callbackSummaryNodeName =
    snapshot?.execution_focus_node_name ??
    callbackSummaryFocusNode?.node_name ??
    sampledFollowUp?.snapshot?.executionFocusNodeName ??
    null;

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
          callbackTickets={callbackSummaryCallbackTickets}
          callbackWaitingAutomation={callbackWaitingAutomation}
          lifecycle={snapshot.callback_waiting_lifecycle ?? null}
          callbackWaitingExplanation={snapshot.callback_waiting_explanation ?? null}
          inboxHref={callbackSummaryInboxHref}
          waitingReason={snapshot.waiting_reason ?? null}
          scheduledResumeDelaySeconds={snapshot.scheduled_resume_delay_seconds ?? null}
          scheduledResumeSource={snapshot.scheduled_resume_source ?? null}
          scheduledWaitingStatus={snapshot.scheduled_waiting_status ?? null}
          scheduledResumeScheduledAt={snapshot.scheduled_resume_scheduled_at ?? null}
          scheduledResumeDueAt={snapshot.scheduled_resume_due_at ?? null}
          scheduledResumeRequeuedAt={snapshot.scheduled_resume_requeued_at ?? null}
          scheduledResumeRequeueSource={snapshot.scheduled_resume_requeue_source ?? null}
          runId={executionView.run_id}
          nodeRunId={callbackSummaryNodeRunId}
          focusNodeEvidence={focusNodeEvidence}
          focusSkillReferenceLoads={focusSkillTrace?.loads ?? []}
          focusSkillReferenceCount={focusSkillTrace?.reference_count ?? 0}
          focusSkillReferenceNodeId={callbackSummaryNodeId}
          focusSkillReferenceNodeName={callbackSummaryNodeName}
          operatorFollowUp={followUp?.explanation?.follow_up ?? null}
          recommendedAction={callbackSummaryRecommendedAction}
          preferCanonicalRecommendedNextStep
          sensitiveAccessEntries={callbackSummarySensitiveAccessEntries}
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

function resolveCallbackSummaryFocusNode(
  executionView: RunExecutionView,
  snapshot: RunExecutionView["run_snapshot"]
): RunExecutionNodeItem | null {
  const focusNodeRunId = snapshot?.execution_focus_node_run_id?.trim() || null;
  const focusNodeId = snapshot?.execution_focus_node_id?.trim() || null;
  const explicitFocusNode = executionView.execution_focus_node ?? null;

  if (explicitFocusNode?.node_run_id && explicitFocusNode.node_run_id === focusNodeRunId) {
    return explicitFocusNode;
  }

  if (focusNodeRunId) {
    const matchedNode = executionView.nodes.find((node) => node.node_run_id === focusNodeRunId) ?? null;
    if (matchedNode) {
      return matchedNode;
    }
  }

  if (explicitFocusNode?.node_id && explicitFocusNode.node_id === focusNodeId) {
    return explicitFocusNode;
  }

  if (focusNodeId) {
    const matchedNode = executionView.nodes.find((node) => node.node_id === focusNodeId) ?? null;
    if (matchedNode) {
      return matchedNode;
    }
  }

  return explicitFocusNode;
}

function buildCallbackSummaryInboxHref({
  runId,
  snapshot,
  focusNode
}: {
  runId: string;
  snapshot: RunExecutionView["run_snapshot"];
  focusNode?: RunExecutionNodeItem | null;
}) {
  const focusSensitiveAccessEntry = focusNode?.sensitive_access_entries.find(
    (entry) => entry.approval_ticket != null
  );
  if (focusSensitiveAccessEntry) {
    return buildSensitiveAccessTimelineInboxHref(focusSensitiveAccessEntry, runId);
  }

  const focusCallbackTicket = focusNode?.callback_tickets[0];
  if (!focusCallbackTicket) {
    return null;
  }

  return buildCallbackTicketInboxHref(focusCallbackTicket, {
    runId,
    nodeRunId:
      focusCallbackTicket.node_run_id ?? focusNode?.node_run_id ?? snapshot?.execution_focus_node_run_id ?? null
  });
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
