import React, { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SensitiveAccessLegacyAuthGovernanceCompactCard } from "@/components/sensitive-access-legacy-auth-governance-card";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("SensitiveAccessLegacyAuthGovernanceCompactCard", () => {
  it("reuses shared workflow governance handoff for each affected workflow", () => {
    const snapshot = buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
      binding: {
        workflow_id: "wf-demo",
        workflow_name: "Demo Workflow"
      }
    });
    snapshot.workflows[0] = {
      ...snapshot.workflows[0],
      workflow_id: "wf-demo",
      workflow_name: "Demo Workflow",
      tool_governance: {
        referenced_tool_ids: ["native.catalog-gap"],
        missing_tool_ids: ["native.catalog-gap"],
        governed_tool_count: 0,
        strong_isolation_tool_count: 0
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessLegacyAuthGovernanceCompactCard, {
        snapshot
      })
    );

    expect(html).toContain("Demo Workflow");
    expect(html).toContain("Workflow governance");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "当前 Demo Workflow 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再继续沿当前 sensitive-access workflow handoff 收口。"
    );
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain('href="/workflows/wf-demo?definition_issue=missing_tool"');
    expect(html).toContain('href="/workflows/wf-demo?definition_issue=legacy_publish_auth"');
  });

  it("can suppress shared workflow governance cards when the parent already rendered them", () => {
    const snapshot = buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
      binding: {
        workflow_id: "wf-demo",
        workflow_name: "Demo Workflow"
      }
    });

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessLegacyAuthGovernanceCompactCard, {
        snapshot,
        showSharedWorkflowGovernanceCards: false
      })
    );

    expect(html).toContain("Demo Workflow");
    expect(html).not.toContain("Workflow governance");
    expect(html).not.toContain("Legacy publish auth handoff");
    expect(html).not.toContain("回到 workflow 编辑器处理 publish auth contract");
  });
});
