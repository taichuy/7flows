import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";

describe("WorkspaceStarterFollowUpCard", () => {
  it("renders the full workflow governance handoff when catalog gap and legacy auth coexist", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterFollowUpCard, {
        label: "catalog gap",
        detail: "当前 starter 仍有 catalog gap（native.catalog-gap）；先回源 workflow 补齐 binding，再回来继续复用或创建。",
        primaryResourceSummary:
          "Catalog gap starter · catalog gap · native.catalog-gap · publish auth blocker · source 0.4.0",
        workflowGovernanceHandoff: {
          workflowId: "wf-gap",
          workflowGovernanceHref: "/workflows/wf-gap?definition_issue=legacy_publish_auth",
          workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
          workflowCatalogGapDetail:
            "当前 workflow 仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy。",
          workflowCatalogGapHref: "/workflows/wf-gap?definition_issue=missing_tool",
          legacyAuthHandoff: {
            bindingChipLabel: "2 legacy bindings",
            statusChipLabel: "publish auth blocker",
            detail:
              "当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory。",
            workflowSummary: {
              workflow_id: "wf-gap",
              workflow_name: "Catalog Gap Workflow",
              binding_count: 2,
              draft_candidate_count: 1,
              published_blocker_count: 1,
              offline_inventory_count: 0,
              tool_governance: {
                referenced_tool_ids: ["native.catalog-gap"],
                missing_tool_ids: ["native.catalog-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              }
            }
          }
        }
      })
    );

    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
  });
});
