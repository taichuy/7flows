import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStarterHistoryItem } from "@/lib/get-workspace-starters";

import { WorkspaceStarterHistoryPanel } from "./history-panel";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterHistoryPanel", () => {
  it("renders structured sandbox drift facts with a structured payload snapshot", () => {
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
          action_decision: {
            recommended_action: "rebase",
            status_label: "建议 rebase",
            summary:
              "当前 drift 同时影响 starter 快照、sandbox 依赖治理和默认 workflow 名称。若希望模板命名与来源一起对齐，优先执行 rebase；如果只想先同步 definition / version 并保留当前模板名称，可先 refresh。",
            can_refresh: true,
            can_rebase: true,
            fact_chips: [
              "template 0.1.4",
              "source 0.1.6",
              "structure drift 1",
              "sandbox drift 1",
              "name drift",
              "rebase 2"
            ]
          },
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
        selectedTemplate: null,
        historyItems,
        isLoading: false
      })
    );

    expect(html).toContain("批量");
    expect(html).toContain("source 0.1.6");
    expect(html).toContain("建议 rebase");
    expect(html).toContain("sandbox drift 1");
    expect(html).toContain("Source:");
    expect(html).toContain("版本从 0.1.4 对齐到 0.1.6");
    expect(html).toContain("Decision:");
    expect(html).toContain("Sandbox drift:");
    expect(html).toContain("涉及节点：sandbox");
    expect(html).toContain("Structure drift:");
    expect(html).toContain("Rebase fields:");
    expect(html).toContain("查看结构化 payload");
    expect(html).toContain("Scope flag:");
    expect(html).toContain("Change flag:");
    expect(html).toContain("Node summary:");
    expect(html).toContain("Sandbox summary:");
    expect(html).toContain("Rebase payload:");
    expect(html).not.toContain("查看原始 payload");
    expect(html).not.toContain("action_decision");
    expect(html).not.toContain("can_refresh");
  });

  it("shows a shared starter follow-up when the selected starter has no history yet", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterHistoryPanel, {
        selectedTemplate: {
          id: "starter-missing-source",
          workspace_id: "default",
          name: "Missing Source Starter",
          description: "Starter description",
          business_track: "应用新建编排",
          default_workflow_name: "Governed workflow",
          workflow_focus: "Keep source governance visible.",
          recommended_next_step: "Return to create flow after reviewing metadata.",
          tags: ["workspace starter"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          created_from_workflow_id: "workflow-missing",
          archived: false,
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z",
          source_governance: {
            kind: "missing_source",
            status_label: "来源缺失",
            summary: "原始来源 workflow 已不可访问。",
            source_workflow_id: "workflow-missing",
            source_workflow_name: null,
            template_version: "0.1.0",
            source_version: null,
            action_decision: null,
            outcome_explanation: {
              primary_signal: "原始来源 workflow 已不可访问。",
              follow_up: "确认模板后再回到创建页继续创建。"
            }
          }
        },
        historyItems: [],
        isLoading: false,
        createWorkflowHref: "/workflows/new?starter=starter-missing-source"
      })
    );

    expect(html).toContain("当前模板还没有治理历史记录。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("确认模板后带此 starter 回到创建页");
    expect(html).toContain(
      "Primary governed starter: Missing Source Starter · 来源缺失 · source workflow-missing."
    );
    expect(html).toContain('/workflows/new?starter=starter-missing-source');
  });

  it("prioritizes catalog gap follow-up when history is still empty", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterHistoryPanel, {
        selectedTemplate: {
          id: "starter-missing-tool",
          workspace_id: "default",
          name: "Missing Tool Starter",
          description: "Starter description",
          business_track: "应用新建编排",
          default_workflow_name: "Governed workflow",
          workflow_focus: "Keep tool governance visible.",
          recommended_next_step: "Return to create flow after restoring the missing tool.",
          tags: ["workspace starter"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          created_from_workflow_id: "workflow-source",
          created_from_workflow_version: "0.2.0",
          archived: false,
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z",
          source_governance: {
            kind: "synced",
            status_label: "已对齐",
            summary: "当前 starter 与来源 workflow 已对齐。",
            source_workflow_id: "workflow-source",
            source_workflow_name: "Source Workflow",
            template_version: "0.2.0",
            source_version: "0.2.0",
            action_decision: null,
            outcome_explanation: null
          }
        },
        historyItems: [],
        isLoading: false,
        createWorkflowHref: "/workflows/new?starter=starter-missing-tool",
        selectedTemplateToolGovernance: {
          referencedToolIds: ["native.missing"],
          referencedTools: [],
          governedToolCount: 0,
          strongIsolationToolCount: 0,
          missingToolIds: ["native.missing"]
        },
        sourceWorkflowSummariesById: {
          "workflow-source": {
            id: "workflow-source",
            name: "Source Workflow",
            version: "0.2.0",
            status: "draft",
            node_count: 1,
            definition_issues: [],
            tool_governance: {
              referenced_tool_ids: ["native.missing"],
              missing_tool_ids: ["native.missing"],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            },
            legacy_auth_governance: {
              binding_count: 2,
              draft_candidate_count: 1,
              published_blocker_count: 1,
              offline_inventory_count: 0
            }
          }
        },
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "all",
          needsFollowUp: true,
          searchQuery: "missing",
          selectedTemplateId: "starter-missing-tool"
        }
      })
    );

    expect(html).toContain("当前模板还没有治理历史记录。");
    expect(html).toContain("catalog gap");
    expect(html).toContain(
      "Primary governed starter: Missing Tool Starter · catalog gap · native.missing · publish auth blocker · source 0.2.0."
    );
    expect(html).toContain(
      "当前 starter 仍有 catalog gap（native.missing）；来源 workflow 还保留 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory 的 publish auth blocker，先回源 workflow 统一收口 catalog gap / publish auth contract，再回来继续复用或创建。"
    );
    expect(html).toContain("打开源 workflow");
    expect(html).toContain("definition_issue=missing_tool");
    expect(html).not.toContain("带此 starter 回到创建页");
  });
});
