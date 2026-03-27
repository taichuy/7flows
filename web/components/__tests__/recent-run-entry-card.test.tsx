import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RecentRunEntryCard } from "@/components/recent-run-entry-card";
import type { RecentRunCheck } from "@/lib/get-system-overview";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildRun(overrides: Partial<RecentRunCheck> = {}): RecentRunCheck {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_name: "Run Workflow",
    workflow_version: "1.0.0",
    status: "failed",
    created_at: "2026-03-22T08:00:00Z",
    finished_at: null,
    event_count: 2,
    ...overrides
  };
}

describe("RecentRunEntryCard", () => {
  it("keeps shared governance handoff cards on scoped workflow links", () => {
    const html = renderToStaticMarkup(
      createElement(RecentRunEntryCard, {
        run: buildRun({
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          },
          legacy_auth_governance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
            binding: {
              workflow_id: "workflow-1",
              workflow_name: "Run Workflow"
            }
          })
        }),
        runHref: "/runs/run-1?track=author",
        runLinkLabel: "查看 run 诊断面板",
        workflowHref:
          "/workflows/workflow-1?track=author&definition_issue=legacy_publish_auth",
        workflowLinkLabel: "回到 workflow 编辑器"
      })
    );

    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain(
      "当前 run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。"
    );
    expect(html).toContain(
      '/workflows/workflow-1?track=author&amp;definition_issue=missing_tool'
    );
    expect(html).toContain(
      '/workflows/workflow-1?track=author&amp;definition_issue=legacy_publish_auth'
    );
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
  });

  it("upgrades the main workflow link to legacy auth even when the incoming scope is missing_tool", () => {
    const html = renderToStaticMarkup(
      createElement(RecentRunEntryCard, {
        run: buildRun({
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          },
          legacy_auth_governance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
            binding: {
              workflow_id: "workflow-1",
              workflow_name: "Run Workflow"
            }
          })
        }),
        runHref: "/runs/run-1?track=author",
        runLinkLabel: "查看 run 诊断面板",
        workflowHref: "/workflows/workflow-1?track=author&definition_issue=missing_tool",
        workflowLinkLabel: "回到 workflow 编辑器"
      })
    );

    expect(html).toContain(
      'href="/workflows/workflow-1?track=author&amp;definition_issue=missing_tool"'
    );
    expect(html).toContain(
      'href="/workflows/workflow-1?track=author&amp;definition_issue=legacy_publish_auth"'
    );
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
    expect(html).toContain(
      'href="/workflows/workflow-1?track=author&amp;definition_issue=legacy_publish_auth"'
    );
    expect(html).toContain('class="inline-link secondary"');
  });
});
