import React from "react";

import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { RunExecutionNodeItem, RunExecutionView } from "@/lib/get-run-views";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { pickCallbackWaitingSkillTraceForNode } from "@/lib/callback-waiting-focus-skill-trace";
import {
  hasCallbackWaitingSummaryFacts,
  hasExecutionNodeCallbackWaitingSummaryFacts
} from "@/lib/callback-waiting-facts";
import {
  hasScheduledResume,
  pickTopBlockerNodes
} from "@/lib/run-execution-blockers";
import { resolveSensitiveAccessTimelineEntryRunId } from "@/lib/sensitive-access";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import {
  buildExecutionFocusDiagnosticsBlockerMetaCopy,
  buildExecutionFocusDiagnosticsBlockerSurfaceCopy,
  formatExecutionFocusArtifactSummary,
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal,
  formatExecutionFocusReasonLabel,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusRuntimeFactBadges,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { buildRunDetailHref } from "@/lib/workbench-links";

function buildNodeInboxHref(node: RunExecutionNodeItem, defaultRunId?: string | null): string | null {
  const latestApprovalEntry = node.sensitive_access_entries.find((entry) => entry.approval_ticket);
  if (!latestApprovalEntry && node.callback_tickets.length === 0) {
    return null;
  }

  return buildSensitiveAccessInboxHref({
    runId: latestApprovalEntry
      ? resolveSensitiveAccessTimelineEntryRunId(latestApprovalEntry, defaultRunId)
      : defaultRunId ?? null,
    nodeRunId: node.node_run_id,
    status: latestApprovalEntry?.approval_ticket?.status ?? null,
    waitingStatus: latestApprovalEntry?.approval_ticket?.waiting_status ?? null,
    accessRequestId: latestApprovalEntry?.request.id ?? null,
    approvalTicketId: latestApprovalEntry?.approval_ticket?.id ?? null
  });
}

function pickNodeSkillReferenceLoads(
  node: RunExecutionNodeItem,
  skillTrace: RunExecutionView["skill_trace"]
) {
  const nodeSkillTrace = pickCallbackWaitingSkillTraceForNode(skillTrace, node.node_run_id);
  if (nodeSkillTrace) {
    return nodeSkillTrace.nodes.flatMap((item) => item.loads);
  }
  return node.skill_reference_loads;
}

function renderNodeFollowUp({
  callbackWaitingAutomation,
  inboxHref,
  node,
  runId,
  skillTrace
}: {
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  inboxHref: string | null;
  node: RunExecutionNodeItem;
  runId: string;
  skillTrace: RunExecutionView["skill_trace"];
}) {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const currentRunHref = buildRunDetailHref(runId);
  const nodeSkillTrace = pickCallbackWaitingSkillTraceForNode(skillTrace, node.node_run_id);
  const skillReferenceLoads = pickNodeSkillReferenceLoads(node, skillTrace);
  const hasCallbackWaitingSummary = hasCallbackWaitingSummaryFacts({
    callbackWaitingExplanation: node.callback_waiting_explanation,
    callbackWaitingLifecycle: node.callback_waiting_lifecycle,
    waitingReason: node.waiting_reason,
    scheduledResumeDelaySeconds: node.scheduled_resume_delay_seconds,
    scheduledResumeSource: node.scheduled_resume_source,
    scheduledWaitingStatus: node.scheduled_waiting_status,
    scheduledResumeScheduledAt: node.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: node.scheduled_resume_due_at,
    scheduledResumeRequeuedAt: node.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: node.scheduled_resume_requeue_source
  });

  if (hasCallbackWaitingSummary) {
    return (
      <CallbackWaitingSummaryCard
        currentHref={currentRunHref}
        callbackTickets={node.callback_tickets}
        callbackWaitingAutomation={callbackWaitingAutomation}
        callbackWaitingExplanation={node.callback_waiting_explanation}
        className="callback-waiting-summary-card"
        focusNodeEvidence={node}
        inboxHref={inboxHref}
        lifecycle={node.callback_waiting_lifecycle}
        nodeRunId={node.node_run_id}
        runId={runId}
        scheduledResumeDelaySeconds={node.scheduled_resume_delay_seconds}
        scheduledResumeSource={node.scheduled_resume_source}
        scheduledWaitingStatus={node.scheduled_waiting_status}
        scheduledResumeScheduledAt={node.scheduled_resume_scheduled_at}
        scheduledResumeDueAt={node.scheduled_resume_due_at}
        scheduledResumeRequeuedAt={node.scheduled_resume_requeued_at}
        scheduledResumeRequeueSource={node.scheduled_resume_requeue_source}
        sensitiveAccessEntries={node.sensitive_access_entries}
        focusSkillTrace={nodeSkillTrace}
        focusSkillReferenceCount={node.skill_reference_load_count}
        focusSkillReferenceLoads={node.skill_reference_loads}
        focusSkillReferenceNodeId={node.node_id}
        focusSkillReferenceNodeName={node.node_name}
        waitingReason={node.waiting_reason}
      />
    );
  }

  return (
    <>
      <OperatorFocusEvidenceCard
        artifactCount={node.artifacts.length}
        artifactRefCount={node.artifact_refs.length}
        artifactSummary={formatExecutionFocusArtifactSummary(node)}
        artifacts={listExecutionFocusArtifactPreviews(node)}
        toolCallCount={node.tool_calls.length}
        toolCallSummaries={listExecutionFocusToolCallSummaries(node)}
      />
      <SkillReferenceLoadList
        skillReferenceLoads={skillReferenceLoads}
        title={operatorSurfaceCopy.focusedSkillTraceTitle}
        description={buildExecutionFocusDiagnosticsBlockerSurfaceCopy().focusedSkillTraceDescription}
      />
    </>
  );
}

export function RunDiagnosticsExecutionOverviewBlockers({
  executionView,
  callbackWaitingAutomation,
  sandboxReadiness = null
}: {
  executionView: RunExecutionView;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
}) {
  const focusNode = executionView.execution_focus_node ?? null;
  const skillTrace = executionView.skill_trace ?? null;
  const focusNodePrimarySignal =
    executionView.execution_focus_explanation?.primary_signal ??
    (focusNode ? formatExecutionFocusPrimarySignal(focusNode) : null);
  const focusNodeFollowUp =
    executionView.execution_focus_explanation?.follow_up ??
    (focusNode ? formatExecutionFocusFollowUp(focusNode) : null);
  const focusNodeExecutionFactBadges = listExecutionFocusRuntimeFactBadges(focusNode);
  const focusNodeHasCallbackWaitingSummary = hasExecutionNodeCallbackWaitingSummaryFacts(focusNode);
  const surfaceCopy = buildExecutionFocusDiagnosticsBlockerSurfaceCopy();
  const blockerNodes = pickTopBlockerNodes(executionView).filter(
    (node) => node.node_run_id !== focusNode?.node_run_id
  );

  if (!focusNode && blockerNodes.length === 0) {
    return null;
  }

  return (
    <section>
      <strong>{surfaceCopy.sectionTitle}</strong>
      <p className="section-copy entry-copy">{surfaceCopy.sectionDescription}</p>
      {focusNode ? (
        <div className="publish-cache-list">
          <article className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Execution focus</span>
              <span className="event-chip">
                {formatExecutionFocusReasonLabel(executionView.execution_focus_reason)}
              </span>
            </div>
            <p className="entry-card-title">{focusNode.node_name}</p>
            <p className="timeline-meta">
              {focusNode.node_type} · node run {focusNode.node_run_id}
            </p>
            <p className="binding-meta">{surfaceCopy.focusNodeDescription}</p>
            {focusNodeExecutionFactBadges.length > 0 ? (
              <div className="tool-badge-row">
                {focusNodeExecutionFactBadges.map((badge) => (
                  <span className="event-chip" key={`${focusNode.node_run_id}-${badge}`}>
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
            {focusNodePrimarySignal && !focusNodeHasCallbackWaitingSummary ? (
              <p className="section-copy entry-copy">{focusNodePrimarySignal}</p>
            ) : null}
            {focusNodeFollowUp && !focusNodeHasCallbackWaitingSummary ? (
              <p className="binding-meta">{focusNodeFollowUp}</p>
            ) : null}
            <SandboxExecutionReadinessCard
              node={focusNode}
              readiness={sandboxReadiness}
            />
            {renderNodeFollowUp({
              callbackWaitingAutomation,
              inboxHref: buildNodeInboxHref(focusNode, executionView.run_id),
              node: focusNode,
              runId: executionView.run_id,
              skillTrace
            })}
          </article>
        </div>
      ) : null}
      {blockerNodes.length > 0 ? (
      <div className="publish-cache-list">
        {blockerNodes.map((node) => {
          const inboxHref = buildNodeInboxHref(node, executionView.run_id);
          const primarySignal =
            node.execution_focus_explanation?.primary_signal ??
            formatExecutionFocusPrimarySignal(node);
          const followUp =
            node.execution_focus_explanation?.follow_up ??
            formatExecutionFocusFollowUp(node);
          const executionFactBadges = listExecutionFocusRuntimeFactBadges(node);
          const hasCallbackWaitingSummary = hasExecutionNodeCallbackWaitingSummaryFacts(node);
          const blockerMetaCopy = buildExecutionFocusDiagnosticsBlockerMetaCopy(node);

          return (
            <article className="payload-card compact-card" key={node.node_run_id}>
              <div className="payload-card-header">
                <span className="status-meta">Priority blocker</span>
                <span className={`event-chip`}>{node.status}</span>
              </div>
              <p className="entry-card-title">{node.node_name}</p>
              <p className="timeline-meta">
                {node.node_type} · node run {node.node_run_id}
              </p>
              <p className="binding-meta">{blockerMetaCopy.summary}</p>
              {node.started_at ? (
                <p className="binding-meta">Started {formatTimestamp(node.started_at)}</p>
              ) : null}
              {executionFactBadges.length > 0 ? (
                <div className="tool-badge-row">
                  {executionFactBadges.map((badge) => (
                    <span className="event-chip" key={`${node.node_run_id}-${badge}`}>
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
              {primarySignal && !hasCallbackWaitingSummary ? (
                <p className="section-copy entry-copy">{primarySignal}</p>
              ) : null}
              {followUp && !hasCallbackWaitingSummary ? (
                <p className="binding-meta">{followUp}</p>
              ) : null}
              <SandboxExecutionReadinessCard
                node={node}
                readiness={sandboxReadiness}
              />
              {renderNodeFollowUp({
                callbackWaitingAutomation,
                inboxHref,
                node,
                runId: executionView.run_id,
                skillTrace
              })}
            </article>
          );
        })}
      </div>
      ) : null}
    </section>
  );
}
