import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import type {
  PublishedEndpointInvocationItem,
  PublishedEndpointInvocationCallbackTicketItem
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  formatApprovalSummary,
  formatCallbackTicketStatusSummary,
  formatCallbackTerminationLabel,
  formatLatestCallbackTicketLabel,
  formatLatestLateCallbackLabel,
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  getCallbackWaitingHeadline,
  listCallbackWaitingChips
} from "@/lib/callback-waiting-presenters";
import { buildPublishedInvocationInboxHref } from "@/lib/published-invocation-presenters";

type WorkflowPublishInvocationCallbackSectionProps = {
  invocation: PublishedEndpointInvocationItem;
  callbackTickets: PublishedEndpointInvocationCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
};

function formatJsonPreview(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function renderMetaRow(label: string, value: string | null | undefined) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "n/a"}</dd>
    </div>
  );
}

export function WorkflowPublishInvocationCallbackSection({
  invocation,
  callbackTickets,
  sensitiveAccessEntries
}: WorkflowPublishInvocationCallbackSectionProps) {
  const waitingLifecycle = invocation.run_waiting_lifecycle;
  const callbackLifecycle = waitingLifecycle?.callback_waiting_lifecycle;
  const headline = getCallbackWaitingHeadline({
    lifecycle: callbackLifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status
  });
  const chips = listCallbackWaitingChips({
    lifecycle: callbackLifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds
  });
  const scheduledResume = formatScheduledResumeLabel({
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status
  });
  const approvalSummary = formatApprovalSummary(sensitiveAccessEntries);
  const recommendedAction = getCallbackWaitingRecommendedAction({
    lifecycle: callbackLifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status
  });
  const latestTicket = formatLatestCallbackTicketLabel(callbackLifecycle);
  const latestLateCallback = formatLatestLateCallbackLabel(callbackLifecycle);
  const terminationLabel = formatCallbackTerminationLabel(callbackLifecycle);
  const ticketStatusSummary = formatCallbackTicketStatusSummary(callbackTickets);
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
        lifecycle={callbackLifecycle}
        sensitiveAccessEntries={sensitiveAccessEntries}
        scheduledResumeDelaySeconds={waitingLifecycle?.scheduled_resume_delay_seconds}
        scheduledResumeSource={waitingLifecycle?.scheduled_resume_source}
        scheduledWaitingStatus={waitingLifecycle?.scheduled_waiting_status}
        inboxHref={inboxHref}
        runId={invocation.run_id ?? null}
        nodeRunId={waitingLifecycle?.node_run_id ?? null}
      />
      {(headline || chips.length > 0 || latestTicket || latestLateCallback || approvalSummary) ? (
        <div className="publish-meta-grid">
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Resume blockers</span>
            </div>
            <p className="section-copy entry-copy">{headline ?? "Callback waiting is not active."}</p>
            {chips.length ? (
              <p className="binding-meta">{chips.join(" · ")}</p>
            ) : null}
            <dl className="compact-meta-list">
              {renderMetaRow("Ticket status mix", ticketStatusSummary)}
              {renderMetaRow("Approvals", approvalSummary)}
              {renderMetaRow("Scheduled resume", scheduledResume)}
              {renderMetaRow("Termination", terminationLabel)}
              {renderMetaRow(
                "Recommended next action",
                recommendedAction
                  ? `${recommendedAction.label} · ${recommendedAction.detail}`
                  : null
              )}
            </dl>
          </div>
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Latest callback events</span>
            </div>
            <dl className="compact-meta-list">
              {renderMetaRow("Latest ticket", latestTicket)}
              {renderMetaRow("Latest late callback", latestLateCallback)}
              {renderMetaRow(
                "Waiting node run",
                waitingLifecycle?.node_run_id ?? invocation.run_current_node_id ?? null
              )}
              {renderMetaRow("Waiting reason", waitingLifecycle?.waiting_reason ?? invocation.run_waiting_reason)}
            </dl>
          </div>
        </div>
      ) : null}

      {callbackTickets.length ? (
        <div className="publish-cache-list">
          {callbackTickets.map((ticket) => (
            <article className="payload-card compact-card" key={ticket.ticket}>
              <div className="payload-card-header">
                <span className="status-meta">Callback ticket</span>
                <span className="event-chip">{ticket.status}</span>
              </div>
              <dl className="compact-meta-list">
                <div>
                  <dt>Ticket</dt>
                  <dd>{ticket.ticket}</dd>
                </div>
                <div>
                  <dt>Node run</dt>
                  <dd>{ticket.node_run_id}</dd>
                </div>
                <div>
                  <dt>Tool</dt>
                  <dd>
                    {ticket.tool_id ?? "n/a"} · call #{ticket.tool_call_index}
                  </dd>
                </div>
                <div>
                  <dt>Waiting status</dt>
                  <dd>{ticket.waiting_status}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>{ticket.reason ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatTimestamp(ticket.created_at)}</dd>
                </div>
                <div>
                  <dt>Expires</dt>
                  <dd>{formatTimestamp(ticket.expires_at)}</dd>
                </div>
                <div>
                  <dt>Consumed</dt>
                  <dd>{formatTimestamp(ticket.consumed_at)}</dd>
                </div>
                <div>
                  <dt>Canceled</dt>
                  <dd>{formatTimestamp(ticket.canceled_at)}</dd>
                </div>
                <div>
                  <dt>Expired</dt>
                  <dd>{formatTimestamp(ticket.expired_at)}</dd>
                </div>
              </dl>
              {ticket.callback_payload ? (
                <>
                  <p className="section-copy entry-copy">callback payload preview</p>
                  <pre className="trace-preview">{formatJsonPreview(ticket.callback_payload)}</pre>
                </>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">当前这次 invocation 没有关联 callback ticket。</p>
      )}
    </section>
  );
}
