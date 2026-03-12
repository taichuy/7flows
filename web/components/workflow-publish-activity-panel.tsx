import type {
  PublishedEndpointInvocationFacetItem,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import { formatDurationMs, formatKeyList, formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishActivityPanelProps = {
  binding: WorkflowPublishedEndpointItem;
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
};

function formatTimelineBucketLabel(
  value: string,
  granularity: "hour" | "day"
) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    ...(granularity === "hour"
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        }
      : {})
  }).format(date);
}

function facetCount(
  facets: PublishedEndpointInvocationFacetItem[] | undefined,
  value: string
) {
  return facets?.find((item) => item.value === value)?.count ?? 0;
}

export function WorkflowPublishActivityPanel({
  binding,
  invocationAudit,
  rateLimitWindowAudit
}: WorkflowPublishActivityPanelProps) {
  const summary = invocationAudit?.summary;
  const items = invocationAudit?.items ?? [];
  const requestSourceCounts = invocationAudit?.facets.request_source_counts ?? [];
  const cacheStatusCounts = invocationAudit?.facets.cache_status_counts ?? [];
  const apiKeyUsage = invocationAudit?.facets.api_key_usage ?? [];
  const failureReasons = invocationAudit?.facets.recent_failure_reasons ?? [];
  const timeline = invocationAudit?.facets.timeline ?? [];
  const timelineGranularity = invocationAudit?.facets.timeline_granularity ?? "hour";
  const timelineMaxCount = timeline.reduce(
    (max, bucket) => Math.max(max, bucket.total_count),
    0
  );
  const rateLimitPolicy = binding.rate_limit_policy;
  const windowUsed = rateLimitWindowAudit
    ? rateLimitWindowAudit.summary.succeeded_count +
      rateLimitWindowAudit.summary.failed_count
    : 0;
  const windowRejected = rateLimitWindowAudit?.summary.rejected_count ?? 0;
  const remainingQuota = rateLimitPolicy
    ? Math.max(rateLimitPolicy.requests - windowUsed, 0)
    : null;

  return (
    <div className="entry-card compact-card">
      <p className="entry-card-title">Invocation governance</p>
      <p className="section-copy entry-copy">
        这里消费独立的 published invocation audit，用于回答“谁在调、有没有被限流、最近失败因为什么”。
      </p>

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Total calls</span>
          <strong>{summary?.total_count ?? 0}</strong>
        </article>
        <article className="summary-card">
          <span>Rejected</span>
          <strong>{summary?.rejected_count ?? 0}</strong>
        </article>
        <article className="summary-card">
          <span>Last status</span>
          <strong>{summary?.last_status ?? "none"}</strong>
        </article>
        <article className="summary-card">
          <span>Last cache</span>
          <strong>{summary?.last_cache_status ?? "n/a"}</strong>
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
                hit {facetCount(cacheStatusCounts, "hit")} / miss{" "}
                {facetCount(cacheStatusCounts, "miss")} / bypass{" "}
                {facetCount(cacheStatusCounts, "bypass")}
              </dd>
            </div>
          </dl>
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
                  <dt>Rejected</dt>
                  <dd>{windowRejected}</dd>
                </div>
              </dl>
              <p className="section-copy entry-copy">
                当前窗口从{" "}
                {formatTimestamp(rateLimitWindowAudit?.filters.created_from ?? null)} 开始统计成功和失败调用，
                `rejected` 只作为治理信号，不占配额。
              </p>
            </>
          ) : (
            <p className="empty-state compact">
              当前 binding 没有启用 rate limit，开放调用不会按时间窗口限流。
            </p>
          )}
        </div>
      </div>

      <div className="entry-card compact-card">
        <p className="entry-card-title">Traffic timeline</p>
        <p className="section-copy entry-copy">
          按 {timelineGranularity === "hour" ? "小时" : "天"} 聚合最近调用，补足 publish
          activity 的趋势视图，方便判断流量抬升、拒绝峰值和缓存命中变化。
        </p>

        {timeline.length ? (
          <div className="publish-timeline">
            {timeline.map((bucket) => {
              const width =
                timelineMaxCount > 0
                  ? Math.max((bucket.total_count / timelineMaxCount) * 100, bucket.total_count > 0 ? 12 : 0)
                  : 0;

              return (
                <article className="payload-card compact-card" key={bucket.bucket_start}>
                  <div className="payload-card-header">
                    <span className="status-meta">
                      {formatTimelineBucketLabel(bucket.bucket_start, timelineGranularity)}
                    </span>
                    <span className="event-chip">total {bucket.total_count}</span>
                  </div>

                  <div className="publish-timeline-bar" aria-hidden="true">
                    <span
                      className="publish-timeline-bar-fill"
                      style={{ width: `${width}%` }}
                    />
                  </div>

                  <p className="section-copy entry-copy publish-timeline-copy">
                    {formatTimestamp(bucket.bucket_start)} - {formatTimestamp(bucket.bucket_end)}
                  </p>

                  <div className="tool-badge-row">
                    <span className="event-chip">success {bucket.succeeded_count}</span>
                    <span className="event-chip">failed {bucket.failed_count}</span>
                    <span className="event-chip">rejected {bucket.rejected_count}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state compact">
            当前还没有足够的 invocation timeline 数据，后续命中 published endpoint 后这里会显示趋势桶。
          </p>
        )}
      </div>

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
              <p className="section-copy entry-copy">
                最近一次出现在 {formatTimestamp(item.last_invoked_at)}。
              </p>
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
                <span className="event-chip">{item.cache_status}</span>
              </div>
              <p className="binding-meta">
                {item.request_source} · {formatTimestamp(item.created_at)} ·{" "}
                {formatDurationMs(item.duration_ms)}
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
                  <dd>{item.run_id ?? "not-started"}</dd>
                </div>
              </dl>
              {item.error_message ? (
                <p className="section-copy entry-copy">error: {item.error_message}</p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">
          当前还没有 invocation 审计记录。endpoint 发布后，外部入口命中会在这里留下治理事实。
        </p>
      )}
    </div>
  );
}
