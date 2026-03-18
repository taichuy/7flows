import Link from "next/link";
import type { Metadata } from "next";

import { SensitiveAccessChannelHealthPanel } from "@/components/sensitive-access-channel-health-panel";
import { SensitiveAccessInboxFilterSection } from "@/components/sensitive-access-inbox-filter-section";
import { SensitiveAccessInboxPanel } from "@/components/sensitive-access-inbox-panel";
import {
  APPROVAL_STATUS_OPTIONS,
  firstSearchValue,
  hasActiveInboxFilters,
  NOTIFICATION_CHANNEL_OPTIONS,
  NOTIFICATION_STATUS_OPTIONS,
  REQUEST_DECISION_OPTIONS,
  REQUESTER_TYPE_OPTIONS,
  type SensitiveAccessInboxPageFilterState,
  WAITING_STATUS_OPTIONS
} from "@/components/sensitive-access-inbox-page-shared";
import { SensitiveAccessInboxSliceForm } from "@/components/sensitive-access-inbox-slice-form";
import {
  getSensitiveAccessInboxSnapshot,
  type ApprovalTicketItem,
  type NotificationDispatchItem,
  type SensitiveAccessRequestItem
} from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";

type SensitiveAccessInboxPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Sensitive Access Inbox | 7Flows Studio"
};

function resolveEnumFilter<T extends string>(
  value: string | undefined,
  options: readonly T[]
): T | null {
  return options.includes(value as T) ? (value as T) : null;
}

function buildFilters(searchParams: Record<string, string | string[] | undefined>) {
  const requestedStatus = firstSearchValue(searchParams.status);
  const requestedWaitingStatus = firstSearchValue(searchParams.waiting_status);
  const requestedDecision = firstSearchValue(searchParams.decision);
  const requestedRequesterType = firstSearchValue(searchParams.requester_type);
  const requestedNotificationStatus = firstSearchValue(searchParams.notification_status);
  const requestedNotificationChannel = firstSearchValue(searchParams.notification_channel);

  return {
    status: resolveEnumFilter(requestedStatus, APPROVAL_STATUS_OPTIONS),
    waitingStatus: resolveEnumFilter(requestedWaitingStatus, WAITING_STATUS_OPTIONS),
    requestDecision: resolveEnumFilter(requestedDecision, REQUEST_DECISION_OPTIONS),
    requesterType: resolveEnumFilter(requestedRequesterType, REQUESTER_TYPE_OPTIONS),
    notificationStatus: resolveEnumFilter(
      requestedNotificationStatus,
      NOTIFICATION_STATUS_OPTIONS
    ),
    notificationChannel: resolveEnumFilter(
      requestedNotificationChannel,
      NOTIFICATION_CHANNEL_OPTIONS
    ),
    runId: firstSearchValue(searchParams.run_id)?.trim() || null,
    nodeRunId: firstSearchValue(searchParams.node_run_id)?.trim() || null,
    accessRequestId: firstSearchValue(searchParams.access_request_id)?.trim() || null,
    approvalTicketId: firstSearchValue(searchParams.approval_ticket_id)?.trim() || null
  } satisfies SensitiveAccessInboxPageFilterState;
}

function withStatus(
  filters: SensitiveAccessInboxPageFilterState,
  value: ApprovalTicketItem["status"] | null
) {
  return { ...filters, status: value };
}

function withWaitingStatus(
  filters: SensitiveAccessInboxPageFilterState,
  value: ApprovalTicketItem["waiting_status"] | null
) {
  return { ...filters, waitingStatus: value };
}

function withRequestDecision(
  filters: SensitiveAccessInboxPageFilterState,
  value: NonNullable<SensitiveAccessRequestItem["decision"]> | null
) {
  return { ...filters, requestDecision: value };
}

function withRequesterType(
  filters: SensitiveAccessInboxPageFilterState,
  value: SensitiveAccessRequestItem["requester_type"] | null
) {
  return { ...filters, requesterType: value };
}

function withNotificationStatus(
  filters: SensitiveAccessInboxPageFilterState,
  value: NotificationDispatchItem["status"] | null
) {
  return { ...filters, notificationStatus: value };
}

function withNotificationChannel(
  filters: SensitiveAccessInboxPageFilterState,
  value: NotificationDispatchItem["channel"] | null
) {
  return { ...filters, notificationChannel: value };
}

