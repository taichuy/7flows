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
});
