import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkspaceStarterHistoryItem } from "@/lib/get-workspace-starters";

import { WorkspaceStarterHistoryPanel } from "./history-panel";

describe("WorkspaceStarterHistoryPanel", () => {
  it("renders structured sandbox drift facts before raw payload", () => {
    const historyItems: WorkspaceStarterHistoryItem[] = [
      {
        id: "history-1",
        template_id: "starter-sandbox",
        workspace_id: "default",
        action: "rebased",
        summary: "批量从源 workflow 同步了 rebase 所需字段。",
        created_at: "2026-03-21T11:30:00Z",
        payload: {
          bulk: true,
          source_workflow_id: "wf-demo",
          previous_workflow_version: "0.1.4",
          source_workflow_version: "0.1.6",
          changed: true,
          rebase_fields: ["definition", "default_workflow_name"],
          node_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          edge_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 0
          },
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox"]
        }
      }
    ];

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterHistoryPanel, {
        historyItems,
        isLoading: false
      })
    );

    expect(html).toContain("批量");
    expect(html).toContain("source 0.1.6");
    expect(html).toContain("sandbox drift 1");
    expect(html).toContain("Source:");
    expect(html).toContain("版本从 0.1.4 对齐到 0.1.6");
    expect(html).toContain("Sandbox drift:");
    expect(html).toContain("涉及节点：sandbox");
    expect(html).toContain("Structure drift:");
    expect(html).toContain("Rebase fields:");
    expect(html).toContain("查看原始 payload");
  });
});
