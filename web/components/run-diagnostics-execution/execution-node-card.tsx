import React from "react";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { RunExecutionNodeItem, RunExecutionSkillTrace } from "@/lib/get-run-views";
import {
  formatDuration,
  formatDurationMs,
  formatTimestamp
} from "@/lib/runtime-presenters";

import {
  MetricChipRow
} from "@/components/run-diagnostics-execution/shared";
import {
  ExecutionNodeAiCallList,
  ExecutionNodeArtifactSection,
  ExecutionNodeCallbackTicketList,
  ExecutionNodeSkillReferenceLoadList,
  ExecutionNodeSensitiveAccessSection,
  ExecutionNodeToolCallList
} from "@/components/run-diagnostics-execution/execution-node-card-sections";
import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import { pickCallbackWaitingSkillTraceForNode } from "@/lib/callback-waiting-focus-skill-trace";
import { hasExecutionNodeCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  buildExecutionNodeDiagnosticsSurfaceCopy,
  formatExecutionBlockingReasonCopy,
  formatExecutionFallbackReasonCopy,
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal
} from "@/lib/run-execution-focus-presenters";
import { buildOperatorTraceSliceLinkSurface } from "@/lib/operator-follow-up-presenters";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import { resolveSensitiveAccessTimelineEntryRunId } from "@/lib/sensitive-access";
import { buildRunDetailHref } from "@/lib/workbench-links";

