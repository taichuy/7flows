import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowLibraryMissingToolGovernanceCard } from "@/components/workflow-library-missing-tool-governance-card";
import type { WorkflowListItem } from "@/lib/get-workflows";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildWorkflow(
  overrides: Partial<WorkflowListItem> = {},
): WorkflowListItem {
  return {
    id: "workflow-1",
    name: "Alpha workflow",
    version: "1.0.0",
    status: "draft",
    node_count: 4,
    definition_issues: [],
    tool_governance: {
      referenced_tool_ids: ["native.catalog-gap"],
      missing_tool_ids: ["native.catalog-gap"],
      governed_tool_count: 1,
      strong_isolation_tool_count: 0,
    },
    ...overrides,
  };
}

describe("WorkflowLibraryMissingToolGovernanceCard", () => {
  it("renders a primary catalog-gap handoff and scoped workflow links", () => {
    const html = renderToStaticMarkup(
      <WorkflowLibraryMissingToolGovernanceCard
        workflows={[
          buildWorkflow(),
          buildWorkflow({
            id: "workflow-2",
            name: "Beta workflow",
            version: "2.0.0",
            status: "published",
            tool_governance: {
              referenced_tool_ids: ["native.catalog-gap", "native.second-gap"],
              missing_tool_ids: ["native.catalog-gap", "native.second-gap"],
              governed_tool_count: 2,
              strong_isolation_tool_count: 1,
            },
          }),
        ]}
        workflowDetailHrefsById={{
          "workflow-1": "/workflows/workflow-1?definition_issue=missing_tool",
          "workflow-2": "/workflows/workflow-2?definition_issue=missing_tool",
        }}
        workflowLibraryFilterHref="/workflows?definition_issue=missing_tool"
      />,
    );

    expect(html).toContain("跨 workflow catalog gap handoff");
    expect(html).toContain("Affected workflows");
    expect(html).toContain("Missing bindings");
    expect(html).toContain("Catalog gaps");
    expect(html).toContain(
      "当前 workflow 仍引用目录里不存在的 tool：native.catalog-gap；先回 editor 补齐 binding，再继续排查剩余 1 个 workflow。"
    );
    expect(html).toContain(
      "2.0.0 · published · 4 nodes · 2 governed tools。 当前仍缺少 2 个 catalog tool binding：native.catalog-gap、native.second-gap。"
    );
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(html).toContain('/workflows/workflow-2?definition_issue=missing_tool');
    expect(html).toContain('/workflows?definition_issue=missing_tool');
  });

  it("returns no markup when the workflow range has no missing-tool blockers", () => {
    const html = renderToStaticMarkup(
      <WorkflowLibraryMissingToolGovernanceCard
        workflows={[
          buildWorkflow({
            tool_governance: {
              referenced_tool_ids: ["native.available"],
              missing_tool_ids: [],
              governed_tool_count: 1,
              strong_isolation_tool_count: 0,
            },
          }),
        ]}
        workflowDetailHrefsById={{}}
        workflowLibraryFilterHref="/workflows?definition_issue=missing_tool"
      />,
    );

    expect(html).toBe("");
  });
});
