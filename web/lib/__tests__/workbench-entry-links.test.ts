import { describe, expect, it } from "vitest";

import {
  isCurrentWorkbenchHref,
  normalizeWorkbenchEntryLinkKey,
  normalizeWorkbenchRelativeHref
} from "../workbench-entry-links";

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

describe("normalizeWorkbenchRelativeHref", () => {
  it("sorts query params into a stable relative href", () => {
    expect(
      normalizeWorkbenchRelativeHref(
        "/workflows/workflow-1?track=starter&definition_issue=legacy_publish_auth&starter=starter-1"
      )
    ).toBe(
      "/workflows/workflow-1?definition_issue=legacy_publish_auth&starter=starter-1&track=starter"
    );
  });

  it("treats reordered scoped links as the same current workbench href", () => {
    expect(
      isCurrentWorkbenchHref(
        "/workflows/workflow-1?starter=starter-1&track=starter&definition_issue=missing_tool",
        "/workflows/workflow-1?definition_issue=missing_tool&track=starter&starter=starter-1"
      )
    ).toBe(true);
  });
});