export default async function SensitiveAccessInboxPage({
  searchParams
}: SensitiveAccessInboxPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = buildFilters(resolvedSearchParams);

  const snapshot = await getSensitiveAccessInboxSnapshot({
    ticketStatus: filters.status ?? undefined,
    waitingStatus: filters.waitingStatus ?? undefined,
    requestDecision: filters.requestDecision ?? undefined,
    requesterType: filters.requesterType ?? undefined,
    notificationStatus: filters.notificationStatus ?? undefined,
    notificationChannel: filters.notificationChannel ?? undefined,
    runId: filters.runId ?? undefined,
    nodeRunId: filters.nodeRunId ?? undefined,
    accessRequestId: filters.accessRequestId ?? undefined,
    approvalTicketId: filters.approvalTicketId ?? undefined
  });
  const systemOverview = await getSystemOverview();

  return (
    <main className="page-shell workspace-page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Sensitive access inbox</p>
          <h1>审批、恢复与通知派发统一收口</h1>
          <p className="hero-copy">
            把 sensitive access request、approval ticket、notification dispatch 与 callback waiting
            lifecycle 放到同一条 operator 主链里，减少“看得到阻断但处理动作还要四处跳”的排障成本。
          </p>
        </div>
        <div className="hero-actions">
          <Link className="ghost-button" href="/runs">
            查看 run diagnostics
          </Link>
          <Link className="ghost-button" href="/workflows">
            回到 workflows
          </Link>
        </div>
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Filters</p>
              <h2>治理维度切片</h2>
            </div>
            <p className="section-copy">
              先按票据状态、恢复状态、请求决策、发起方与通知维度筛选，再配合细粒度 ID slice
              精确定位卡住的 callback / approval / dispatch。
            </p>
          </div>

          <SensitiveAccessInboxFilterSection
            activeValue={filters.status}
            allLabel="全部票据"
            filters={filters}
            options={APPROVAL_STATUS_OPTIONS}
            setFilter={withStatus}
            title="status"
          />
          <SensitiveAccessInboxFilterSection
            activeValue={filters.waitingStatus}
            allLabel="全部恢复状态"
            filters={filters}
            options={WAITING_STATUS_OPTIONS}
            setFilter={withWaitingStatus}
            title="waiting_status"
          />
          <SensitiveAccessInboxFilterSection
            activeValue={filters.requestDecision}
            allLabel="全部决策"
            filters={filters}
            options={REQUEST_DECISION_OPTIONS}
            setFilter={withRequestDecision}
            title="decision"
          />
          <SensitiveAccessInboxFilterSection
            activeValue={filters.requesterType}
            allLabel="全部发起方"
            filters={filters}
            options={REQUESTER_TYPE_OPTIONS}
            setFilter={withRequesterType}
            title="requester_type"
          />
          <SensitiveAccessInboxFilterSection
            activeValue={filters.notificationStatus}
            allLabel="全部通知状态"
            filters={filters}
            options={NOTIFICATION_STATUS_OPTIONS}
            setFilter={withNotificationStatus}
            title="notification_status"
          />
          <SensitiveAccessInboxFilterSection
            activeValue={filters.notificationChannel}
            allLabel="全部渠道"
            filters={filters}
            options={NOTIFICATION_CHANNEL_OPTIONS}
            setFilter={withNotificationChannel}
            title="notification_channel"
          />

          {hasActiveInboxFilters(filters) ? (
            <div className="summary-strip">
              {filters.runId ? <span className="event-chip">run slice {filters.runId}</span> : null}
              {filters.nodeRunId ? (
                <span className="event-chip">node run {filters.nodeRunId}</span>
              ) : null}
              {filters.accessRequestId ? (
                <span className="event-chip">request {filters.accessRequestId.slice(0, 8)}</span>
              ) : null}
              {filters.approvalTicketId ? (
                <span className="event-chip">ticket {filters.approvalTicketId.slice(0, 8)}</span>
              ) : null}
              {filters.requestDecision ? (
                <span className="event-chip">decision {filters.requestDecision}</span>
              ) : null}
              {filters.requesterType ? (
                <span className="event-chip">requester {filters.requesterType}</span>
              ) : null}
              {filters.notificationStatus ? (
                <span className="event-chip">notify {filters.notificationStatus}</span>
              ) : null}
              {filters.notificationChannel ? (
                <span className="event-chip">channel {filters.notificationChannel}</span>
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

        <SensitiveAccessInboxSliceForm filters={filters} />
        <SensitiveAccessChannelHealthPanel channels={snapshot.channels} />
      </section>

      <section className="diagnostics-layout">
        <SensitiveAccessInboxPanel
          callbackWaitingAutomation={systemOverview.callback_waiting_automation}
          entries={snapshot.entries}
        />
      </section>
    </main>
  );
}
