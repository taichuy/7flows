import type { RunExecutionNodeItem } from "@/lib/get-run-views";
import {
  formatDuration,
  formatDurationMs,
  formatJsonPayload,
  formatTimestamp
} from "@/lib/runtime-presenters";

import {
  ArtifactPreviewList,
  MetricChipRow
} from "@/components/run-diagnostics-execution/shared";

export function ExecutionNodeCard({ node }: { node: RunExecutionNodeItem }) {
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

      {node.waiting_reason ? <p className="run-error-message">{node.waiting_reason}</p> : null}
      {node.error_message ? <p className="run-error-message">{node.error_message}</p> : null}

      <div className="event-type-strip">
        <span className="event-chip">exec {node.execution_class}</span>
        <span className="event-chip">source {node.execution_source}</span>
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
      </div>

      <div className="event-type-strip">
        <span className="event-chip">events {node.event_count}</span>
        <span className="event-chip">artifacts {node.artifacts.length}</span>
        <span className="event-chip">tools {node.tool_calls.length}</span>
        <span className="event-chip">ai {node.ai_calls.length}</span>
        {node.callback_tickets.length > 0 ? (
          <span className="event-chip">tickets {node.callback_tickets.length}</span>
        ) : null}
        {node.last_event_type ? <span className="event-chip">last {node.last_event_type}</span> : null}
      </div>

      {node.callback_waiting_lifecycle ? (
        <>
          <div className="event-type-strip">
            <span className="event-chip">
              wait cycles {node.callback_waiting_lifecycle.wait_cycle_count}
            </span>
            <span className="event-chip">
              expired {node.callback_waiting_lifecycle.expired_ticket_count}
            </span>
            {node.callback_waiting_lifecycle.max_expired_ticket_count > 0 ? (
              <span className="event-chip">
                max expired {node.callback_waiting_lifecycle.max_expired_ticket_count}
              </span>
            ) : null}
            {node.callback_waiting_lifecycle.late_callback_count > 0 ? (
              <span className="event-chip">
                late callbacks {node.callback_waiting_lifecycle.late_callback_count}
              </span>
            ) : null}
            {typeof node.callback_waiting_lifecycle.last_resume_delay_seconds === "number" ? (
              <span className="event-chip">
                resume {node.callback_waiting_lifecycle.last_resume_delay_seconds}s
              </span>
            ) : null}
            {node.callback_waiting_lifecycle.last_resume_backoff_attempt > 0 ? (
              <span className="event-chip">
                backoff #{node.callback_waiting_lifecycle.last_resume_backoff_attempt}
              </span>
            ) : null}
            {node.callback_waiting_lifecycle.terminated ? (
              <span className="event-chip">terminated</span>
            ) : null}
          </div>

          <div className="event-type-strip">
            {node.callback_waiting_lifecycle.last_ticket_status ? (
              <span className="event-chip">
                ticket {node.callback_waiting_lifecycle.last_ticket_status}
              </span>
            ) : null}
            {node.callback_waiting_lifecycle.last_resume_source ? (
              <span className="event-chip">
                resume source {node.callback_waiting_lifecycle.last_resume_source}
              </span>
            ) : null}
            {node.callback_waiting_lifecycle.last_late_callback_status ? (
              <span className="event-chip">
                late status {node.callback_waiting_lifecycle.last_late_callback_status}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {node.callback_waiting_lifecycle?.terminated ? (
        <p className="run-error-message">
          callback waiting terminated
          {node.callback_waiting_lifecycle.termination_reason
            ? ` · ${node.callback_waiting_lifecycle.termination_reason}`
            : ""}
          {node.callback_waiting_lifecycle.terminated_at
            ? ` · ${formatTimestamp(node.callback_waiting_lifecycle.terminated_at)}`
            : ""}
        </p>
      ) : null}

      <MetricChipRow
        title="Event types"
        emptyCopy="No node-level events were recorded for this execution node."
        metrics={node.event_type_counts}
        prefix="event"
      />

      {node.tool_calls.length > 0 ? (
        <div className="event-list">
          {node.tool_calls.map((toolCall) => (
            <article className="event-row compact-card" key={toolCall.id}>
              <div className="event-meta">
                <span>{toolCall.tool_name}</span>
                <span>{toolCall.status}</span>
              </div>
              <p className="event-run">
                {toolCall.phase} · {formatDurationMs(toolCall.latency_ms)} · tool {toolCall.tool_id}
              </p>
              <pre>
                {formatJsonPayload({
                  request_summary: toolCall.request_summary,
                  response_summary: toolCall.response_summary,
                  raw_ref: toolCall.raw_ref
                })}
              </pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.ai_calls.length > 0 ? (
        <div className="event-list">
          {node.ai_calls.map((aiCall) => (
            <article className="event-row compact-card" key={aiCall.id}>
              <div className="event-meta">
                <span>{aiCall.role}</span>
                <span>{aiCall.status}</span>
              </div>
              <p className="event-run">
                {aiCall.provider ?? "provider?"} · {aiCall.model_id ?? "model?"} · {formatDurationMs(aiCall.latency_ms)}
              </p>
              <pre>
                {formatJsonPayload({
                  input_summary: aiCall.input_summary,
                  output_summary: aiCall.output_summary,
                  assistant: aiCall.assistant,
                  token_usage: aiCall.token_usage
                })}
              </pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.callback_tickets.length > 0 ? (
        <div className="event-list">
          {node.callback_tickets.map((ticket) => (
            <article className="event-row compact-card" key={ticket.ticket}>
              <div className="event-meta">
                <span>{ticket.status}</span>
                <span>{ticket.waiting_status}</span>
              </div>
              <p className="event-run">
                ticket {ticket.ticket} · tool {ticket.tool_id ?? "n/a"}
              </p>
              <pre>
                {formatJsonPayload({
                  reason: ticket.reason,
                  callback_payload: ticket.callback_payload
                })}
              </pre>
            </article>
          ))}
        </div>
      ) : null}

      <ArtifactPreviewList artifacts={node.artifacts} />
    </article>
  );
}
