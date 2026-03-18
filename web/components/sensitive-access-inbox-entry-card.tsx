"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  decideSensitiveAccessApprovalTicket,
  retrySensitiveAccessNotificationDispatch,
  type DecideSensitiveAccessApprovalTicketState,
  type RetrySensitiveAccessNotificationDispatchState
} from "@/app/actions/sensitive-access";
import {
  ACTION_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  DEFAULT_OPERATOR_ID,
  NOTIFICATION_STATUS_LABELS,
  REQUESTER_TYPE_LABELS,
  WAITING_STATUS_LABELS,
  isPendingWaitingTicket,
  pickLatestNotification,
  pickRetriableNotification
} from "@/components/sensitive-access-inbox-panel-helpers";
import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { resolveSensitiveAccessInboxEntryScope } from "@/lib/sensitive-access-inbox-entry-scope";
import {
  formatSensitiveAccessDecisionLabel,
  formatSensitiveAccessReasonLabel,
  getSensitiveAccessPolicySummary
} from "@/lib/sensitive-access-presenters";

type SensitiveAccessInboxEntryCardProps = {
  entry: SensitiveAccessInboxEntry;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
};

type SensitiveAccessTicketDecisionFormProps = {
  entry: SensitiveAccessInboxEntry;
};

const initialDecisionState: DecideSensitiveAccessApprovalTicketState = {
  status: "idle",
  message: "",
  ticketId: ""
};

const initialRetryState: RetrySensitiveAccessNotificationDispatchState = {
  status: "idle",
  message: "",
  dispatchId: "",
  target: ""
};

function DecisionSubmitButton({
  label,
  value,
  variant = "primary"
}: {
  label: string;
  value: "approved" | "rejected";
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={variant === "secondary" ? "action-link-button" : "sync-button"}
      disabled={pending}
      name="status"
      type="submit"
      value={value}
    >
      {pending ? "提交中..." : label}
    </button>
  );
}

function SensitiveAccessTicketDecisionForm({
  entry
}: SensitiveAccessTicketDecisionFormProps) {
  const [state, formAction] = useActionState(
    decideSensitiveAccessApprovalTicket,
    initialDecisionState
  );
  const scope = resolveSensitiveAccessInboxEntryScope(entry);

  if (!isPendingWaitingTicket(entry)) {
    return null;
  }

  return (
    <form action={formAction} className="inbox-decision-form">
      <input type="hidden" name="ticketId" value={entry.ticket.id} />
      <input type="hidden" name="runId" value={scope.runId ?? ""} />
      <input type="hidden" name="nodeRunId" value={scope.nodeRunId ?? ""} />
      <label className="status-meta" htmlFor={`approvedBy-${entry.ticket.id}`}>
        Operator
      </label>
      <input
        className="inbox-operator-input"
        defaultValue={DEFAULT_OPERATOR_ID}
        id={`approvedBy-${entry.ticket.id}`}
        name="approvedBy"
        placeholder="输入审批人标识"
        type="text"
      />
      <div className="binding-actions">
        <DecisionSubmitButton label="批准并恢复" value="approved" />
        <DecisionSubmitButton label="拒绝访问" value="rejected" variant="secondary" />
      </div>
      {state.message && state.ticketId === entry.ticket.id ? (
        <p className={`sync-message ${state.status}`}>{state.message}</p>
      ) : null}
    </form>
  );
}

function SensitiveAccessNotificationRetryForm({
  entry
}: SensitiveAccessTicketDecisionFormProps) {
  const [state, formAction] = useActionState(
    retrySensitiveAccessNotificationDispatch,
    initialRetryState
  );
  const notification = pickRetriableNotification(entry);
  const scope = resolveSensitiveAccessInboxEntryScope(entry);

  if (!notification) {
    return null;
  }

  return (
    <form action={formAction} className="inbox-decision-form">
      <input type="hidden" name="dispatchId" value={notification.id} />
      <input type="hidden" name="runId" value={scope.runId ?? ""} />
      <input type="hidden" name="nodeRunId" value={scope.nodeRunId ?? ""} />
      <label className="status-meta" htmlFor={`notificationTarget-${notification.id}`}>
        Notification target
      </label>
      <input
        className="inbox-operator-input"
        defaultValue={notification.target}
        id={`notificationTarget-${notification.id}`}
        name="target"
        placeholder="输入新的通知目标；留空则沿用当前目标"
        type="text"
      />
      <div className="binding-actions">
        <button className="action-link-button" type="submit">
          改派目标并重试
        </button>
      </div>
      {notification.error ? <p className="empty-state compact">{notification.error}</p> : null}
      {state.message && state.dispatchId === notification.id ? (
        <p className={`sync-message ${state.status}`}>{state.message}</p>
      ) : null}
    </form>
  );
}

