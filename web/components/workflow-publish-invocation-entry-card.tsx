import Link from "next/link";

import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";
import {
  formatCallbackLifecycleLabel,
  formatScheduledResumeLabel,
  getCallbackWaitingHeadline,
  listCallbackWaitingBlockerRows,
  listCallbackWaitingChips
} from "@/lib/callback-waiting-presenters";
import {
  buildPublishedInvocationInboxHref,
  formatPublishedInvocationWaitingFollowUp,
  formatPublishedInvocationWaitingHeadline,
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel,
  listPublishedInvocationSensitiveAccessChips,
  listPublishedInvocationSensitiveAccessRows
} from "@/lib/published-invocation-presenters";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

type PublishedInvocationItem = PublishedEndpointInvocationListResponse["items"][number];

type WorkflowPublishInvocationEntryCardProps = {
  item: PublishedInvocationItem;
  detailHref: string;
  detailActive: boolean;
};

function formatMetricCounts(metrics: Record<string, number> | null | undefined): string {
  if (!metrics) {
    return "n/a";
  }

  const parts = Object.entries(metrics)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`);

  return parts.length ? parts.join(" · ") : "0";
}

function hasInvocationDrilldown(item: PublishedInvocationItem): boolean {
  return Boolean(
    item.error_message ||
      item.response_preview ||
      item.request_preview ||
      item.run_waiting_lifecycle ||
      item.finished_at
  );
}

export function WorkflowPublishInvocationEntryCard({
  item,
  detailHref,
  detailActive
}: WorkflowPublishInvocationEntryCardProps) {
  const waitingLifecycle = item.run_waiting_lifecycle;
  const callbackLifecycle = waitingLifecycle?.callback_waiting_lifecycle;
  const scheduledResumeLabel =
    formatScheduledResumeLabel({
      scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
      scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
      scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
      scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
      scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
    }) ?? "n/a";
  const callbackLifecycleLabel = formatCallbackLifecycleLabel(callbackLifecycle);
  const waitingHeadline = getCallbackWaitingHeadline({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
  });
  const waitingChips = listCallbackWaitingChips({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
  });
  const waitingExplanation = waitingLifecycle?.callback_waiting_explanation;
  const waitingOverviewHeadline = formatPublishedInvocationWaitingHeadline({
    explanation: waitingExplanation,
    fallbackHeadline: waitingHeadline,
    nodeRunId: waitingLifecycle?.node_run_id,
    nodeStatus: waitingLifecycle?.node_status
  });
  const waitingOverviewFollowUp = formatPublishedInvocationWaitingFollowUp(waitingExplanation);
  const sensitiveAccessChips = listPublishedInvocationSensitiveAccessChips(
    waitingLifecycle?.sensitive_access_summary
  );
  const waitingBlockerRows = listCallbackWaitingBlockerRows({
    lifecycle: callbackLifecycle,
    scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
    scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
    scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
    scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
    scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
  });
  const sensitiveAccessRows = listPublishedInvocationSensitiveAccessRows(
    waitingLifecycle?.sensitive_access_summary
  );
  const inboxHref = buildPublishedInvocationInboxHref({
    invocation: item,
    callbackTickets: [],
    sensitiveAccessEntries: []
  });

  return (
    <article className="payload-card compact-card">
      <div className="payload-card-header">
        <span className={`health-pill ${item.status}`}>{item.status}</span>
        <div className="tool-badge-row">
          <span className="event-chip">
            {formatPublishedInvocationCacheStatusLabel(item.cache_status)}
          </span>
          {item.reason_code ? (
            <span className="event-chip">{formatPublishedInvocationReasonLabel(item.reason_code)}</span>
          ) : null}
        </div>
      </div>
      <p className="binding-meta">
        {formatPublishedInvocationSurfaceLabel(item.request_surface)} · {item.request_source} ·{" "}
        {formatTimestamp(item.created_at)} · {formatDurationMs(item.duration_ms)}
      </p>
      {inboxHref ? (
        <div className="tool-badge-row">
          <Link className="event-chip inbox-filter-link" href={inboxHref}>
            open waiting inbox
          </Link>
        </div>
      ) : null}
      <dl className="compact-meta-list">
        <div>
          <dt>API key</dt>
          <dd>{item.api_key_name ?? item.api_key_prefix ?? "internal"}</dd>
        </div>
        <div>
          <dt>Request keys</dt>
          <dd>{formatKeyList(item.request_preview.keys ?? [])}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd>
            {item.run_id ? (
              <Link className="inline-link" href={`/runs/${encodeURIComponent(item.run_id)}`}>
                {item.run_id}
              </Link>
            ) : (
              "not-started"
            )}
          </dd>
        </div>
        <div>
          <dt>Run status</dt>
          <dd>{formatPublishedRunStatusLabel(item.run_status)}</dd>
        </div>
        <div>
          <dt>Current node</dt>
          <dd>{item.run_current_node_id ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Waiting reason</dt>
          <dd>{item.run_waiting_reason ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Callback tickets</dt>
          <dd>
            {item.run_waiting_lifecycle
              ? `${item.run_waiting_lifecycle.callback_ticket_count} · ${formatMetricCounts(item.run_waiting_lifecycle.callback_ticket_status_counts)}`
              : "n/a"}
          </dd>
        </div>
        <div>
          <dt>Scheduled resume</dt>
          <dd>{scheduledResumeLabel}</dd>
        </div>
      </dl>
      {item.run_status === "waiting" ? (
        <p className="section-copy entry-copy">
          该请求已成功接入 durable runtime，当前仍处于 waiting；可直接打开 run detail 继续追踪
          {item.run_current_node_id ? `，当前节点 ${item.run_current_node_id}` : ""}
          {item.run_waiting_reason ? `，等待原因 ${item.run_waiting_reason}` : ""}。
        </p>
      ) : null}
      {waitingLifecycle ? (
        <div className="publish-meta-grid">
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">Waiting overview</span>
            </div>
            <p className="section-copy entry-copy">{waitingOverviewHeadline}</p>
            {waitingOverviewFollowUp ? (
              <p className="binding-meta">{waitingOverviewFollowUp}</p>
            ) : null}
            {waitingChips.length || sensitiveAccessChips.length ? (
              <p className="binding-meta">
                {[...waitingChips, ...sensitiveAccessChips].join(" · ")}
              </p>
            ) : null}
            <dl className="compact-meta-list">
              <div>
                <dt>Node run</dt>
                <dd>{waitingLifecycle.node_run_id}</dd>
              </div>
              <div>
                <dt>Node status</dt>
                <dd>{waitingLifecycle.node_status}</dd>
              </div>
              <div>
                <dt>Callback tickets</dt>
                <dd>
                  {waitingLifecycle.callback_ticket_count
                    ? `${waitingLifecycle.callback_ticket_count} · ${formatMetricCounts(waitingLifecycle.callback_ticket_status_counts)}`
                    : "0"}
                </dd>
              </div>
              <div>
                <dt>Callback lifecycle</dt>
                <dd>{callbackLifecycleLabel ?? "tracked in detail panel"}</dd>
              </div>
              {waitingBlockerRows.map((row) => (
                <div key={`${item.id}:${row.label}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
              {sensitiveAccessRows.map((row) => (
                <div key={`${item.id}:sensitive:${row.label}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
      {item.run_status === "succeeded" ? (
        <p className="section-copy entry-copy">
          该请求已经走完整条 publish 调用链，run 已结束，可以直接对照 response preview 做回放。
        </p>
      ) : null}
      {item.error_message ? <p className="section-copy entry-copy">error: {item.error_message}</p> : null}
      {hasInvocationDrilldown(item) ? (
        <div className="publish-invocation-actions">
          <Link className="inline-link" href={detailHref}>
            {detailActive ? "查看当前详情" : "打开 invocation detail"}
          </Link>
          <span className="section-copy entry-copy">
            详情面板会补 run / callback ticket / callback lifecycle / cache 四类稳定排障入口。
          </span>
        </div>
      ) : null}
    </article>
  );
}
