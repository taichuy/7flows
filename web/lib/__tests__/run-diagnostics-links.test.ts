import { describe, expect, it } from "vitest";

import {
  buildRunDiagnosticsExecutionTimelineHref,
  buildRunDiagnosticsExecutionViewHref,
  RUN_DIAGNOSTICS_EXECUTION_TIMELINE_SECTION_ID,
  RUN_DIAGNOSTICS_EXECUTION_VIEW_SECTION_ID
} from "@/lib/run-diagnostics-links";

describe("run diagnostics links", () => {
  it("builds execution view deep links from the shared run detail route", () => {
    expect(buildRunDiagnosticsExecutionViewHref("run alpha/beta")).toBe(
      `/runs/run%20alpha%2Fbeta#${RUN_DIAGNOSTICS_EXECUTION_VIEW_SECTION_ID}`
    );
  });

  it("builds execution timeline deep links from the shared run detail route", () => {
    expect(buildRunDiagnosticsExecutionTimelineHref("run alpha/beta")).toBe(
      `/runs/run%20alpha%2Fbeta#${RUN_DIAGNOSTICS_EXECUTION_TIMELINE_SECTION_ID}`
    );
  });

  it("merges focused trace filters into scoped execution timeline deep links", () => {
    expect(
      buildRunDiagnosticsExecutionTimelineHref("run alpha/beta", {
        baseHref: "/runs/run%20alpha%2Fbeta?needs_follow_up=true",
        traceQuery: {
          node_run_id: "node-run-1",
          event_type: "tool.execution.blocked"
        }
      })
    ).toBe(
      `/runs/run%20alpha%2Fbeta?needs_follow_up=true&event_type=tool.execution.blocked&node_run_id=node-run-1#${RUN_DIAGNOSTICS_EXECUTION_TIMELINE_SECTION_ID}`
    );
  });
});
