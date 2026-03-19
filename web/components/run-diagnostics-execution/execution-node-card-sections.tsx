import Link from "next/link";
import type { ReactNode } from "react";

import type {
  AICallItem,
  RunArtifactItem,
  RunCallbackTicketItem,
  SkillReferenceLoadItem,
  ToolCallItem
} from "@/lib/get-run-views";
import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";
import { listCallbackTicketDetailRows } from "@/lib/callback-waiting-presenters";
import { formatDurationMs, formatJsonPayload } from "@/lib/runtime-presenters";

import { ArtifactPreviewList } from "@/components/run-diagnostics-execution/shared";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";

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

function buildToolExecutionBadges(toolCall: ToolCallItem): string[] {
  const badges: string[] = [];

  if (toolCall.requested_execution_class) {
    badges.push(`requested ${toolCall.requested_execution_class}`);
  }
  if (toolCall.effective_execution_class) {
    badges.push(`effective ${toolCall.effective_execution_class}`);
  }
  if (toolCall.execution_sandbox_runner_kind) {
    badges.push(`runner ${toolCall.execution_sandbox_runner_kind}`);
  }
  if (toolCall.execution_sandbox_backend_id) {
    badges.push(`backend ${toolCall.execution_sandbox_backend_id}`);
  }
  if (toolCall.execution_fallback_reason) {
    badges.push("fallback");
  }
  if (toolCall.execution_blocking_reason) {
    badges.push("blocked");
  }

  return badges;
}

export function ExecutionNodeToolCallList({ toolCalls }: { toolCalls: ToolCallItem[] }) {
  if (toolCalls.length === 0) {
    return null;
  }

  return (
    <section>
      <SectionHeader title="Tool calls" count={toolCalls.length} />
      <div className="event-list">
        {toolCalls.map((toolCall) => {
          const executionBadges = buildToolExecutionBadges(toolCall);

          return (
            <article className="event-row compact-card" key={toolCall.id}>
              <div className="event-meta">
                <span>{toolCall.tool_name}</span>
                <span>{toolCall.status}</span>
              </div>
              <p className="event-run">
                {toolCall.phase} · {formatDurationMs(toolCall.latency_ms)} · tool {toolCall.tool_id}
              </p>
              {executionBadges.length > 0 ? (
                <div className="tool-badge-row">
                  {executionBadges.map((badge) => (
                    <span className="event-chip" key={`${toolCall.id}:${badge}`}>
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
              {toolCall.execution_blocking_reason ? (
                <p className="section-copy entry-copy">
                  blocked: {toolCall.execution_blocking_reason}
                </p>
              ) : null}
              {toolCall.execution_fallback_reason ? (
                <p className="section-copy entry-copy">
                  fallback: {toolCall.execution_fallback_reason}
                </p>
              ) : null}
              <pre>
                {formatJsonPayload({
                  request_summary: toolCall.request_summary,
                  response_summary: toolCall.response_summary,
                  response_content_type: toolCall.response_content_type,
                  response_meta: toolCall.response_meta,
                  raw_ref: toolCall.raw_ref,
                  execution_trace: toolCall.execution_trace
                })}
              </pre>
            </article>
          );
        })}
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

export function ExecutionNodeSkillReferenceLoadList({
  skillReferenceLoads
}: {
  skillReferenceLoads: SkillReferenceLoadItem[];
}) {
  return <SkillReferenceLoadList skillReferenceLoads={skillReferenceLoads} />;
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
        {callbackTickets.map((ticket) => {
          const inboxHref = buildCallbackTicketInboxHref(ticket);
          const detailRows = listCallbackTicketDetailRows(ticket, { mode: "compact" });
          return (
            <article className="event-row compact-card" key={ticket.ticket}>
              <div className="event-meta">
                <span>{ticket.status}</span>
                <span>{ticket.waiting_status}</span>
              </div>
              <p className="event-run">
                ticket {ticket.ticket} · tool {ticket.tool_id ?? "n/a"}
              </p>
              {inboxHref ? (
                <div className="tool-badge-row">
                  <Link className="event-chip inbox-filter-link" href={inboxHref}>
                    open inbox slice
                  </Link>
                </div>
              ) : null}
              {detailRows.map((row) => (
                <p className="section-copy entry-copy" key={`${ticket.ticket}:${row.label}`}>
                  {row.label}: {row.value}
                </p>
              ))}
              <pre>
                {formatJsonPayload({
                  callback_payload: ticket.callback_payload,
                  tool_call_id: ticket.tool_call_id
                })}
              </pre>
            </article>
          );
        })}
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