function formatExecutionBackendExtensions(
  value: RunExecutionNodeItem["execution_backend_extensions"]
): string | null {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

function formatRequestedExecutionSummary(node: RunExecutionNodeItem): string | null {
  if (!node.requested_execution_class) {
    return null;
  }

  const segments = [
    `class ${node.requested_execution_class}`,
    node.requested_execution_source ? `source ${node.requested_execution_source}` : null,
    node.requested_execution_profile ? `profile ${node.requested_execution_profile}` : null,
    typeof node.requested_execution_timeout_ms === "number"
      ? `timeout ${formatDurationMs(node.requested_execution_timeout_ms)}`
      : null,
    node.requested_execution_network_policy
      ? `network ${node.requested_execution_network_policy}`
      : null,
    node.requested_execution_filesystem_policy
      ? `fs ${node.requested_execution_filesystem_policy}`
      : null,
    node.requested_execution_dependency_mode
      ? `deps ${node.requested_execution_dependency_mode}`
      : null,
    node.requested_execution_builtin_package_set
      ? `builtin ${node.requested_execution_builtin_package_set}`
      : null,
    node.requested_execution_dependency_ref
      ? `dep ref ${node.requested_execution_dependency_ref}`
      : null
  ].filter((segment): segment is string => Boolean(segment));

  return segments.length > 0 ? segments.join(" · ") : null;
}

function shouldShowRequestedExecution(node: RunExecutionNodeItem): boolean {
  return Boolean(
    node.requested_execution_class &&
      (node.requested_execution_class !== node.execution_class ||
        node.requested_execution_source !== node.execution_source ||
        node.requested_execution_profile ||
        typeof node.requested_execution_timeout_ms === "number" ||
        node.requested_execution_network_policy ||
        node.requested_execution_filesystem_policy ||
        node.requested_execution_dependency_mode ||
        node.requested_execution_builtin_package_set ||
        node.requested_execution_dependency_ref ||
        node.requested_execution_backend_extensions)
  );
}

export function ExecutionNodeCard({
  node,
  runId,
  callbackWaitingAutomation,
  sandboxReadiness = null,
  skillTrace = null
}: {
  node: RunExecutionNodeItem;
  runId: string;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
  skillTrace?: RunExecutionSkillTrace | null;
}) {
  const currentRunHref = buildRunDetailHref(runId);
  const focusEvidenceDrilldownLink = buildOperatorTraceSliceLinkSurface({
    runId,
    runHref: currentRunHref,
    currentHref: currentRunHref,
    nodeRunId: node.node_run_id
  });
  const latestApprovalEntry = node.sensitive_access_entries.find((entry) => entry.approval_ticket);
  const inboxHref =
    node.sensitive_access_entries.length > 0 || node.callback_tickets.length > 0
      ? buildSensitiveAccessInboxHref({
          runId: latestApprovalEntry
            ? resolveSensitiveAccessTimelineEntryRunId(latestApprovalEntry, runId)
            : runId,
          nodeRunId: node.node_run_id,
          status: latestApprovalEntry?.approval_ticket?.status ?? null,
          waitingStatus: latestApprovalEntry?.approval_ticket?.waiting_status ?? null,
          accessRequestId: latestApprovalEntry?.request.id ?? null,
          approvalTicketId: latestApprovalEntry?.approval_ticket?.id ?? null
        })
      : null;
  const backendExtensionsPreview = formatExecutionBackendExtensions(
    node.execution_backend_extensions
  );
  const requestedBackendExtensionsPreview = formatExecutionBackendExtensions(
    node.requested_execution_backend_extensions
  );
  const requestedExecutionSummary = formatRequestedExecutionSummary(node);
  const showRequestedExecution = shouldShowRequestedExecution(node);
  const executionPrimarySignal =
    node.execution_focus_explanation?.primary_signal ??
    formatExecutionFocusPrimarySignal(node);
  const executionFollowUp =
    node.execution_focus_explanation?.follow_up ?? formatExecutionFocusFollowUp(node);
  const hasCallbackWaitingSummary = hasExecutionNodeCallbackWaitingSummaryFacts(node);
  const rawBlockingCopy = formatExecutionBlockingReasonCopy(node.execution_blocking_reason);
  const nodeSkillTrace = pickCallbackWaitingSkillTraceForNode(skillTrace, node.node_run_id);
  const surfaceCopy = buildExecutionNodeDiagnosticsSurfaceCopy();

  return (
    <article className="timeline-row">
      <div className="activity-header">
        <div>
          <h3>{node.node_name}</h3>
          <p className="timeline-meta">
            {node.node_type} · node {node.node_id}
          </p>
        </div>
        <span className={`health-pill ${node.status}`}>{node.status}</span>
      </div>

      <p className="activity-copy">
        Phase {node.phase ?? "n/a"} · Started {formatTimestamp(node.started_at)} · Finished{" "}
        {formatTimestamp(node.finished_at)} · Duration {formatDuration(node.started_at, node.finished_at)}
      </p>
      <p className="event-run">node run {node.node_run_id}</p>

      {node.error_message ? <p className="run-error-message">{node.error_message}</p> : null}

      <div className="event-type-strip">
        <span className="event-chip">exec {node.execution_class}</span>
        <span className="event-chip">source {node.execution_source}</span>
        {node.effective_execution_class ? (
          <span className="event-chip">effective {node.effective_execution_class}</span>
        ) : null}
        {node.execution_executor_ref ? (
          <span className="event-chip">executor {node.execution_executor_ref}</span>
        ) : null}
        {node.execution_sandbox_backend_id ? (
          <span className="event-chip">sandbox {node.execution_sandbox_backend_id}</span>
        ) : null}
        {node.execution_sandbox_runner_kind ? (
          <span className="event-chip">runner {node.execution_sandbox_runner_kind}</span>
        ) : null}
        {node.execution_sandbox_backend_executor_ref ? (
          <span className="event-chip">
            backend-executor {node.execution_sandbox_backend_executor_ref}
          </span>
        ) : null}
        {node.execution_profile ? (
          <span className="event-chip">profile {node.execution_profile}</span>
        ) : null}
        {typeof node.execution_timeout_ms === "number" ? (
          <span className="event-chip">timeout {formatDurationMs(node.execution_timeout_ms)}</span>
        ) : null}
        {node.execution_network_policy ? (
          <span className="event-chip">network {node.execution_network_policy}</span>
        ) : null}
        {node.execution_filesystem_policy ? (
          <span className="event-chip">fs {node.execution_filesystem_policy}</span>
        ) : null}
        {node.execution_dependency_mode ? (
          <span className="event-chip">deps {node.execution_dependency_mode}</span>
        ) : null}
        {node.execution_builtin_package_set ? (
          <span className="event-chip">builtin {node.execution_builtin_package_set}</span>
        ) : null}
        {node.execution_dependency_ref ? (
          <span className="event-chip">dep ref {node.execution_dependency_ref}</span>
        ) : null}
        {backendExtensionsPreview ? (
          <span className="event-chip">backend ext {Object.keys(node.execution_backend_extensions ?? {}).length}</span>
        ) : null}
      </div>

      {backendExtensionsPreview ? (
        <p className="activity-copy">
          {surfaceCopy.backendExtensionsDescriptionPrefix} {backendExtensionsPreview}
        </p>
      ) : null}

      {showRequestedExecution && requestedExecutionSummary ? (
        <p className="activity-copy">
          {surfaceCopy.requestedExecutionDescriptionPrefix} {requestedExecutionSummary}
        </p>
      ) : null}

      {showRequestedExecution && requestedBackendExtensionsPreview ? (
        <p className="activity-copy">
          {surfaceCopy.requestedBackendExtensionsDescriptionPrefix} {requestedBackendExtensionsPreview}
        </p>
      ) : null}

      <div className="event-type-strip">
        <span className="event-chip">dispatch {node.execution_dispatched_count}</span>
        <span className="event-chip">fallback {node.execution_fallback_count}</span>
        <span className="event-chip">blocked {node.execution_blocked_count}</span>
        <span className="event-chip">unavailable {node.execution_unavailable_count}</span>
      </div>

      {executionPrimarySignal && !hasCallbackWaitingSummary ? (
        <p className={node.execution_blocking_reason ? "run-error-message" : "activity-copy"}>
          {executionPrimarySignal}
        </p>
      ) : null}

      {executionFollowUp && !hasCallbackWaitingSummary ? (
        <p className="binding-meta">{executionFollowUp}</p>
      ) : null}

      {node.execution_fallback_reason && !node.execution_blocking_reason ? (
        <p className="activity-copy">
          {formatExecutionFallbackReasonCopy(node.execution_fallback_reason)}
        </p>
      ) : null}

      {rawBlockingCopy && executionPrimarySignal !== `执行阻断：${node.execution_blocking_reason}` ? (
        <p className="activity-copy">{rawBlockingCopy}</p>
      ) : null}

      <SandboxExecutionReadinessCard node={node} readiness={sandboxReadiness} />

      <div className="event-type-strip">
        <span className="event-chip">events {node.event_count}</span>
        <span className="event-chip">artifacts {node.artifacts.length}</span>
        <span className="event-chip">tools {node.tool_calls.length}</span>
        <span className="event-chip">ai {node.ai_calls.length}</span>
        {node.skill_reference_load_count > 0 ? (
          <span className="event-chip">skill refs {node.skill_reference_load_count}</span>
        ) : null}
        {node.callback_tickets.length > 0 ? (
          <span className="event-chip">tickets {node.callback_tickets.length}</span>
        ) : null}
        {node.last_event_type ? <span className="event-chip">last {node.last_event_type}</span> : null}
      </div>

      <CallbackWaitingSummaryCard
        currentHref={currentRunHref}
        lifecycle={node.callback_waiting_lifecycle}
        callbackWaitingExplanation={node.callback_waiting_explanation}
        callbackTickets={node.callback_tickets}
        callbackWaitingAutomation={callbackWaitingAutomation}
        focusNodeEvidence={node}
        focusSkillTrace={nodeSkillTrace}
        focusSkillReferenceCount={node.skill_reference_load_count}
        focusSkillReferenceLoads={node.skill_reference_loads}
        focusSkillReferenceNodeId={node.node_id}
        focusSkillReferenceNodeName={node.node_name}
        sensitiveAccessEntries={node.sensitive_access_entries}
        waitingReason={node.waiting_reason}
        inboxHref={inboxHref}
        runId={runId}
        nodeRunId={node.node_run_id}
        focusEvidenceDrilldownLink={focusEvidenceDrilldownLink}
        scheduledResumeDelaySeconds={node.scheduled_resume_delay_seconds}
        scheduledResumeSource={node.scheduled_resume_source}
        scheduledWaitingStatus={node.scheduled_waiting_status}
        scheduledResumeScheduledAt={node.scheduled_resume_scheduled_at}
        scheduledResumeDueAt={node.scheduled_resume_due_at}
        scheduledResumeRequeuedAt={node.scheduled_resume_requeued_at}
        scheduledResumeRequeueSource={node.scheduled_resume_requeue_source}
      />

      <MetricChipRow
        title="Event types"
        emptyCopy="No node-level events were recorded for this execution node."
        metrics={node.event_type_counts}
        prefix="event"
      />

      <ExecutionNodeToolCallList toolCalls={node.tool_calls} />

      <ExecutionNodeAiCallList aiCalls={node.ai_calls} />

      <ExecutionNodeSkillReferenceLoadList skillReferenceLoads={node.skill_reference_loads} />

      <ExecutionNodeCallbackTicketList callbackTickets={node.callback_tickets} />

      <ExecutionNodeSensitiveAccessSection count={node.sensitive_access_entries.length}>
          <SensitiveAccessTimelineEntryList
            callbackTickets={node.callback_tickets}
            callbackWaitingAutomation={callbackWaitingAutomation}
            entries={node.sensitive_access_entries}
            emptyCopy="No sensitive access decisions were recorded for this node."
            defaultRunId={latestApprovalEntry?.request.run_id ?? latestApprovalEntry?.approval_ticket?.run_id ?? null}
            sandboxReadiness={sandboxReadiness}
          />
      </ExecutionNodeSensitiveAccessSection>

      <ExecutionNodeArtifactSection artifacts={node.artifacts} />
    </article>
  );
}
