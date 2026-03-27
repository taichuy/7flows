import { describe, expect, it } from "vitest";

import { buildRunDetailHref, buildWorkflowDetailHref } from "../workbench-links";

describe("workbench-links", () => {
  it("builds encoded run and workflow detail hrefs", () => {
    expect(buildRunDetailHref("run alpha/beta")).toBe("/runs/run%20alpha%2Fbeta");
    expect(buildWorkflowDetailHref("workflow alpha/beta")).toBe(
      "/workflows/workflow%20alpha%2Fbeta"
    );
  });

  it("trims ids before building hrefs", () => {
    expect(buildRunDetailHref("  run-1  ")).toBe("/runs/run-1");
    expect(buildWorkflowDetailHref("  workflow-1  ")).toBe("/workflows/workflow-1");
  });

  it("rejects empty ids", () => {
    expect(() => buildRunDetailHref("   ")).toThrow("Cannot build run href without an id.");
    expect(() => buildWorkflowDetailHref("")).toThrow(
      "Cannot build workflow href without an id."
    );
  });
});
