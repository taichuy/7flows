import type { RunExecutionNodeItem } from "@/lib/get-run-views";
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
import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";

function formatExecutionBackendExtensions(
  value: RunExecutionNodeItem["execution_backend_extensions"]
): string | null {
  if (!value || Object.keys(value).length === 0) {
    return null;
  }

  return JSON.stringify(value);
}

export function ExecutionNodeCard({ node, runId }: { node: RunExecutionNodeItem; runId: string }) {
  const latestApprovalEntry = node.sensitive_access_entries.find((entry) => entry.approval_ticket);
  const inboxHref =
    node.sensitive_access_entries.length > 0 || node.callback_tickets.length > 0
      ? buildSensitiveAccessInboxHref({
          runId: latestApprovalEntry?.request.run_id ?? latestApprovalEntry?.approval_ticket?.run_id ?? null,
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
        <p className="activity-copy">Backend extensions {backendExtensionsPreview}</p>
      ) : null}

      <div className="event-type-strip">
        <span className="event-chip">dispatch {node.execution_dispatched_count}</span>
        <span className="event-chip">fallback {node.execution_fallback_count}</span>
        <span className="event-chip">blocked {node.execution_blocked_count}</span>
        <span className="event-chip">unavailable {node.execution_unavailable_count}</span>
      </div>

      {node.execution_fallback_reason ? (
        <p className="activity-copy">Execution fallback: {node.execution_fallback_reason}</p>
      ) : null}

      {node.execution_blocking_reason ? (
        <p className="run-error-message">Execution blocked: {node.execution_blocking_reason}</p>
      ) : null}

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
        lifecycle={node.callback_waiting_lifecycle}
        callbackTickets={node.callback_tickets}
        sensitiveAccessEntries={node.sensitive_access_entries}
        waitingReason={node.waiting_reason}
        inboxHref={inboxHref}
        runId={runId}
        nodeRunId={node.node_run_id}
        scheduledResumeDelaySeconds={node.scheduled_resume_delay_seconds}
        scheduledResumeSource={node.scheduled_resume_source}
        scheduledWaitingStatus={node.scheduled_waiting_status}
        scheduledResumeScheduledAt={node.scheduled_resume_scheduled_at}
        scheduledResumeDueAt={node.scheduled_resume_due_at}
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
            entries={node.sensitive_access_entries}
            emptyCopy="No sensitive access decisions were recorded for this node."
            defaultRunId={latestApprovalEntry?.request.run_id ?? latestApprovalEntry?.approval_ticket?.run_id ?? null}
          />
      </ExecutionNodeSensitiveAccessSection>

      <ExecutionNodeArtifactSection artifacts={node.artifacts} />
    </article>
  );
}
