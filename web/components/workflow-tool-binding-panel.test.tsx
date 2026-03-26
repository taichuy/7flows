import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowToolBindingPanel } from "@/components/workflow-tool-binding-panel";
import type { WorkflowDetail, WorkflowListItem } from "@/lib/get-workflows";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/app/actions/workflow", () => ({
  updateWorkflowToolBinding: vi.fn()
}));

vi.mock("@/components/tool-governance-summary", () => ({
  ToolGovernanceSummary: () => createElement("div", { "data-component": "tool-governance-summary" })
}));

vi.mock("@/components/workflow-chip-link", () => ({
  WorkflowChipLink: ({ href }: { href?: string }) =>
    createElement("a", { href: href ?? "#", "data-component": "workflow-chip-link" })
}));

vi.mock("@/components/workflow-tool-binding-form", () => ({
  WorkflowToolBindingForm: ({ currentToolId }: { currentToolId?: string }) =>
    createElement("div", { "data-component": "workflow-tool-binding-form", "data-tool-id": currentToolId ?? "" })
}));

function buildWorkflowListItem(
  overrides: Partial<WorkflowListItem> = {}
): WorkflowListItem {
  return {
    id: "workflow-1",
    name: "Catalog gap workflow",
    version: "1.2.3",
    status: "draft",
    node_count: 2,
    definition_issues: [],
    tool_governance: {
      referenced_tool_ids: ["native.catalog-gap", "native.policy-gap"],
      missing_tool_ids: ["native.catalog-gap", "native.policy-gap"],
      governed_tool_count: 1,
      strong_isolation_tool_count: 0
    },
    legacy_auth_governance: null,
    ...overrides
  };
}

function buildWorkflowDetail(
  overrides: Partial<WorkflowDetail> = {}
): WorkflowDetail {
  return {
    ...buildWorkflowListItem(),
    created_at: "2026-03-25T08:00:00Z",
    updated_at: "2026-03-25T08:30:00Z",
    definition: {
      nodes: [
        {
          id: "node-tool-1",
          type: "tool",
          name: "Search tool",
          config: {
            toolId: "native.catalog-gap"
          }
        },
        {
          id: "node-agent-1",
          type: "llm_agent",
          name: "Assistant"
        }
      ],
      edges: []
    },
    versions: [
      {
        id: "version-1",
        workflow_id: "workflow-1",
        version: "1.2.3",
        created_at: "2026-03-25T08:30:00Z"
      }
    ],
    ...overrides
  };
}

describe("WorkflowToolBindingPanel", () => {
  it("surfaces workflow-level catalog gaps instead of only local binding counts", () => {
    const workflow = buildWorkflowDetail();
    const html = renderToStaticMarkup(
      <WorkflowToolBindingPanel workflows={[workflow]} selectedWorkflow={workflow} tools={[]} />
    );

    expect(html).toContain("catalog gap · native.catalog-gap、native.policy-gap");
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(html).toContain(
      "当前 workflow 仍有 catalog gap（native.catalog-gap、native.policy-gap）；其中 1 个已经直接暴露在当前 tool node binding（native.catalog-gap），其余缺口还要回 editor 继续排查其它 tool 引用。"
    );
    expect(html).toContain(
      "当前 binding 仍有 catalog gap（native.catalog-gap）。请先同步目录，或改绑到仍可用的工具定义。"
    );
    expect(html).not.toContain("当前绑定的工具已不在 catalog 里");
  });

  it("keeps catalog-gap follow-up visible when no tool node binding drift is present", () => {
    const workflow = buildWorkflowDetail({
      definition: {
        nodes: [
          {
            id: "node-agent-1",
            type: "llm_agent",
            name: "Assistant"
          }
        ],
        edges: []
      },
      tool_governance: {
        referenced_tool_ids: ["native.policy-gap"],
        missing_tool_ids: ["native.policy-gap"],
        governed_tool_count: 0,
        strong_isolation_tool_count: 0
      }
    });
    const html = renderToStaticMarkup(
      <WorkflowToolBindingPanel workflows={[workflow]} selectedWorkflow={workflow} tools={[]} />
    );

    expect(html).toContain("catalog gap · native.policy-gap");
    expect(html).toContain(
      "当前 workflow 仍有 catalog gap（native.policy-gap）；当前列表里暂时看不到直接失配的 tool 节点，先回 editor 排查 LLM Agent tool policy 或其它 tool 引用。"
    );
  });


  it("surfaces shared legacy publish auth handoff alongside catalog gap follow-up", () => {
    const workflow = buildWorkflowDetail({
      legacy_auth_governance: {
        binding_count: 2,
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 0
      }
    });
    const html = renderToStaticMarkup(
      <WorkflowToolBindingPanel workflows={[workflow]} selectedWorkflow={workflow} tools={[]} />
    );

    expect(html).toContain("publish auth blocker");
    expect(html).toContain("2 legacy bindings");
    expect(html).toContain("1 条 published blocker");
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(html).toContain('/workflows/workflow-1?definition_issue=legacy_publish_auth');
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
  });
});
