import React from "react";

import type { PublishedEndpointInvocationTimeBucketItem } from "@/lib/get-workflow-publish";
import {
  buildPublishedInvocationTrafficTimelineBucketSurface,
  buildPublishedInvocationTrafficTimelineSurfaceCopy
} from "@/lib/published-invocation-presenters";

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

export function WorkflowPublishTrafficTimeline({
  timeline,
  timelineGranularity,
  timeWindowLabel
}: WorkflowPublishTrafficTimelineProps) {
  const surfaceCopy = buildPublishedInvocationTrafficTimelineSurfaceCopy({
    timelineGranularity,
    timeWindowLabel
  });
  const timelineMaxCount = timeline.reduce(
    (max, bucket) => Math.max(max, bucket.total_count),
    0
  );

  return (
    <div className="entry-card compact-card">
      <p className="entry-card-title">{surfaceCopy.title}</p>
      <p className="section-copy entry-copy">{surfaceCopy.description}</p>

      {timeline.length ? (
        <div className="publish-timeline">
          {timeline.map((bucket) => {
            const width =
              timelineMaxCount > 0
                ? Math.max((bucket.total_count / timelineMaxCount) * 100, bucket.total_count > 0 ? 12 : 0)
                : 0;
            const bucketSurface = buildPublishedInvocationTrafficTimelineBucketSurface({
              bucket,
              apiKeyLabelPrefix: surfaceCopy.apiKeyLabelPrefix
            });

            return (
              <article className="payload-card compact-card" key={bucket.bucket_start}>
                <div className="payload-card-header">
                  <span className="status-meta">
                    {formatTimelineBucketLabel(bucket.bucket_start, timelineGranularity)}
                  </span>
                  <span className="event-chip">
                    {surfaceCopy.totalCountLabel} {bucket.total_count}
                  </span>
                </div>

                <div className="publish-timeline-bar" aria-hidden="true">
                  <span
                    className="publish-timeline-bar-fill"
                    style={{ width: `${width}%` }}
                  />
                </div>

                <p className="section-copy entry-copy publish-timeline-copy">
                  {bucketSurface.timeWindowLabel}
                </p>

                <div className="tool-badge-row">
                  <span className="event-chip">
                    {surfaceCopy.succeededCountLabel} {bucket.succeeded_count}
                  </span>
                  <span className="event-chip">
                    {surfaceCopy.failedCountLabel} {bucket.failed_count}
                  </span>
                  <span className="event-chip">
                    {surfaceCopy.rejectedCountLabel} {bucket.rejected_count}
                  </span>
                </div>

                {bucketSurface.surfaceLabels.length ? (
                  <div className="tool-badge-row">
                    {bucketSurface.surfaceLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {bucketSurface.cacheLabels.length ? (
                  <div className="tool-badge-row">
                    {bucketSurface.cacheLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {bucketSurface.runStatusLabels.length ? (
                  <div className="tool-badge-row">
                    {bucketSurface.runStatusLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {bucketSurface.reasonLabels.length ? (
                  <div className="tool-badge-row">
                    {bucketSurface.reasonLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {bucketSurface.apiKeyLabels.length ? (
                  <div className="tool-badge-row">
                    {bucketSurface.apiKeyLabels.map((label) => (
                      <span className="event-chip" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-state compact">{surfaceCopy.emptyState}</p>
      )}
    </div>
  );
}
