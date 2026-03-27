import React, { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishSelectedNextStepCard } from "@/components/workflow-publish-selected-next-step-card";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkflowPublishSelectedNextStepCard", () => {
  it("renders the shared workflow governance handoff when selected invocation carries one", () => {
    const html = renderToStaticMarkup(
      <WorkflowPublishSelectedNextStepCard
        surface={{
          title: "Selected invocation next step",
          invocationId: "invocation-1",
          label: "approval blocker",
          detail: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。",
          href: "/sensitive-access/inbox?run_id=run-selected-1",
          hrefLabel: "open blocker inbox slice",
          workflowGovernanceHandoff: {
            workflowId: "workflow-1",
            workflowGovernanceHref: "/workflows/workflow-1?definition_issue=missing_tool",
            workflowCatalogGapHref: "/workflows/workflow-1?definition_issue=missing_tool",
            workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
            workflowCatalogGapDetail:
              "当前 sampled run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 publish sampled snapshot。",
            legacyAuthHandoff: {
              bindingChipLabel: "legacy auth 1",
              statusChipLabel: "published blocker",
              detail: "当前仍有 published binding 使用 unsupported legacy auth mode。",
              workflowSummary: {
                workflow_id: "workflow-1",
                workflow_name: "Workflow 1",
                binding_count: 1,
                draft_candidate_count: 0,
                published_blocker_count: 1,
                offline_inventory_count: 0,
                tool_governance: {
                  referenced_tool_ids: [],
                  missing_tool_ids: [],
                  governed_tool_count: 0,
                  strong_isolation_tool_count: 0
                }
              }
            }
          }
        }}
      />
    );

    expect(html).toContain("Selected invocation next step");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("当前 sampled run 对应的 workflow 版本仍有 catalog gap");
    expect(html).toContain("当前仍有 published binding 使用 unsupported legacy auth mode。");
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
  });
});
