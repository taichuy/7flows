"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  bulkDecideSensitiveAccessApprovalTickets,
  bulkRetrySensitiveAccessNotificationDispatches,
  decideSensitiveAccessApprovalTicket,
  retrySensitiveAccessNotificationDispatch,
  type DecideSensitiveAccessApprovalTicketState,
  type RetrySensitiveAccessNotificationDispatchState
} from "@/app/actions/sensitive-access";
import {
  SensitiveAccessBulkGovernanceCard,
  getSensitiveAccessBulkActionConfirmationMessage,
  getSensitiveAccessBulkActionLabel
} from "@/components/sensitive-access-bulk-governance-card";
import type {
  SensitiveAccessBulkAction,
  SensitiveAccessBulkActionResult,
  SensitiveAccessInboxEntry
} from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";

type SensitiveAccessInboxPanelProps = {
  entries: SensitiveAccessInboxEntry[];
};

type SensitiveAccessTicketDecisionFormProps = {
  entry: SensitiveAccessInboxEntry;
};

type SensitiveAccessMessageTone = "idle" | "success" | "error";

const DEFAULT_OPERATOR_ID = "studio-operator";

const initialDecisionState: DecideSensitiveAccessApprovalTicketState = {
  status: "idle",
  message: "",
  ticketId: ""
};

const initialRetryState: RetrySensitiveAccessNotificationDispatchState = {
  status: "idle",
  message: "",
  dispatchId: ""
};

const APPROVAL_STATUS_LABELS: Record<SensitiveAccessInboxEntry["ticket"]["status"], string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
  expired: "已过期"
};

const WAITING_STATUS_LABELS: Record<
  SensitiveAccessInboxEntry["ticket"]["waiting_status"],
  string
> = {
  waiting: "等待恢复",
  resumed: "已恢复",
  failed: "恢复失败"
};

const ACTION_TYPE_LABELS: Record<NonNullable<SensitiveAccessInboxEntry["request"]>["action_type"], string> = {
  read: "读取",
  use: "使用",
  export: "导出",
  write: "写入",
  invoke: "调用"
};

const REQUESTER_TYPE_LABELS: Record<
  NonNullable<SensitiveAccessInboxEntry["request"]>["requester_type"],
  string
> = {
  human: "人类",
  ai: "AI",
  workflow: "工作流",
  tool: "工具"
};

const NOTIFICATION_STATUS_LABELS: Record<
  SensitiveAccessInboxEntry["notifications"][number]["status"],
  string
> = {
  pending: "待投递",
  delivered: "已投递",
  failed: "投递失败"
};

function pickLatestNotification(entry: SensitiveAccessInboxEntry) {
  return [...entry.notifications].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  )[0];
}

function isPendingWaitingTicket(entry: SensitiveAccessInboxEntry) {
  return entry.ticket.status === "pending" && entry.ticket.waiting_status === "waiting";
}

