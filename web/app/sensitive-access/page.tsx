import Link from "next/link";
import type { Metadata } from "next";

import { SensitiveAccessInboxPanel } from "@/components/sensitive-access-inbox-panel";
import {
  getSensitiveAccessInboxSnapshot,
  type ApprovalTicketItem,
  type NotificationChannelCapabilityItem,
  type NotificationDispatchItem,
  type SensitiveAccessRequestItem
} from "@/lib/get-sensitive-access";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";

type SensitiveAccessInboxPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const APPROVAL_STATUS_OPTIONS: Array<ApprovalTicketItem["status"]> = [
  "pending",
  "approved",
  "rejected",
  "expired"
];
const WAITING_STATUS_OPTIONS: Array<ApprovalTicketItem["waiting_status"]> = [
  "waiting",
  "resumed",
  "failed"
];
const REQUEST_DECISION_OPTIONS: Array<NonNullable<SensitiveAccessRequestItem["decision"]>> = [
  "allow",
  "deny",
  "require_approval",
  "allow_masked"
];
const REQUESTER_TYPE_OPTIONS: Array<SensitiveAccessRequestItem["requester_type"]> = [
  "human",
  "ai",
  "workflow",
  "tool"
];
const NOTIFICATION_STATUS_OPTIONS: Array<NotificationDispatchItem["status"]> = [
  "pending",
  "delivered",
  "failed"
];
const NOTIFICATION_CHANNEL_OPTIONS: Array<NotificationDispatchItem["channel"]> = [
  "in_app",
  "webhook",
  "feishu",
  "slack",
  "email"
];

const CHANNEL_TARGET_KIND_LABELS: Record<
  NotificationChannelCapabilityItem["target_kind"],
  string
> = {
  in_app: "站内 inbox",
  http_url: "Webhook URL",
  email_list: "邮箱列表"
};

const CHANNEL_CONFIG_STATUS_LABELS: Record<
  NotificationChannelCapabilityItem["config_facts"][number]["status"],
  string
> = {
  configured: "configured",
  missing: "missing",
  info: "info"
};

