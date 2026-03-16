import type { ReactNode } from "react";

import type {
  AICallItem,
  RunArtifactItem,
  RunCallbackTicketItem,
  ToolCallItem
} from "@/lib/get-run-views";
import { formatDurationMs, formatJsonPayload, formatTimestamp } from "@/lib/runtime-presenters";

import { ArtifactPreviewList } from "@/components/run-diagnostics-execution/shared";

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="section-heading compact-heading">
      <div>
        <span className="binding-label">{title}</span>
      </div>
      <div className="tool-badge-row">
        <span className="event-chip">count {count}</span>
      </div>
    </div>
  );
}

export function ExecutionNodeToolCallList({ toolCalls }: { toolCalls: ToolCallItem[] }) {
  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader title="Tool calls" count={toolCalls.length} />
      <div className="event-list">
        {toolCalls.map((toolCall) => (
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
    </section>
  );
}

export function ExecutionNodeAiCallList({ aiCalls }: { aiCalls: AICallItem[] }) {
  if (aiCalls.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader title="AI calls" count={aiCalls.length} />
      <div className="event-list">
        {aiCalls.map((aiCall) => (
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
    </section>
  );
}

export function ExecutionNodeCallbackTicketList({
  callbackTickets
}: {
  callbackTickets: RunCallbackTicketItem[];
}) {
  if (callbackTickets.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader title="Callback tickets" count={callbackTickets.length} />
      <div className="event-list">
        {callbackTickets.map((ticket) => (
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
    </section>
  );
}

export function ExecutionNodeArtifactSection({ artifacts }: { artifacts: RunArtifactItem[] }) {
  if (artifacts.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader title="Artifacts" count={artifacts.length} />
      <ArtifactPreviewList artifacts={artifacts} />
    </section>
  );
}

export function ExecutionNodeSensitiveAccessSection({
  children,
  count
}: {
  children: ReactNode;
  count: number;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader title="Sensitive access timeline" count={count} />
      <p className="section-copy entry-copy">
        Approval tickets, notification delivery and policy decisions stay grouped here so operator
        triage can continue without leaving the execution node.
      </p>
      {children}
    </section>
  );
}
