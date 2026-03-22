import { describe, expect, it } from "vitest";

import { normalizeWorkbenchEntryLinkKey } from "./workbench-entry-links";

describe("normalizeWorkbenchEntryLinkKey", () => {
  it("accepts canonical and aliased workbench entry keys", () => {
    expect(normalizeWorkbenchEntryLinkKey("workflowLibrary")).toBe("workflowLibrary");
    expect(normalizeWorkbenchEntryLinkKey("workflows")).toBe("workflowLibrary");
    expect(normalizeWorkbenchEntryLinkKey(" workflow_library ")).toBe("workflowLibrary");
    expect(normalizeWorkbenchEntryLinkKey("runs")).toBe("runLibrary");
    expect(normalizeWorkbenchEntryLinkKey("run_library")).toBe("runLibrary");
  });

  it("rejects prototype keys and unknown values", () => {
    expect(normalizeWorkbenchEntryLinkKey("toString")).toBeNull();
    expect(normalizeWorkbenchEntryLinkKey("__proto__")).toBeNull();
    expect(normalizeWorkbenchEntryLinkKey("unknown_entry")).toBeNull();
    expect(normalizeWorkbenchEntryLinkKey("   ")).toBeNull();
  });
});
