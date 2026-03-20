import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type {
  PublishedEndpointInvocationItem,
  PublishedEndpointInvocationCallbackTicketItem,
  PublishedEndpointInvocationDetailResponse,
  RunExecutionFocusExplanation
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import {
  getCallbackWaitingHeadline,
  listCallbackTicketDetailRows,
  listCallbackWaitingBlockerRows,
  listCallbackWaitingChips,
  listCallbackWaitingEventRows
} from "@/lib/callback-waiting-presenters";
import { buildPublishedInvocationInboxHref } from "@/lib/published-invocation-presenters";

type WorkflowPublishInvocationCallbackSectionProps = {
  invocation: PublishedEndpointInvocationItem;
  callbackTickets: PublishedEndpointInvocationCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  callbackWaitingExplanation?: RunExecutionFocusExplanation | null;
  executionFocusNode?: PublishedEndpointInvocationDetailResponse["execution_focus_node"];
};

function formatJsonPreview(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

export function WorkflowPublishInvocationCallbackSection({
  invocation,
  callbackTickets,
  sensitiveAccessEntries,
  callbackWaitingAutomation,
  callbackWaitingExplanation,
  executionFocusNode
}: WorkflowPublishInvocationCallbackSectionProps) {
  const waitingLifecycle = invocation.run_waiting_lifecycle;
  const callbackLifecycle = waitingLifecycle?.callback_waiting_lifecycle;
  const resolvedCallbackWaitingExplanation =
    callbackWaitingExplanation ?? waitingLifecycle?.callback_waiting_explanation ?? null;
  const headline =
    resolvedCallbackWaitingExplanation?.primary_signal?.trim() ||
    getCallbackWaitingHeadline({
      lifecycle: callbackLifecycle,
      callbackTickets,
      sensitiveAccessEntries,
      callbackWaitingAutomation,
      scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
      scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
      scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
      scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
      scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at,
      scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
      scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
    });
  const followUp = resolvedCallbackWaitingExplanation?.follow_up?.trim() || null;
  const chips = listCallbackWaitingChips({
    lifecycle: callbackLifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    callbackWaitingAutomation,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at,
    scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
  });
  const blockerRows = listCallbackWaitingBlockerRows({
    lifecycle: callbackLifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    callbackWaitingAutomation,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at,
    scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
  });
  const eventRows = listCallbackWaitingEventRows({
    lifecycle: callbackLifecycle,
    waitingReason: waitingLifecycle?.waiting_reason ?? invocation.run_waiting_reason,
    waitingNodeRunId: waitingLifecycle?.node_run_id ?? invocation.run_current_node_id ?? null,
    scheduledResumeRequeuedAt: waitingLifecycle?.scheduled_resume_requeued_at,
    scheduledResumeRequeueSource: waitingLifecycle?.scheduled_resume_requeue_source
  });
  const inboxHref = buildPublishedInvocationInboxHref({
    invocation,
    callbackTickets,
    sensitiveAccessEntries
  });

  return (
    <section>
      <strong>Callback waiting drilldown</strong>
      <p className="section-copy entry-copy">
        Callback ticket lifecycle, approval blockers and resume scheduling stay together here so
        published-surface debugging does not need to jump between run detail, inbox and async
        tickets.
      </p>
      {inboxHref ? (
        <div className="tool-badge-row">
          <Link className="event-chip inbox-filter-link" href={inboxHref}>
            open inbox slice
          </Link>
        </div>
      ) : null}
      <CallbackWaitingSummaryCard
        callbackTickets={callbackTickets}
        callbackWaitingAutomation={callbackWaitingAutomation}
        callbackWaitingExplanation={resolvedCallbackWaitingExplanation}
        focusNodeEvidence={executionFocusNode ?? null}
        focusSkillReferenceCount={executionFocusNode?.skill_reference_load_count ?? null}
        focusSkillReferenceLoads={executionFocusNode?.skill_reference_loads ?? []}
        focusSkillReferenceNodeId={executionFocusNode?.node_id ?? null}
        focusSkillReferenceNodeName={executionFocusNode?.node_name ?? null}
        lifecycle={callbackLifecycle}
        sensitiveAccessEntries={sensitiveAccessEntries}
        showFocusExecutionFacts
        waitingReason={waitingLifecycle?.waiting_reason ?? invocation.run_waiting_reason}
        scheduledResumeDelaySeconds={waitingLifecycle?.scheduled_resume_delay_seconds}
        scheduledResumeSource={waitingLifecycle?.scheduled_resume_source}
        scheduledWaitingStatus={waitingLifecycle?.scheduled_waiting_status}
        scheduledResumeScheduledAt={waitingLifecycle?.scheduled_resume_scheduled_at}
        scheduledResumeDueAt={waitingLifecycle?.scheduled_resume_due_at}
        scheduledResumeRequeuedAt={waitingLifecycle?.scheduled_resume_requeued_at}
        scheduledResumeRequeueSource={waitingLifecycle?.scheduled_resume_requeue_source}
        inboxHref={inboxHref}
        runId={invocation.run_id ?? null}
        nodeRunId={waitingLifecycle?.node_run_id ?? null}
      />
      {(headline || chips.length > 0 || blockerRows.length > 0 || eventRows.length > 0) ? (
        <div className="publish-meta-grid">
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Resume blockers</span>
            </div>
            <p className="section-copy entry-copy">{headline ?? "Callback waiting is not active."}</p>
            {followUp ? <p className="binding-meta">{followUp}</p> : null}
            {chips.length ? (
              <p className="binding-meta">{chips.join(" · ")}</p>
            ) : null}
            <dl className="compact-meta-list">
              {blockerRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Latest callback events</span>
            </div>
            <dl className="compact-meta-list">
              {eventRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      {callbackTickets.length ? (
        <div className="publish-cache-list">
          {callbackTickets.map((ticket) => {
            const ticketInboxHref = buildCallbackTicketInboxHref(ticket, {
              runId: invocation.run_id ?? null,
              nodeRunId: waitingLifecycle?.node_run_id ?? null
            });
            const detailRows = listCallbackTicketDetailRows(ticket, {
              mode: "detail",
              includeEmptyLifecycle: true
            });

            return (
              <article className="payload-card compact-card" key={ticket.ticket}>
                <div className="payload-card-header">
                  <span className="status-meta">Callback ticket</span>
                  <span className="event-chip">{ticket.status}</span>
                </div>
                {ticketInboxHref ? (
                  <div className="tool-badge-row">
                    <Link className="event-chip inbox-filter-link" href={ticketInboxHref}>
                      open ticket inbox slice
                    </Link>
                  </div>
                ) : null}
                <dl className="compact-meta-list">
                  {detailRows.map((row) => (
                    <div key={`${ticket.ticket}:${row.label}`}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
                {ticket.callback_payload ? (
                  <>
                    <p className="section-copy entry-copy">callback payload preview</p>
                    <pre className="trace-preview">{formatJsonPreview(ticket.callback_payload)}</pre>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-state compact">当前这次 invocation 没有关联 callback ticket。</p>
      )}
    </section>
  );
}
