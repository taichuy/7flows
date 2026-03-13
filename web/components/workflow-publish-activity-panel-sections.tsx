import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import { WorkflowPublishInvocationEntryCard } from "@/components/workflow-publish-invocation-entry-card";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";
import {
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel,
  formatRateLimitPressure
} from "@/lib/published-invocation-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";

import { facetCount, formatTimeWindowLabel } from "@/components/workflow-publish-activity-panel-helpers";
import type { WorkflowPublishActivityPanelProps } from "@/components/workflow-publish-activity-panel-helpers";

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
            <WorkflowPublishInvocationEntryCard item={item} key={item.id} />
          ))}
        </div>
      ) : (
        <p className="empty-state compact">当前还没有 invocation 审计记录。endpoint 发布后，外部入口命中会在这里留下治理事实。</p>
      )}
    </>
  );
}
