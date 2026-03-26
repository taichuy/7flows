import { describe, expect, it } from "vitest";

import {
  buildWorkflowGovernanceDetailHrefFromCurrentHref,
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

describe("workflow-governance-handoff", () => {
  it("preserves workspace starter scope when current href already points at the same workflow", () => {
    expect(
      buildWorkflowGovernanceDetailHrefFromCurrentHref({
        workflowId: "workflow-same",
        currentHref:
          "/workflows/workflow-same?starter=starter-openclaw&definition_issue=missing_tool&q=drift"
      })
    ).toBe(
      "/workflows/workflow-same?q=drift&starter=starter-openclaw&definition_issue=missing_tool"
    );
  });

  it("drops unrelated publish query params when reusing the current workflow href", () => {
    expect(
      buildWorkflowGovernanceDetailHrefFromCurrentHref({
        workflowId: "workflow-same",
        currentHref:
          "/workflows/workflow-same?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-openclaw&publish_binding=binding-1&publish_invocation=invocation-1"
      })
    ).toBe(
      "/workflows/workflow-same?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-openclaw"
    );
  });

  it("falls back to the canonical workflow detail href outside the workflow page", () => {
    expect(
      buildWorkflowGovernanceDetailHrefFromCurrentHref({
        workflowId: "workflow-same",
        currentHref: "/sensitive-access?run_id=run-1&definition_issue=missing_tool"
      })
    ).toBe("/workflows/workflow-same");
  });

  it("builds shared catalog-gap detail for recent-run style surfaces", () => {
    expect(
      buildWorkflowCatalogGapDetail({
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        subjectLabel: "run",
        returnDetail:
          "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。"
      })
    ).toBe(
      "当前 run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。"
    );
  });

  it("returns null shared catalog-gap detail when no missing tools remain", () => {
    expect(
      buildWorkflowCatalogGapDetail({
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        },
        subjectLabel: "run",
        returnDetail: "noop"
      })
    ).toBeNull();
  });

  it("keeps demonstrative run labels compact for diagnostics surfaces", () => {
    expect(
      buildWorkflowCatalogGapDetail({
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        subjectLabel: "这条 run",
        returnDetail:
          "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照当前 node timeline 与 trace。"
      })
    ).toBe(
      "当前这条 run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照当前 node timeline 与 trace。"
    );
  });

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
    expect(handoff.workflowCatalogGapHref).toBeNull();
    expect(handoff.legacyAuthHandoff?.statusChipLabel).toBe("publish auth blocker");
    expect(handoff.legacyAuthHandoff?.detail).toContain("1 条 published blocker");
  });

  it("prioritizes legacy publish auth scope while keeping a separate catalog-gap shortcut", () => {
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
    expect(handoff.workflowCatalogGapHref).toBe(
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=missing_tool"
    );
    expect(handoff.workflowCatalogGapSummary).toBe("catalog gap · native.catalog-gap");
    expect(handoff.legacyAuthHandoff?.statusChipLabel).toBe("publish auth blocker");
  });

  it("preserves full workspace-starter scope on both governance links", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-mixed",
      workflowDetailHref:
        "/workflows/workflow-mixed?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
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
      "/workflows/workflow-mixed?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=legacy_publish_auth"
    );
    expect(handoff.workflowCatalogGapHref).toBe(
      "/workflows/workflow-mixed?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool"
    );
  });

  it("upgrades an explicit missing-tool scope to legacy auth while preserving the catalog-gap shortcut", () => {
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
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
    expect(handoff.workflowCatalogGapHref).toBe(
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=missing_tool"
    );
  });

  it("falls back to legacy auth when an explicit missing-tool scope becomes stale", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-legacy-only",
      workflowDetailHref:
        "/workflows/workflow-legacy-only?starter=starter-openclaw&definition_issue=missing_tool",
      legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
        binding: {
          workflow_id: "workflow-legacy-only",
          workflow_name: "Legacy-only workflow"
        }
      })
    });

    expect(handoff.workflowGovernanceHref).toBe(
      "/workflows/workflow-legacy-only?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
    expect(handoff.workflowCatalogGapHref).toBeNull();
  });

  it("accepts workflow-library legacy auth summaries when source handoff lacks a publish snapshot", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-summary",
      workflowDetailHref: "/workflows/workflow-summary?starter=starter-openclaw",
      toolGovernance: {
        referenced_tool_ids: ["native.catalog-gap"],
        missing_tool_ids: ["native.catalog-gap"],
        governed_tool_count: 0,
        strong_isolation_tool_count: 0
      },
      legacyAuthGovernance: {
        binding_count: 2,
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 0
      }
    });

    expect(handoff.workflowGovernanceHref).toBe(
      "/workflows/workflow-summary?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
    expect(handoff.workflowCatalogGapHref).toBe(
      "/workflows/workflow-summary?starter=starter-openclaw&definition_issue=missing_tool"
    );
    expect(handoff.legacyAuthHandoff).toBeNull();
  });

  it("keeps an explicit legacy-auth scope while preserving the catalog-gap shortcut", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-mixed",
      workflowDetailHref:
        "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=legacy_publish_auth",
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
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=legacy_publish_auth"
    );
    expect(handoff.workflowCatalogGapHref).toBe(
      "/workflows/workflow-mixed?starter=starter-openclaw&definition_issue=missing_tool"
    );
  });

  it("falls back to missing-tool scope when an explicit legacy-auth scope becomes stale", () => {
    const handoff = buildWorkflowGovernanceHandoff({
      workflowId: "workflow-catalog-gap",
      workflowDetailHref:
        "/workflows/workflow-catalog-gap?starter=starter-openclaw&definition_issue=legacy_publish_auth",
      toolGovernance: {
        referenced_tool_ids: ["native.catalog-gap"],
        missing_tool_ids: ["native.catalog-gap"],
        governed_tool_count: 0,
        strong_isolation_tool_count: 0
      }
    });

    expect(handoff.workflowGovernanceHref).toBe(
      "/workflows/workflow-catalog-gap?starter=starter-openclaw&definition_issue=missing_tool"
    );
    expect(handoff.workflowCatalogGapHref).toBe(
      "/workflows/workflow-catalog-gap?starter=starter-openclaw&definition_issue=missing_tool"
    );
  });
});