export function SensitiveAccessInboxEntryCard({
  entry,
  callbackWaitingAutomation
}: SensitiveAccessInboxEntryCardProps) {
  const request = entry.request;
  const resource = entry.resource;
  const latestNotification = pickLatestNotification(entry);
  const callbackWaitingContext = entry.callbackWaitingContext;

  return (
    <article className="activity-row">
      <div className="activity-header">
        <div>
          <h3>{resource?.label ?? `Resource ${request?.resource_id ?? "unknown"}`}</h3>
          <p>
            {request
              ? `${REQUESTER_TYPE_LABELS[request.requester_type]} ${request.requester_id} 发起 ${ACTION_TYPE_LABELS[request.action_type]}`
              : "当前未能关联到 access request，建议回到后端事实层排查。"}
          </p>
        </div>
        <div className="tool-badge-row">
          <span className={`health-pill ${entry.ticket.status}`}>
            {APPROVAL_STATUS_LABELS[entry.ticket.status]}
          </span>
          <span className={`health-pill ${entry.ticket.waiting_status}`}>
            {WAITING_STATUS_LABELS[entry.ticket.waiting_status]}
          </span>
        </div>
      </div>

      <p className="binding-meta">
        ticket {entry.ticket.id} · sensitivity {resource?.sensitivity_level ?? "unknown"} · source{" "}
        {resource?.source ?? "unknown"}
      </p>

      <div className="tool-badge-row">
        {request ? (
          <span className="event-chip">{formatSensitiveAccessDecisionLabel(request)}</span>
        ) : null}
        {request && formatSensitiveAccessReasonLabel(request) ? (
          <span className="event-chip">reason {formatSensitiveAccessReasonLabel(request)}</span>
        ) : null}
        {entry.ticket.run_id ? (
          <Link className="event-chip inbox-filter-link" href={`/runs/${entry.ticket.run_id}`}>
            run {entry.ticket.run_id.slice(0, 8)}
          </Link>
        ) : null}
        <span className="event-chip">created {formatTimestamp(entry.ticket.created_at)}</span>
        <span className="event-chip">expires {formatTimestamp(entry.ticket.expires_at)}</span>
        <span className="event-chip">notifications {entry.notifications.length}</span>
      </div>

      {request?.purpose_text ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Purpose</p>
          <p className="section-copy entry-copy">{request.purpose_text}</p>
        </div>
      ) : null}

      {request && getSensitiveAccessPolicySummary(request) ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Policy summary</p>
          <p className="section-copy entry-copy">{getSensitiveAccessPolicySummary(request)}</p>
        </div>
      ) : null}

      {callbackWaitingContext ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Callback waiting follow-up</p>
          <CallbackWaitingSummaryCard
            callbackTickets={callbackWaitingContext.callbackTickets}
            callbackWaitingAutomation={callbackWaitingAutomation}
            lifecycle={callbackWaitingContext.lifecycle}
            nodeRunId={callbackWaitingContext.nodeRunId}
            runId={callbackWaitingContext.runId}
            scheduledResumeDelaySeconds={callbackWaitingContext.scheduledResumeDelaySeconds}
            scheduledResumeSource={callbackWaitingContext.scheduledResumeSource}
            scheduledWaitingStatus={callbackWaitingContext.scheduledWaitingStatus}
            scheduledResumeScheduledAt={callbackWaitingContext.scheduledResumeScheduledAt}
            scheduledResumeDueAt={callbackWaitingContext.scheduledResumeDueAt}
            sensitiveAccessEntries={callbackWaitingContext.sensitiveAccessEntries}
            waitingReason={callbackWaitingContext.waitingReason}
          />
        </div>
      ) : null}

      {entry.notifications.length > 0 ? (
        <div className="tool-badge-row">
          {entry.notifications.map((notification) => (
            <span className="event-chip" key={notification.id}>
              {notification.channel} · {NOTIFICATION_STATUS_LABELS[notification.status]} · {notification.target}
            </span>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">当前票据还没有关联的通知投递记录。</p>
      )}

      {latestNotification?.error ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Latest notification status</p>
          <p className="section-copy entry-copy">
            {latestNotification.channel} 当前未成功投递：{latestNotification.error}
          </p>
        </div>
      ) : null}

      <SensitiveAccessTicketDecisionForm entry={entry} />
      <SensitiveAccessNotificationRetryForm entry={entry} />
    </article>
  );
}