function pickRetriableNotification(entry: SensitiveAccessInboxEntry) {
  const notification = pickLatestNotification(entry);
  if (!notification || !isPendingWaitingTicket(entry) || notification.status === "delivered") {
    return null;
  }

  return notification;
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

function SensitiveAccessTicketDecisionForm({
  entry
}: SensitiveAccessTicketDecisionFormProps) {
  const [state, formAction] = useActionState(
    decideSensitiveAccessApprovalTicket,
    initialDecisionState
  );

  if (!isPendingWaitingTicket(entry)) {
    return null;
  }

  return (
    <form action={formAction} className="inbox-decision-form">
      <input type="hidden" name="ticketId" value={entry.ticket.id} />
      <input type="hidden" name="runId" value={entry.ticket.run_id ?? ""} />
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

  if (!notification) {
    return null;
  }

  return (
    <form action={formAction} className="inbox-decision-form">
      <input type="hidden" name="dispatchId" value={notification.id} />
      <input type="hidden" name="runId" value={entry.ticket.run_id ?? ""} />
      <div className="binding-actions">
        <button className="action-link-button" type="submit">
          重试最新通知
        </button>
      </div>
      {notification.error ? <p className="empty-state compact">{notification.error}</p> : null}
      {state.message && state.dispatchId === notification.id ? (
        <p className={`sync-message ${state.status}`}>{state.message}</p>
      ) : null}
    </form>
  );
}

export function SensitiveAccessInboxPanel({ entries }: SensitiveAccessInboxPanelProps) {
  const [bulkOperator, setBulkOperator] = useState(DEFAULT_OPERATOR_ID);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkMessageTone, setBulkMessageTone] = useState<SensitiveAccessMessageTone>("idle");
  const [lastBulkResult, setLastBulkResult] = useState<SensitiveAccessBulkActionResult | null>(
    null
  );
  const [isBulkMutating, startBulkMutatingTransition] = useTransition();

  if (entries.length === 0) {
    return (
      <article className="diagnostic-panel panel-span">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2>Sensitive access approval inbox</h2>
          </div>
          <p className="section-copy">
            当前筛选条件下没有需要处理的审批票据；后续命中敏感访问阻断时，这里会成为 operator 的统一入口。
          </p>
        </div>
        <p className="empty-state">暂无待显示的审批票据。</p>
      </article>
    );
  }

  const decisionTicketIds = entries
    .filter((entry) => isPendingWaitingTicket(entry))
    .map((entry) => entry.ticket.id);
  const retryDispatchIds = entries.flatMap((entry) => {
    const notification = pickRetriableNotification(entry);
    return notification ? [notification.id] : [];
  });

  const handleBulkAction = (action: SensitiveAccessBulkAction) => {
    const candidateIds = action === "retry" ? retryDispatchIds : decisionTicketIds;
    if (candidateIds.length === 0) {
      return;
    }

    if (action !== "retry" && bulkOperator.trim().length === 0) {
      setBulkMessage("请输入 operator 标识后再执行批量审批。");
      setBulkMessageTone("error");
      return;
    }

    if (!window.confirm(getSensitiveAccessBulkActionConfirmationMessage(action, candidateIds.length))) {
      return;
    }

    const actionLabel = getSensitiveAccessBulkActionLabel(action);
    startBulkMutatingTransition(async () => {
      setBulkMessage(`正在${actionLabel}...`);
      setBulkMessageTone("idle");

      const result =
        action === "retry"
          ? await bulkRetrySensitiveAccessNotificationDispatches({
              dispatchIds: candidateIds
            })
          : await bulkDecideSensitiveAccessApprovalTickets({
              ticketIds: candidateIds,
              status: action,
              approvedBy: bulkOperator.trim()
            });

      setLastBulkResult(result);
      setBulkMessage(result.message);
      setBulkMessageTone(
        result.status === "error" ? "error" : result.updatedCount > 0 ? "success" : "idle"
      );
    });
  };

  return (
    <article className="diagnostic-panel panel-span">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Inbox</p>
          <h2>Sensitive access approval inbox</h2>
        </div>
        <p className="section-copy">
          这里把 `ApprovalTicket / NotificationDispatch` 事实层接到真实 operator UI；审批完成后，可直接回到 run 诊断或 publish 治理继续排障。
        </p>
      </div>

      <SensitiveAccessBulkGovernanceCard
        inScopeCount={entries.length}
        decisionCandidateCount={decisionTicketIds.length}
        retryCandidateCount={retryDispatchIds.length}
        operatorValue={bulkOperator}
        onOperatorChange={setBulkOperator}
        isMutating={isBulkMutating}
        lastResult={lastBulkResult}
        message={bulkMessage}
        messageTone={bulkMessageTone}
        onAction={handleBulkAction}
      />

      <div className="activity-list">
        {entries.map((entry) => {
          const request = entry.request;
          const resource = entry.resource;
          const latestNotification = pickLatestNotification(entry);

          return (
            <article className="activity-row" key={entry.ticket.id}>
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
        })}
      </div>
    </article>
  );
}
