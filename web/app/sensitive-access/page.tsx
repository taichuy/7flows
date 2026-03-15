import Link from "next/link";
import type { Metadata } from "next";

import { SensitiveAccessInboxPanel } from "@/components/sensitive-access-inbox-panel";
import {
  getSensitiveAccessInboxSnapshot,
  type ApprovalTicketItem
} from "@/lib/get-sensitive-access";

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

export const metadata: Metadata = {
  title: "Sensitive Access Inbox | 7Flows Studio"
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function buildInboxHref({
  status,
  waitingStatus,
  runId
}: {
  status?: ApprovalTicketItem["status"] | null;
  waitingStatus?: ApprovalTicketItem["waiting_status"] | null;
  runId?: string | null;
}) {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }
  if (waitingStatus) {
    params.set("waiting_status", waitingStatus);
  }
  if (runId?.trim()) {
    params.set("run_id", runId.trim());
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return `/sensitive-access${query}`;
}

export default async function SensitiveAccessInboxPage({
  searchParams
}: SensitiveAccessInboxPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedStatus = firstSearchValue(resolvedSearchParams.status);
  const requestedWaitingStatus = firstSearchValue(resolvedSearchParams.waiting_status);
  const requestedRunId = firstSearchValue(resolvedSearchParams.run_id)?.trim();
  const activeStatus = APPROVAL_STATUS_OPTIONS.includes(requestedStatus as ApprovalTicketItem["status"])
    ? (requestedStatus as ApprovalTicketItem["status"])
    : null;
  const activeWaitingStatus = WAITING_STATUS_OPTIONS.includes(
    requestedWaitingStatus as ApprovalTicketItem["waiting_status"]
  )
    ? (requestedWaitingStatus as ApprovalTicketItem["waiting_status"])
    : null;
  const activeRunId = requestedRunId ? requestedRunId : null;
  const snapshot = await getSensitiveAccessInboxSnapshot({
    ticketStatus: activeStatus ?? undefined,
    waitingStatus: activeWaitingStatus ?? undefined,
    runId: activeRunId ?? undefined
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
              href={buildInboxHref({
                status: null,
                waitingStatus: activeWaitingStatus,
                runId: activeRunId
              })}
            >
              全部票据
            </Link>
            {APPROVAL_STATUS_OPTIONS.map((status) => (
              <Link
                className={`event-chip inbox-filter-link${activeStatus === status ? " active" : ""}`}
                href={buildInboxHref({ status, waitingStatus: activeWaitingStatus, runId: activeRunId })}
                key={status}
              >
                {status}
              </Link>
            ))}
          </div>

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${activeWaitingStatus === null ? " active" : ""}`}
              href={buildInboxHref({ status: activeStatus, waitingStatus: null, runId: activeRunId })}
            >
              全部恢复状态
            </Link>
            {WAITING_STATUS_OPTIONS.map((status) => (
              <Link
                className={`event-chip inbox-filter-link${activeWaitingStatus === status ? " active" : ""}`}
                href={buildInboxHref({ status: activeStatus, waitingStatus: status, runId: activeRunId })}
                key={status}
              >
                {status}
              </Link>
            ))}
          </div>

          {activeRunId ? (
            <div className="summary-strip">
              <span className="event-chip">run slice {activeRunId}</span>
              <Link
                className="event-chip inbox-filter-link"
                href={buildInboxHref({
                  status: activeStatus,
                  waitingStatus: activeWaitingStatus,
                  runId: null
                })}
              >
                clear run slice
              </Link>
            </div>
          ) : null}
        </article>
      </section>

      <section className="diagnostics-layout">
        <SensitiveAccessInboxPanel entries={snapshot.entries} />
      </section>
    </main>
  );
}
