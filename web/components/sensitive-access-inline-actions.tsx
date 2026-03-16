"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  decideSensitiveAccessApprovalTicket,
  retrySensitiveAccessNotificationDispatch,
  type DecideSensitiveAccessApprovalTicketState,
  type RetrySensitiveAccessNotificationDispatchState
} from "@/app/actions/sensitive-access";

export const DEFAULT_INLINE_OPERATOR_ID = "studio-operator";

type InlineApprovalTicket = {
  id: string;
  status?: string | null;
  waiting_status?: string | null;
};

type InlineNotification = {
  id: string;
  channel?: string | null;
  target?: string | null;
  status?: string | null;
  error?: string | null;
  created_at?: string | null;
};

type SensitiveAccessInlineActionsProps = {
  ticket?: InlineApprovalTicket | null;
  notifications?: InlineNotification[];
  runId?: string | null;
  compact?: boolean;
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

function isPendingWaitingTicket(ticket?: InlineApprovalTicket | null) {
  return ticket?.status === "pending" && ticket.waiting_status === "waiting";
}

function pickRetriableNotification(
  ticket: InlineApprovalTicket | null | undefined,
  notifications: InlineNotification[]
) {
  if (!isPendingWaitingTicket(ticket) || notifications.length === 0) {
    return null;
  }

  const latestNotification = [...notifications].sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  })[0];

  if (!latestNotification || latestNotification.status === "delivered") {
    return null;
  }

  return latestNotification;
}

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

export function SensitiveAccessInlineActions({
  ticket,
  notifications = [],
  runId = null,
  compact = false
}: SensitiveAccessInlineActionsProps) {
  const router = useRouter();
  const [decisionState, decisionAction] = useActionState(
    decideSensitiveAccessApprovalTicket,
    initialDecisionState
  );
  const [retryState, retryAction] = useActionState(
    retrySensitiveAccessNotificationDispatch,
    initialRetryState
  );
  const retriableNotification = pickRetriableNotification(ticket, notifications);

  useEffect(() => {
    if (decisionState.status === "success" || retryState.status === "success") {
      router.refresh();
    }
  }, [decisionState.status, retryState.status, router]);

  if (!isPendingWaitingTicket(ticket) && !retriableNotification) {
    return null;
  }

  return (
    <div className={compact ? "entry-card compact-card" : undefined}>
      {compact ? <p className="entry-card-title">Operator actions</p> : null}

      {isPendingWaitingTicket(ticket) ? (
        <form action={decisionAction} className="inbox-decision-form">
          <input type="hidden" name="ticketId" value={ticket?.id ?? ""} />
          <input type="hidden" name="runId" value={runId ?? ""} />
          <label className="status-meta" htmlFor={`approvedBy-${ticket?.id ?? "unknown"}`}>
            Operator
          </label>
          <input
            className="inbox-operator-input"
            defaultValue={DEFAULT_INLINE_OPERATOR_ID}
            id={`approvedBy-${ticket?.id ?? "unknown"}`}
            name="approvedBy"
            placeholder="输入审批人标识"
            type="text"
          />
          <div className="binding-actions">
            <DecisionSubmitButton label="批准并恢复" value="approved" />
            <DecisionSubmitButton label="拒绝访问" value="rejected" variant="secondary" />
          </div>
          {decisionState.message && decisionState.ticketId === ticket?.id ? (
            <p className={`sync-message ${decisionState.status}`}>{decisionState.message}</p>
          ) : null}
        </form>
      ) : null}

      {retriableNotification ? (
        <form action={retryAction} className="inbox-decision-form">
          <input type="hidden" name="dispatchId" value={retriableNotification.id} />
          <input type="hidden" name="runId" value={runId ?? ""} />
          <label
            className="status-meta"
            htmlFor={`inlineNotificationTarget-${retriableNotification.id}`}
          >
            Notification target
          </label>
          <input
            className="inbox-operator-input"
            defaultValue={retriableNotification.target ?? ""}
            id={`inlineNotificationTarget-${retriableNotification.id}`}
            name="target"
            placeholder="输入新的通知目标；留空则沿用当前目标"
            type="text"
          />
          <div className="binding-actions">
            <button className="action-link-button" type="submit">
              改派目标并重试
            </button>
          </div>
          {retriableNotification.channel || retriableNotification.status || retriableNotification.target ? (
            <p className="empty-state compact">
              最新通知
              {retriableNotification.channel ? ` · ${retriableNotification.channel}` : ""}
              {retriableNotification.status ? ` · ${retriableNotification.status}` : ""}
              {retriableNotification.target ? ` · ${retriableNotification.target}` : ""}
            </p>
          ) : null}
          {retriableNotification.error ? (
            <p className="empty-state compact">{retriableNotification.error}</p>
          ) : null}
          {retryState.message && retryState.dispatchId === retriableNotification.id ? (
            <p className={`sync-message ${retryState.status}`}>{retryState.message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
