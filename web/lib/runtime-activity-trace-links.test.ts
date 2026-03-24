import { describe, expect, it } from "vitest";

import {
  buildRuntimeActivityEventTraceLinkSurface,
  buildRuntimeActivityEventTypeTraceLinkSurface
} from "@/lib/runtime-activity-trace-links";

describe("runtime activity trace links", () => {
  it("builds scoped trace links for recent runtime events", () => {
    expect(
      buildRuntimeActivityEventTraceLinkSurface(
        {
          run_id: "run-1",
          node_run_id: "node-run-1",
          event_type: "callback_waiting"
        },
        {
          resolveRunHref: (runId) => `/runs/${runId}?needs_follow_up=true&q=drift`,
          hrefLabel: "open recent event trace"
        }
      )
    ).toEqual({
      href: "/runs/run-1?needs_follow_up=true&q=drift&event_type=callback_waiting&node_run_id=node-run-1#run-diagnostics-execution-timeline",
      label: "open recent event trace"
    });
  });

  it("reuses the latest matching recent event for aggregate event type chips", () => {
    expect(
      buildRuntimeActivityEventTypeTraceLinkSurface({
        eventType: "tool.completed",
        recentEvents: [
          {
            run_id: "run-2",
            node_run_id: null,
            event_type: "assistant.completed"
          },
          {
            run_id: "run-1",
            node_run_id: "node-run-2",
            event_type: "tool.completed"
          }
        ]
      })
    ).toEqual({
      href: "/runs/run-1?event_type=tool.completed&node_run_id=node-run-2#run-diagnostics-execution-timeline",
      label: "open tool.completed trace"
    });
  });

  it("returns null when the aggregate event type has no sampled recent trace", () => {
    expect(
      buildRuntimeActivityEventTypeTraceLinkSurface({
        eventType: "tool.completed",
        recentEvents: [
          {
            run_id: "run-2",
            node_run_id: null,
            event_type: "assistant.completed"
          }
        ]
      })
    ).toBeNull();
  });
});
