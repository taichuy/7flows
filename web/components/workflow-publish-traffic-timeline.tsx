import type { PublishedEndpointInvocationTimeBucketItem } from "@/lib/get-workflow-publish";
import {
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel
} from "@/lib/published-invocation-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";

type WorkflowPublishTrafficTimelineProps = {
  timeline: PublishedEndpointInvocationTimeBucketItem[];
  timelineGranularity: "hour" | "day";
  timeWindowLabel: string;
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

function topBucketLabels(
  items: Array<{ value: string; count: number }>,
  formatter: (value: string) => string
) {
  return items.slice(0, 2).map((item) => `${formatter(item.value)} ${item.count}`);
}

function topApiKeyLabels(
  items: PublishedEndpointInvocationTimeBucketItem["api_key_counts"]
) {
  return items
    .slice(0, 2)
    .map((item) => `${item.name ?? item.key_prefix ?? item.api_key_id} ${item.count}`);
}

export function WorkflowPublishTrafficTimeline({
  timeline,
  timelineGranularity,
  timeWindowLabel
}: WorkflowPublishTrafficTimelineProps) {
  const timelineMaxCount = timeline.reduce(
    (max, bucket) => Math.max(max, bucket.total_count),
    0
  );

  return (
    <div className="entry-card compact-card">
      <p className="entry-card-title">Traffic timeline</p>
      <p className="section-copy entry-copy">
        按 {timelineGranularity === "hour" ? "小时" : "天"} 聚合最近调用，补足 publish
        activity 的趋势视图，方便判断流量抬升、拒绝峰值和缓存命中变化。当前时间窗：
        {timeWindowLabel}。
      </p>

      {timeline.length ? (
        <div className="publish-timeline">
          {timeline.map((bucket) => {
            const width =
              timelineMaxCount > 0
                ? Math.max((bucket.total_count / timelineMaxCount) * 100, bucket.total_count > 0 ? 12 : 0)
                : 0;
            const surfaceLabels = topBucketLabels(
              bucket.request_surface_counts,
              formatPublishedInvocationSurfaceLabel
            );
            const cacheLabels = topBucketLabels(
              bucket.cache_status_counts,
              formatPublishedInvocationCacheStatusLabel
            );
            const reasonLabels = topBucketLabels(
              bucket.reason_counts,
              formatPublishedInvocationReasonLabel
            );
            const apiKeyLabels = topApiKeyLabels(bucket.api_key_counts);

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

                {surfaceLabels.length ? (
                  <div className="tool-badge-row">
                    {surfaceLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {cacheLabels.length ? (
                  <div className="tool-badge-row">
                    {cacheLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {reasonLabels.length ? (
                  <div className="tool-badge-row">
                    {reasonLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {apiKeyLabels.length ? (
                  <div className="tool-badge-row">
                    {apiKeyLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        key {label}
                      </span>
                    ))}
                  </div>
                ) : null}
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
  );
}
