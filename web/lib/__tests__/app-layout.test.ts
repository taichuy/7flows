import { describe, expect, it } from "vitest";

import { shouldBypassGlobalAppLayout } from "@/lib/app-layout";

describe("shouldBypassGlobalAppLayout", () => {
  it("returns true for workspace-auth routes that use a dedicated shell", () => {
    expect(shouldBypassGlobalAppLayout("/login")).toBe(true);
    expect(shouldBypassGlobalAppLayout("/workspace")).toBe(true);
    expect(shouldBypassGlobalAppLayout("/workspace/apps")).toBe(true);
    expect(shouldBypassGlobalAppLayout("/admin/members")).toBe(true);
    expect(shouldBypassGlobalAppLayout("/workflows/new")).toBe(true);
  });

  it("keeps the global shell for the rest of the studio routes", () => {
    expect(shouldBypassGlobalAppLayout(null)).toBe(false);
    expect(shouldBypassGlobalAppLayout("/")).toBe(false);
    expect(shouldBypassGlobalAppLayout("/workflows")).toBe(false);
    expect(shouldBypassGlobalAppLayout("/runs")).toBe(false);
  });
});
