import { describe, expect, it } from "vitest";

import { buildPageTraceHref } from "@/components/run-diagnostics-panel/shared";

describe("run diagnostics shared helpers", () => {
  it("keeps trace pagination anchored to the shared run detail surface", () => {
    expect(
      buildPageTraceHref("run alpha/beta", {
        cursor: "cursor 1",
        payload_key: "results.tool_name",
        limit: 50,
        order: "desc"
      })
    ).toBe(
      "/runs/run%20alpha%2Fbeta?cursor=cursor+1&payload_key=results.tool_name&limit=50&order=desc"
    );
  });

  it("preserves existing workspace scope when appending trace filters", () => {
    expect(
      buildPageTraceHref(
        "run-1",
        {
          cursor: "cursor-2",
          limit: 100,
          order: "asc"
        },
        "/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true"
      )
    ).toBe(
      "/runs/run-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true&cursor=cursor-2&limit=100&order=asc"
    );
  });
});