export const metadata: Metadata = {
  title: "Sensitive Access Inbox | 7Flows Studio"
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatChannelTimestamp(value?: string | null) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

export default async function SensitiveAccessInboxPage({
  searchParams
}: SensitiveAccessInboxPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedStatus = firstSearchValue(resolvedSearchParams.status);
  const requestedWaitingStatus = firstSearchValue(resolvedSearchParams.waiting_status);
  const requestedDecision = firstSearchValue(resolvedSearchParams.decision);
  const requestedRequesterType = firstSearchValue(resolvedSearchParams.requester_type);
  const requestedNotificationStatus = firstSearchValue(resolvedSearchParams.notification_status);
  const requestedNotificationChannel = firstSearchValue(resolvedSearchParams.notification_channel);
  const requestedRunId = firstSearchValue(resolvedSearchParams.run_id)?.trim();
  const requestedNodeRunId = firstSearchValue(resolvedSearchParams.node_run_id)?.trim();
  const requestedAccessRequestId = firstSearchValue(resolvedSearchParams.access_request_id)?.trim();
  const requestedApprovalTicketId = firstSearchValue(resolvedSearchParams.approval_ticket_id)?.trim();
  const activeStatus = APPROVAL_STATUS_OPTIONS.includes(requestedStatus as ApprovalTicketItem["status"])
    ? (requestedStatus as ApprovalTicketItem["status"])
    : null;
  const activeWaitingStatus = WAITING_STATUS_OPTIONS.includes(
    requestedWaitingStatus as ApprovalTicketItem["waiting_status"]
  )
    ? (requestedWaitingStatus as ApprovalTicketItem["waiting_status"])
    : null;
  const activeDecision = REQUEST_DECISION_OPTIONS.includes(
    requestedDecision as NonNullable<SensitiveAccessRequestItem["decision"]>
  )
    ? (requestedDecision as NonNullable<SensitiveAccessRequestItem["decision"]>)
    : null;
  const activeRequesterType = REQUESTER_TYPE_OPTIONS.includes(
    requestedRequesterType as SensitiveAccessRequestItem["requester_type"]
  )
    ? (requestedRequesterType as SensitiveAccessRequestItem["requester_type"])
    : null;
  const activeNotificationStatus = NOTIFICATION_STATUS_OPTIONS.includes(
    requestedNotificationStatus as NotificationDispatchItem["status"]
  )
    ? (requestedNotificationStatus as NotificationDispatchItem["status"])
    : null;
  const activeNotificationChannel = NOTIFICATION_CHANNEL_OPTIONS.includes(
    requestedNotificationChannel as NotificationDispatchItem["channel"]
  )
    ? (requestedNotificationChannel as NotificationDispatchItem["channel"])
    : null;
  const activeRunId = requestedRunId ? requestedRunId : null;
  const activeNodeRunId = requestedNodeRunId ? requestedNodeRunId : null;
  const activeAccessRequestId = requestedAccessRequestId ? requestedAccessRequestId : null;
  const activeApprovalTicketId = requestedApprovalTicketId ? requestedApprovalTicketId : null;
  const snapshot = await getSensitiveAccessInboxSnapshot({
    ticketStatus: activeStatus ?? undefined,
    waitingStatus: activeWaitingStatus ?? undefined,
    requestDecision: activeDecision ?? undefined,
    requesterType: activeRequesterType ?? undefined,
    notificationStatus: activeNotificationStatus ?? undefined,
    notificationChannel: activeNotificationChannel ?? undefined,
    runId: activeRunId ?? undefined,
    nodeRunId: activeNodeRunId ?? undefined,
    accessRequestId: activeAccessRequestId ?? undefined,
    approvalTicketId: activeApprovalTicketId ?? undefined
  });

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Sensitive Access</p>
          <h1>把审批票据、通知投递和等待恢复放到同一收件箱</h1>
          <p className="hero-text">
            当前页面优先承接敏感访问的 operator 落点：查看 `ApprovalTicket`、回溯对应 run，
            并在这里直接批准或拒绝访问请求，避免审批事实层停留在 API 和 blocked-card 文案里。
          </p>
          <div className="pill-row">
            <span className="pill">ApprovalTicket</span>
            <span className="pill">NotificationDispatch</span>
            <span className="pill">waiting / resume</span>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-label">Inbox summary</div>
          <div className="panel-value">{snapshot.summary.pending_ticket_count}</div>
          <p className="panel-text">待审批票据</p>
          <p className="panel-text">
            waiting {snapshot.summary.waiting_ticket_count} / resumed {snapshot.summary.resumed_ticket_count}
          </p>
          <dl className="signal-list">
            <div>
              <dt>Delivered</dt>
              <dd>{snapshot.summary.delivered_notification_count}</dd>
            </div>
            <div>
              <dt>Pending</dt>
              <dd>{snapshot.summary.pending_notification_count}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{snapshot.summary.failed_notification_count}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Filters</p>
              <h2>审批状态与恢复状态</h2>
            </div>
            <p className="section-copy">
              先看待审批队列，再切到已恢复 / 已拒绝状态复盘；详细执行仍回到各自的 run 诊断页面。
            </p>
          </div>

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${activeStatus === null ? " active" : ""}`}
              href={buildSensitiveAccessInboxHref({
                status: null,
                waitingStatus: activeWaitingStatus,
                requestDecision: activeDecision,
                requesterType: activeRequesterType,
                notificationStatus: activeNotificationStatus,
                notificationChannel: activeNotificationChannel,
                runId: activeRunId,
                nodeRunId: activeNodeRunId,
                accessRequestId: activeAccessRequestId,
                approvalTicketId: activeApprovalTicketId
              })}
            >
              全部票据
            </Link>
            {APPROVAL_STATUS_OPTIONS.map((status) => (
              <Link
                className={`event-chip inbox-filter-link${activeStatus === status ? " active" : ""}`}
                href={buildSensitiveAccessInboxHref({
                  status,
                  waitingStatus: activeWaitingStatus,
                  requestDecision: activeDecision,
                  requesterType: activeRequesterType,
                  notificationStatus: activeNotificationStatus,
                  notificationChannel: activeNotificationChannel,
                  runId: activeRunId,
                  nodeRunId: activeNodeRunId,
                  accessRequestId: activeAccessRequestId,
                  approvalTicketId: activeApprovalTicketId
                })}
                key={status}
              >
                {status}
              </Link>
            ))}
          </div>

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${activeWaitingStatus === null ? " active" : ""}`}
              href={buildSensitiveAccessInboxHref({
                status: activeStatus,
                waitingStatus: null,
                requestDecision: activeDecision,
                requesterType: activeRequesterType,
                notificationStatus: activeNotificationStatus,
                notificationChannel: activeNotificationChannel,
                runId: activeRunId,
                nodeRunId: activeNodeRunId,
                accessRequestId: activeAccessRequestId,
                approvalTicketId: activeApprovalTicketId
              })}
            >
              全部恢复状态
            </Link>
            {WAITING_STATUS_OPTIONS.map((status) => (
              <Link
                className={`event-chip inbox-filter-link${activeWaitingStatus === status ? " active" : ""}`}
                href={buildSensitiveAccessInboxHref({
                  status: activeStatus,
                  waitingStatus: status,
                  requestDecision: activeDecision,
                  requesterType: activeRequesterType,
                  notificationStatus: activeNotificationStatus,
                  notificationChannel: activeNotificationChannel,
                  runId: activeRunId,
                  nodeRunId: activeNodeRunId,
                  accessRequestId: activeAccessRequestId,
                  approvalTicketId: activeApprovalTicketId
                })}
                key={status}
              >
                {status}
              </Link>
            ))}
          </div>

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${activeDecision === null ? " active" : ""}`}
              href={buildSensitiveAccessInboxHref({
                status: activeStatus,
                waitingStatus: activeWaitingStatus,
                requestDecision: null,
                requesterType: activeRequesterType,
                notificationStatus: activeNotificationStatus,
                notificationChannel: activeNotificationChannel,
                runId: activeRunId,
                nodeRunId: activeNodeRunId,
                accessRequestId: activeAccessRequestId,
                approvalTicketId: activeApprovalTicketId
              })}
            >
              全部决策
            </Link>
            {REQUEST_DECISION_OPTIONS.map((decision) => (
              <Link
                className={`event-chip inbox-filter-link${activeDecision === decision ? " active" : ""}`}
                href={buildSensitiveAccessInboxHref({
                  status: activeStatus,
                  waitingStatus: activeWaitingStatus,
                  requestDecision: decision,
                  requesterType: activeRequesterType,
                  notificationStatus: activeNotificationStatus,
                  notificationChannel: activeNotificationChannel,
                  runId: activeRunId,
                  nodeRunId: activeNodeRunId,
                  accessRequestId: activeAccessRequestId,
                  approvalTicketId: activeApprovalTicketId
                })}
                key={decision}
              >
                {decision}
              </Link>
            ))}
          </div>

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${activeRequesterType === null ? " active" : ""}`}
              href={buildSensitiveAccessInboxHref({
                status: activeStatus,
                waitingStatus: activeWaitingStatus,
                requestDecision: activeDecision,
                requesterType: null,
                notificationStatus: activeNotificationStatus,
                notificationChannel: activeNotificationChannel,
                runId: activeRunId,
                nodeRunId: activeNodeRunId,
                accessRequestId: activeAccessRequestId,
                approvalTicketId: activeApprovalTicketId
              })}
            >
              全部发起方
            </Link>
            {REQUESTER_TYPE_OPTIONS.map((requesterType) => (
              <Link
                className={`event-chip inbox-filter-link${activeRequesterType === requesterType ? " active" : ""}`}
                href={buildSensitiveAccessInboxHref({
                  status: activeStatus,
                  waitingStatus: activeWaitingStatus,
                  requestDecision: activeDecision,
                  requesterType,
                  notificationStatus: activeNotificationStatus,
                  notificationChannel: activeNotificationChannel,
                  runId: activeRunId,
                  nodeRunId: activeNodeRunId,
                  accessRequestId: activeAccessRequestId,
                  approvalTicketId: activeApprovalTicketId
                })}
                key={requesterType}
              >
                {requesterType}
              </Link>
            ))}
          </div>

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${activeNotificationStatus === null ? " active" : ""}`}
              href={buildSensitiveAccessInboxHref({
                status: activeStatus,
                waitingStatus: activeWaitingStatus,
                requestDecision: activeDecision,
                requesterType: activeRequesterType,
                notificationStatus: null,
                notificationChannel: activeNotificationChannel,
                runId: activeRunId,
                nodeRunId: activeNodeRunId,
                accessRequestId: activeAccessRequestId,
                approvalTicketId: activeApprovalTicketId
              })}
            >
              全部通知状态
            </Link>
            {NOTIFICATION_STATUS_OPTIONS.map((notificationStatus) => (
              <Link
                className={`event-chip inbox-filter-link${activeNotificationStatus === notificationStatus ? " active" : ""}`}
                href={buildSensitiveAccessInboxHref({
                  status: activeStatus,
                  waitingStatus: activeWaitingStatus,
                  requestDecision: activeDecision,
                  requesterType: activeRequesterType,
                  notificationStatus,
                  notificationChannel: activeNotificationChannel,
                  runId: activeRunId,
                  nodeRunId: activeNodeRunId,
                  accessRequestId: activeAccessRequestId,
                  approvalTicketId: activeApprovalTicketId
                })}
                key={notificationStatus}
              >
                {notificationStatus}
              </Link>
            ))}
          </div>

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${activeNotificationChannel === null ? " active" : ""}`}
              href={buildSensitiveAccessInboxHref({
                status: activeStatus,
                waitingStatus: activeWaitingStatus,
                requestDecision: activeDecision,
                requesterType: activeRequesterType,
                notificationStatus: activeNotificationStatus,
                notificationChannel: null,
                runId: activeRunId,
                nodeRunId: activeNodeRunId,
                accessRequestId: activeAccessRequestId,
                approvalTicketId: activeApprovalTicketId
              })}
            >
              全部渠道
            </Link>
            {NOTIFICATION_CHANNEL_OPTIONS.map((notificationChannel) => (
              <Link
                className={`event-chip inbox-filter-link${activeNotificationChannel === notificationChannel ? " active" : ""}`}
                href={buildSensitiveAccessInboxHref({
                  status: activeStatus,
                  waitingStatus: activeWaitingStatus,
                  requestDecision: activeDecision,
                  requesterType: activeRequesterType,
                  notificationStatus: activeNotificationStatus,
                  notificationChannel,
                  runId: activeRunId,
                  nodeRunId: activeNodeRunId,
                  accessRequestId: activeAccessRequestId,
                  approvalTicketId: activeApprovalTicketId
                })}
                key={notificationChannel}
              >
                {notificationChannel}
              </Link>
            ))}
          </div>

          {activeRunId ||
          activeNodeRunId ||
          activeAccessRequestId ||
          activeApprovalTicketId ||
          activeDecision ||
          activeRequesterType ||
          activeNotificationStatus ||
          activeNotificationChannel ? (
            <div className="summary-strip">
              {activeRunId ? <span className="event-chip">run slice {activeRunId}</span> : null}
              {activeNodeRunId ? <span className="event-chip">node run {activeNodeRunId}</span> : null}
              {activeAccessRequestId ? (
                <span className="event-chip">request {activeAccessRequestId.slice(0, 8)}</span>
              ) : null}
              {activeApprovalTicketId ? (
                <span className="event-chip">ticket {activeApprovalTicketId.slice(0, 8)}</span>
              ) : null}
              {activeDecision ? <span className="event-chip">decision {activeDecision}</span> : null}
              {activeRequesterType ? (
                <span className="event-chip">requester {activeRequesterType}</span>
              ) : null}
              {activeNotificationStatus ? (
                <span className="event-chip">notify {activeNotificationStatus}</span>
              ) : null}
              {activeNotificationChannel ? (
                <span className="event-chip">channel {activeNotificationChannel}</span>
              ) : null}
              <Link
                className="event-chip inbox-filter-link"
                href={buildSensitiveAccessInboxHref({
                  status: null,
                  waitingStatus: null,
                  requestDecision: null,
                  requesterType: null,
                  notificationStatus: null,
                  notificationChannel: null,
                  runId: null,
                  nodeRunId: null,
                  accessRequestId: null,
                  approvalTicketId: null
                })}
              >
                clear detail slice
              </Link>
            </div>
          ) : null}
        </article>

        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Channels</p>
              <h2>通知渠道健康与 target 规则</h2>
            </div>
            <p className="section-copy">
              用统一的 channel capability + dispatch diagnostics 事实说明哪些渠道当前可投递、哪些 target
              形式被支持、最近是否持续失败，避免 worker 侧才暴露“其实配不通”的问题。
            </p>
          </div>

          <div className="activity-list">
            {snapshot.channels.map((channel) => (
              <article className="activity-row" key={channel.channel}>
                <div className="activity-header">
                  <div>
                    <h3>{channel.channel}</h3>
                    <p>{channel.summary}</p>
                  </div>
                  <div className="tool-badge-row">
                    <span className={`health-pill ${channel.health_status}`}>
                      {channel.health_status === "ready" ? "ready" : "degraded"}
                    </span>
                    <span className="event-chip">{channel.delivery_mode}</span>
                  </div>
                </div>
                <div className="tool-badge-row">
                  <span className="event-chip">
                    target {CHANNEL_TARGET_KIND_LABELS[channel.target_kind]}
                  </span>
                  <span className="event-chip">
                    {channel.configured ? "configured" : "not configured"}
                  </span>
                  <span className="event-chip">
                    pending {channel.dispatch_summary.pending_count}
                  </span>
                  <span className="event-chip">
                    delivered {channel.dispatch_summary.delivered_count}
                  </span>
                  <span className="event-chip">failed {channel.dispatch_summary.failed_count}</span>
                </div>
                <p className="binding-meta">{channel.health_reason}</p>
                <p className="binding-meta">{channel.target_hint}</p>
                <p className="section-copy entry-copy">示例：{channel.target_example}</p>

                <div className="tool-badge-row">
                  <span className="event-chip">
                    latest dispatch {formatChannelTimestamp(channel.dispatch_summary.latest_dispatch_at)}
                  </span>
                  <span className="event-chip">
                    latest delivered {formatChannelTimestamp(channel.dispatch_summary.latest_delivered_at)}
                  </span>
                  <span className="event-chip">
                    latest failure {formatChannelTimestamp(channel.dispatch_summary.latest_failure_at)}
                  </span>
                </div>

                <div className="activity-list">
                  {channel.config_facts.map((fact) => (
                    <article className="entry-card compact-card" key={`${channel.channel}-${fact.key}`}>
                      <div className="activity-header">
                        <div>
                          <p className="entry-card-title">{fact.label}</p>
                          <p className="section-copy entry-copy">{fact.value}</p>
                        </div>
                        <span className={`health-pill ${fact.status === "missing" ? "failed" : "ready"}`}>
                          {CHANNEL_CONFIG_STATUS_LABELS[fact.status]}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>

                {channel.dispatch_summary.latest_failure_error ? (
                  <div className="entry-card compact-card">
                    <p className="entry-card-title">Latest failure</p>
                    <p className="section-copy entry-copy">
                      {channel.dispatch_summary.latest_failure_target
                        ? `target ${channel.dispatch_summary.latest_failure_target} · `
                        : ""}
                      {channel.dispatch_summary.latest_failure_error}
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="diagnostics-layout">
        <SensitiveAccessInboxPanel entries={snapshot.entries} />
      </section>
    </main>
  );
}
