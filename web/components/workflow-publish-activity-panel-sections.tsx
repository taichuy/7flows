import Link from "next/link";

import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";
import {
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel,
  formatRateLimitPressure
} from "@/lib/published-invocation-presenters";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

import { facetCount, formatTimeWindowLabel } from "@/components/workflow-publish-activity-panel-helpers";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";

function formatMetricCounts(metrics: Record<string, number> | null | undefined): string {
  if (!metrics) {
    return "n/a";
  }

  const parts = Object.entries(metrics)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`);

  return parts.length ? parts.join(" · ") : "0";
}

function formatScheduledResume(item: PublishedEndpointInvocationListResponse["items"][number]): string {
  const scheduledResume = item.run_waiting_lifecycle;
  if (!scheduledResume?.scheduled_resume_delay_seconds) {
    return "n/a";
  }

  const parts = [`${scheduledResume.scheduled_resume_delay_seconds}s`];
  if (scheduledResume.scheduled_resume_source) {
    parts.push(scheduledResume.scheduled_resume_source);
  }
  if (scheduledResume.scheduled_waiting_status) {
    parts.push(scheduledResume.scheduled_waiting_status);
  }
  return parts.join(" · ");
}

type WorkflowPublishActivityInsightsProps = {
  binding: WorkflowPublishActivityPanelProps["binding"];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
  activeTimeWindow: WorkflowPublishActivityPanelProps["activeInvocationFilter"] extends infer T
    ? T extends { timeWindow: infer U }
      ? U | null
      : never
    : never;
};

export function WorkflowPublishActivityInsights({
  binding,
  invocationAudit,
  rateLimitWindowAudit,
  activeTimeWindow
}: WorkflowPublishActivityInsightsProps) {
  const summary = invocationAudit?.summary;
  const requestSourceCounts = invocationAudit?.facets.request_source_counts ?? [];
  const requestSurfaceCounts = invocationAudit?.facets.request_surface_counts ?? [];
  const cacheStatusCounts = invocationAudit?.facets.cache_status_counts ?? [];
  const runStatusCounts = invocationAudit?.facets.run_status_counts ?? [];
  const reasonCounts = invocationAudit?.facets.reason_counts ?? [];
  const timeline = invocationAudit?.facets.timeline ?? [];
  const timelineGranularity = invocationAudit?.facets.timeline_granularity ?? "hour";
  const rateLimitPolicy = binding.rate_limit_policy;
  const windowUsed = rateLimitWindowAudit
    ? rateLimitWindowAudit.summary.succeeded_count + rateLimitWindowAudit.summary.failed_count
    : 0;
  const windowRejected = rateLimitWindowAudit?.summary.rejected_count ?? 0;
  const remainingQuota = rateLimitPolicy ? Math.max(rateLimitPolicy.requests - windowUsed, 0) : null;
  const pressure = rateLimitPolicy ? formatRateLimitPressure(rateLimitPolicy.requests, windowUsed) : null;

  return (
    <>
      <div className="publish-summary-grid">
        <article className="status-card compact-card">
          <span className="status-label">Total calls</span>
          <strong>{summary?.total_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Succeeded</span>
          <strong>{summary?.succeeded_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Failed</span>
          <strong>{summary?.failed_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Rejected</span>
          <strong>{summary?.rejected_count ?? 0}</strong>
        </article>
        <article className="status-card compact-card">
          <span className="status-label">Last run status</span>
          <strong>{summary?.last_run_status ?? "n/a"}</strong>
        </article>
      </div>

      <div className="publish-meta-grid">
        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Traffic mix</span>
          </div>
          <dl className="compact-meta-list">
            <div>
              <dt>Workflow</dt>
              <dd>{facetCount(requestSourceCounts, "workflow")}</dd>
            </div>
            <div>
              <dt>Alias</dt>
              <dd>{facetCount(requestSourceCounts, "alias")}</dd>
            </div>
            <div>
              <dt>Path</dt>
              <dd>{facetCount(requestSourceCounts, "path")}</dd>
            </div>
            <div>
              <dt>Cache surface</dt>
              <dd>
                hit {facetCount(cacheStatusCounts, "hit")} / miss {facetCount(cacheStatusCounts, "miss")} /
                bypass {facetCount(cacheStatusCounts, "bypass")}
              </dd>
            </div>
            <div>
              <dt>Run states</dt>
              <dd>
                {runStatusCounts.length
                  ? runStatusCounts
                      .map((item) => `${formatPublishedRunStatusLabel(item.value)} ${item.count}`)
                      .join(" / ")
                  : "n/a"}
              </dd>
            </div>
          </dl>
          {requestSurfaceCounts.length ? (
            <div className="tool-badge-row">
              {requestSurfaceCounts.map((item) => (
                <span className="event-chip" key={item.value}>
                  {formatPublishedInvocationSurfaceLabel(item.value)} {item.count}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Rate limit window</span>
          </div>
          {rateLimitPolicy ? (
            <>
              <dl className="compact-meta-list">
                <div>
                  <dt>Policy</dt>
                  <dd>
                    {rateLimitPolicy.requests} / {rateLimitPolicy.windowSeconds}s
                  </dd>
                </div>
                <div>
                  <dt>Used</dt>
                  <dd>{windowUsed}</dd>
                </div>
                <div>
                  <dt>Remaining</dt>
                  <dd>{remainingQuota}</dd>
                </div>
                <div>
                  <dt>Pressure</dt>
                  <dd>{pressure?.label ?? "0%"}</dd>
                </div>
                <div>
                  <dt>Rejected</dt>
                  <dd>{windowRejected}</dd>
                </div>
              </dl>
              <p className="section-copy entry-copy">
                当前窗口从 {formatTimestamp(rateLimitWindowAudit?.filters.created_from ?? null)} 开始统计成功和失败调用，
                `rejected` 仅作为治理信号，不占配额。
              </p>
            </>
          ) : (
            <p className="empty-state compact">当前 binding 没有启用 rate limit，开放调用不会按时间窗口限流。</p>
          )}
        </div>
      </div>

      <WorkflowPublishTrafficTimeline
        timeline={timeline}
        timelineGranularity={timelineGranularity}
        timeWindowLabel={formatTimeWindowLabel(activeTimeWindow ?? "all")}
      />

      {reasonCounts.length ? (
        <div className="entry-card compact-card">
          <p className="entry-card-title">Issue signals</p>
          <p className="section-copy entry-copy">
            将 `rejected / failed` 聚合为稳定原因码，便于区分限流、鉴权和当前同步协议边界。
          </p>
          <div className="tool-badge-row">
            {reasonCounts.map((item) => (
              <span className="event-chip" key={item.value}>
                {formatPublishedInvocationReasonLabel(item.value)} {item.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

type WorkflowPublishActivityDetailsProps = {
  invocationAudit: PublishedEndpointInvocationListResponse | null;
};

export function WorkflowPublishActivityDetails({ invocationAudit }: WorkflowPublishActivityDetailsProps) {
  const items = invocationAudit?.items ?? [];
  const apiKeyUsage = invocationAudit?.facets.api_key_usage ?? [];
  const failureReasons = invocationAudit?.facets.recent_failure_reasons ?? [];

  return (
    <>
      {apiKeyUsage.length ? (
        <div className="publish-cache-list">
          {apiKeyUsage.map((item) => (
            <article className="payload-card compact-card" key={item.api_key_id}>
              <div className="payload-card-header">
                <span className="status-meta">{item.name ?? item.api_key_id}</span>
                <span className="event-chip">{item.key_prefix ?? "no-prefix"}</span>
              </div>
              <dl className="compact-meta-list">
                <div>
                  <dt>Calls</dt>
                  <dd>{item.invocation_count}</dd>
                </div>
                <div>
                  <dt>Status mix</dt>
                  <dd>
                    ok {item.succeeded_count} / failed {item.failed_count} / rejected {item.rejected_count}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{item.last_status ?? item.status ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Last used</dt>
                  <dd>{formatTimestamp(item.last_invoked_at)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      ) : null}

      {failureReasons.length ? (
        <div className="publish-cache-list">
          {failureReasons.map((item) => (
            <article className="payload-card compact-card" key={item.message}>
              <div className="payload-card-header">
                <span className="status-meta">Failure reason</span>
                <span className="event-chip">count {item.count}</span>
              </div>
              <p className="binding-meta">{item.message}</p>
              <p className="section-copy entry-copy">最近一次出现在 {formatTimestamp(item.last_invoked_at)}。</p>
            </article>
          ))}
        </div>
      ) : null}

      {items.length ? (
        <div className="publish-cache-list">
          {items.map((item) => (
            <article className="payload-card compact-card" key={item.id}>
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
                {formatPublishedInvocationSurfaceLabel(item.request_surface)} · {item.request_source} · {formatTimestamp(item.created_at)} · {formatDurationMs(item.duration_ms)}
              </p>
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
                  <dd>{item.run_status ?? "n/a"}</dd>
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
                  <dd>{formatScheduledResume(item)}</dd>
                </div>
              </dl>
              {item.run_status === "waiting" ? (
                <p className="section-copy entry-copy">
                  该请求已成功接入 durable runtime，当前仍处于 waiting；可直接打开 run detail 继续追踪
                  {item.run_current_node_id ? `，当前节点 ${item.run_current_node_id}` : ""}
                  {item.run_waiting_reason ? `，等待原因 ${item.run_waiting_reason}` : ""}。
                </p>
              ) : null}
              {item.run_waiting_lifecycle ? (
                <p className="section-copy entry-copy">
                  waiting drilldown：node run {item.run_waiting_lifecycle.node_run_id} · node status {item.run_waiting_lifecycle.node_status}
                  {item.run_waiting_lifecycle.callback_ticket_count
                    ? ` · callback tickets ${item.run_waiting_lifecycle.callback_ticket_count}`
                    : ""}
                  {item.run_waiting_lifecycle.scheduled_resume_delay_seconds
                    ? ` · scheduled resume ${formatScheduledResume(item)}`
                    : ""}
                  。
                </p>
              ) : null}
              {item.run_status === "succeeded" ? (
                <p className="section-copy entry-copy">
                  该请求已经走完整条 publish 调用链，run 已结束，可以直接对照 response preview 做回放。
                </p>
              ) : null}
              {item.error_message ? <p className="section-copy entry-copy">error: {item.error_message}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">当前还没有 invocation 审计记录。endpoint 发布后，外部入口命中会在这里留下治理事实。</p>
      )}
    </>
  );
}
