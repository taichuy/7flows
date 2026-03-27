import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStarterSourceDiff } from "@/lib/get-workspace-starters";

import { WorkspaceStarterSourceDiffPanel } from "../source-diff-panel";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterSourceDiffPanel", () => {
  it("renders the shared source diff surface for operator review", () => {
    const sourceDiff: WorkspaceStarterSourceDiff = {
      template_id: "starter-a",
      workspace_id: "default",
      source_workflow_id: "wf-a",
      source_workflow_name: "Sandbox authoring",
      template_version: "0.1.0",
      source_version: "0.2.0",
      template_default_workflow_name: "Sandbox authoring",
      source_default_workflow_name: "Sandbox authoring",
      workflow_name_changed: false,
      changed: true,
      rebase_fields: ["definition", "created_from_workflow_version"],
      node_summary: {
        template_count: 1,
        source_count: 2,
        added_count: 1,
        removed_count: 0,
        changed_count: 0
      },
      edge_summary: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 0
      },
      sandbox_dependency_summary: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 1
      },
      action_decision: {
        recommended_action: "refresh",
        status_label: "建议 refresh",
        summary:
          "当前主要是 sandbox 依赖治理漂移。优先 refresh 同步最新 definition / version，并重点复核 dependencyMode、builtinPackageSet、dependencyRef 与 backendExtensions。",
        can_refresh: true,
        can_rebase: true,
        fact_chips: ["source 0.2.0", "sandbox drift 1", "rebase 2"]
      },
      node_entries: [
        {
          id: "node-sandbox",
          label: "Sandbox node",
          status: "added",
          changed_fields: ["config.timeout"],
          template_facts: [],
          source_facts: ["sandbox_code", "explicit execution"]
        }
      ],
      edge_entries: [],
      sandbox_dependency_entries: [
        {
          id: "sandbox-node",
          label: "sandbox_code",
          status: "changed",
          changed_fields: ["dependencyMode", "builtinPackageSet"],
          template_facts: ["host execution"],
          source_facts: ["strong isolation"]
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceDiffPanel, {
        selectedTemplate: null,
        sourceDiff,
        isLoading: false,
        isRebasing: false,
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("Source drift detail");
    expect(html).toContain("Node changes");
    expect(html).toContain("Sandbox drift");
    expect(html).toContain("Suggested rebase fields");
    expect(html).toContain("建议 refresh");
    expect(html).toContain("definition");
    expect(html).toContain("created_from_workflow_version");
    expect(html).toContain("template 1 / source 2");
    expect(html).toContain("+1 / -0 / ~0");
    expect(html).toContain("Sandbox node");
    expect(html).toContain("config.timeout");
    expect(html).toContain("Added");
    expect(html).toContain("Changed");
    expect(html).toContain("Template snapshot");
    expect(html).toContain("Source workflow");
    expect(html).toContain("explicit execution");
    expect(html).toContain("dependencyMode");
    expect(html).toContain("strong isolation");
    expect(html).not.toContain("template facts");
    expect(html).not.toContain("source facts");
    expect(html).not.toContain("当前模板没有可用的 source diff");
  });

  it("keeps a shared follow-up visible when the selected starter has no diff snapshot", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceDiffPanel, {
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
        sourceDiff: null,
        isLoading: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?starter=starter-missing-source",
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("当前模板没有可用的 source diff。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("当前 starter 还没有 source diff 快照。");
    expect(html).toContain("确认模板后带此 starter 回到创建页");
    expect(html).toContain(
      "Primary governed starter: Missing Source Starter · 来源缺失 · source workflow-missing."
    );
    expect(html).toContain('/workflows/new?starter=starter-missing-source');
  });

  it("prioritizes catalog gap follow-up when the selected starter has no diff snapshot", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceDiffPanel, {
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
        sourceDiff: null,
        isLoading: false,
        isRebasing: false,
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
        },
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("当前模板没有可用的 source diff。");
    expect(html).toContain("catalog gap");
    expect(html).toContain(
      "Primary governed starter: Missing Tool Starter · catalog gap · native.missing · publish auth blocker · source 0.2.0."
    );
    expect(html).toContain(
      "当前 starter 仍有 catalog gap（native.missing）；先回源 workflow 补齐 binding，再回来继续复用或创建。"
    );
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain(
      "当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory。"
    );
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
    expect(html).toContain("打开源 workflow");
    expect(html).toContain("definition_issue=missing_tool");
    expect(html).not.toContain("带此 starter 回到创建页");
  });
});
