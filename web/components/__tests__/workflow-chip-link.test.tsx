import React, { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowChipLink } from "@/components/workflow-chip-link";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkflowChipLink", () => {
  it("surfaces concrete catalog gaps instead of only showing missing-tool counts", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowChipLink, {
        href: "/workflows/workflow-gap",
        workflow: {
          id: "workflow-gap",
          name: "Catalog Gap Workflow",
          status: "draft",
          version: "0.4.0",
          node_count: 3,
          definition_issues: [],
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap", "native.second-gap", "native.third-gap"],
            missing_tool_ids: [
              " native.catalog-gap ",
              "native.second-gap",
              "native.catalog-gap",
              "native.third-gap"
            ],
            governed_tool_count: 2,
            strong_isolation_tool_count: 1
          }
        }
      })
    );

    expect(html).toContain('href="/workflows/workflow-gap"');
    expect(html).toContain("catalog gap · native.catalog-gap、native.second-gap 等 3 个 tool");
    expect(html).toContain("catalog gap");
    expect(html).not.toContain("missing catalog tools");
    expect(html).not.toContain("missing tools");
  });

  it("keeps legacy auth cleanup visible alongside catalog gap facts", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowChipLink, {
        href: "/workflows/workflow-auth",
        workflow: {
          id: "workflow-auth",
          name: "Publish Auth Workflow",
          status: "draft",
          version: "0.5.0",
          node_count: 2,
          definition_issues: [],
          legacy_auth_governance: {
            binding_count: 2,
            draft_candidate_count: 0,
            published_blocker_count: 1,
            offline_inventory_count: 1
          },
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 1,
            strong_isolation_tool_count: 0
          }
        }
      })
    );

    expect(html).toContain("2 legacy auth cleanup items");
    expect(html).toContain("2 legacy bindings");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "当前 workflow 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；打开当前 workflow 即可继续补齐 binding / LLM Agent tool policy，并沿同一份治理 handoff 收口。"
    );
    expect(html).toContain(
      "当前 workflow 仍有 0 条 draft cleanup、1 条 published blocker、1 条 offline inventory。"
    );
  });

  it("shows deduplicated legacy auth cleanup backlog on workflow chips", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowChipLink, {
        href: "/workflows/workflow-auth-mixed",
        workflow: {
          id: "workflow-auth-mixed",
          name: "Mixed Auth Workflow",
          status: "draft",
          version: "0.6.0",
          node_count: 2,
          definition_issues: [
            {
              category: "publish_draft",
              message: "Public Search 当前不能使用 authMode = token。",
              path: "publish.0.authMode",
              field: "authMode"
            }
          ],
          legacy_auth_governance: {
            binding_count: 2,
            draft_candidate_count: 1,
            published_blocker_count: 1,
            offline_inventory_count: 0
          },
          tool_governance: {
            referenced_tool_ids: [],
            missing_tool_ids: [],
            governed_tool_count: 1,
            strong_isolation_tool_count: 0
          }
        }
      })
    );

    expect(html).toContain("2 legacy auth cleanup items");
    expect(html).toContain("publish auth blocker");
  });

  it("reuses shared legacy-auth handoff even when the chip only has workflow summary facts", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowChipLink, {
        href: "/workflows/workflow-summary?starter=starter-openclaw",
        workflow: {
          id: "workflow-summary",
          name: "Summary workflow",
          status: "draft",
          version: "0.7.0",
          node_count: 2,
          definition_issues: [],
          legacy_auth_governance: {
            binding_count: 2,
            draft_candidate_count: 1,
            published_blocker_count: 1,
            offline_inventory_count: 0
          },
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 1,
            strong_isolation_tool_count: 0
          }
        }
      })
    );

    expect(html).toContain('href="/workflows/workflow-summary?starter=starter-openclaw"');
    expect(html).toContain("2 legacy bindings");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain(
      "当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory。"
    );
  });

  it("renders aria-current instead of a self link when the chip already targets the current page", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowChipLink, {
        href: "/workflows/workflow-summary?starter=starter-openclaw&definition_issue=missing_tool",
        currentHref:
          "/workflows/workflow-summary?definition_issue=missing_tool&starter=starter-openclaw",
        workflow: {
          id: "workflow-summary",
          name: "Summary workflow",
          status: "draft",
          version: "0.7.0",
          node_count: 2,
          definition_issues: [],
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 1,
            strong_isolation_tool_count: 0
          }
        },
        selected: true
      })
    );

    expect(html).toContain('aria-current="page"');
    expect(html).toContain('class="workflow-chip selected"');
    expect(html).not.toContain('<a href="/workflows/workflow-summary?starter=starter-openclaw&amp;definition_issue=missing_tool"');
  });
});
