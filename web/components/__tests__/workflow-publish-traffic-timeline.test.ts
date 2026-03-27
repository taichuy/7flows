import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowPublishTrafficTimeline } from "@/components/workflow-publish-traffic-timeline";
import { formatTimestamp } from "@/lib/runtime-presenters";

describe("WorkflowPublishTrafficTimeline", () => {
  it("uses shared timeline surface copy", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishTrafficTimeline, {
        timeline: [],
        timelineGranularity: "hour",
        timeWindowLabel: "最近 24 小时"
      })
    );

    expect(html).toContain("Traffic timeline");
    expect(html).toContain("按小时聚合最近调用");
    expect(html).toContain("最近 24 小时");
    expect(html).toContain("当前还没有足够的 invocation timeline 数据");
  });

  it("uses shared chip labels for totals, statuses and api keys", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishTrafficTimeline, {
        timeline: [
          {
            bucket_start: "2026-03-20T00:00:00Z",
            bucket_end: "2026-03-20T01:00:00Z",
            total_count: 3,
            succeeded_count: 2,
            failed_count: 1,
            rejected_count: 0,
            request_surface_counts: [
              { value: "openai.responses", count: 2 },
              { value: "native.workflow", count: 1 }
            ],
            cache_status_counts: [{ value: "hit", count: 2 }],
            run_status_counts: [{ value: "waiting_callback", count: 1 }],
            reason_counts: [{ value: "runtime_failed", count: 1 }],
            api_key_counts: [
              {
                api_key_id: "key-1",
                key_prefix: "sk-test",
                name: "Primary key",
                count: 2
              }
            ]
          }
        ],
        timelineGranularity: "hour",
        timeWindowLabel: "最近 24 小时"
      })
    );

    expect(html).toContain("total 3");
    expect(html).toContain("success 2");
    expect(html).toContain("failed 1");
    expect(html).toContain("rejected 0");
    expect(html).toContain("OpenAI responses 2");
    expect(html).toContain("Native workflow route 1");
    expect(html).toContain("Cache hit 2");
    expect(html).toContain("Waiting callback 1");
    expect(html).toContain("Runtime failed 1");
    expect(html).toContain("key Primary key 2");
    expect(html).toContain(
      `${formatTimestamp("2026-03-20T00:00:00Z")} - ${formatTimestamp("2026-03-20T01:00:00Z")}`
    );
  });
  it("keeps traffic timeline focused on aggregate facts instead of projecting selected invocation CTA", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishTrafficTimeline, {
        timeline: [],
        timelineGranularity: "hour",
        timeWindowLabel: "最近 24 小时"
      })
    );

    expect(html).toContain("Traffic timeline");
    expect(html).not.toContain("Selected invocation next step");
    expect(html).not.toContain("approval blocker");
  });
});
