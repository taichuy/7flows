import { describe, expect, it } from "vitest";

import { buildWorkflowGovernanceHandoff } from "@/lib/workflow-governance-handoff";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

describe("workflow-governance-handoff", () => {
  it("keeps legacy publish auth scope on workflow links without catalog-gap facts", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-legacy-auth",
      workflowDetailHref: "/workflows/workflow-legacy-auth?starter=starter-openclaw",
      legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
        binding: {
          workflow_id: "workflow-legacy-auth",
          workflow_name: "Legacy Auth workflow"
        }
      })
    });

    expect(handoff.workflowGovernanceHref).toBe(
      "/workflows/workflow-legacy-auth?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
    expect(handoff.legacyAuthHandoff?.statusChipLabel).toBe("publish auth blocker");
    expect(handoff.legacyAuthHandoff?.detail).toContain("1 条 published blocker");
  });

  it("prioritizes legacy publish auth scope on workflow links when both blockers coexist", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-mixed",
      workflowDetailHref: "/workflows/workflow-mixed?starter=starter-openclaw",
      toolGovernance: {
        referenced_tool_ids: ["native.catalog-gap"],
        missing_tool_ids: ["native.catalog-gap"],
        governed_tool_count: 1,
        strong_isolation_tool_count: 0
      },
      legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
        binding: {
          workflow_id: "workflow-mixed",
          workflow_name: "Mixed workflow"
        }
      }),
      workflowCatalogGapDetail: "当前 workflow 仍有 catalog gap。"
    });

    expect(handoff.workflowGovernanceHref).toBe(
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
    expect(handoff.workflowCatalogGapSummary).toBe("catalog gap · native.catalog-gap");
    expect(handoff.legacyAuthHandoff?.statusChipLabel).toBe("publish auth blocker");
  });

  it("preserves an explicit workflow detail scope when callers already pinned it", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-mixed",
      workflowDetailHref:
        "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=missing_tool",
      toolGovernance: {
        referenced_tool_ids: ["native.catalog-gap"],
        missing_tool_ids: ["native.catalog-gap"],
        governed_tool_count: 1,
        strong_isolation_tool_count: 0
      },
      legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
        binding: {
          workflow_id: "workflow-mixed",
          workflow_name: "Mixed workflow"
        }
      })
    });

    expect(handoff.workflowGovernanceHref).toBe(
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=missing_tool"
    );
  });
});
