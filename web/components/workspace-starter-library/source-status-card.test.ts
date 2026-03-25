import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";

import { WorkspaceStarterSourceCard } from "./source-status-card";

Object.assign(globalThis, { React });

describe("WorkspaceStarterSourceCard", () => {
  it("renders shared source governance follow-up without waiting for source workflow fetch", () => {
    const template: WorkspaceStarterTemplateItem = {
      id: "starter-1",
      workspace_id: "default",
      name: "Governed Workspace Starter",
      description: "Starter with shared source governance.",
      business_track: "应用新建编排",
      default_workflow_name: "Governed Workflow",
      workflow_focus: "Keep governance aligned.",
      recommended_next_step: "Review the follow-up before refreshing.",
      tags: ["workspace starter"],
      definition: {
        nodes: [
          { id: "trigger", type: "trigger", name: "Trigger", config: {} },
          { id: "output", type: "output", name: "Output", config: {} }
        ],
        edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "output" }],
        variables: [],
        publish: []
      },
      created_from_workflow_id: "wf-demo",
      created_from_workflow_version: "0.1.0",
      archived: false,
      archived_at: null,
      created_at: "2026-03-21T12:00:00Z",
      updated_at: "2026-03-21T12:30:00Z",
      source_governance: {
        kind: "drifted",
        status_label: "建议 refresh",
        summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。",
        source_workflow_id: "wf-demo",
        source_workflow_name: "Demo Workflow",
        template_version: "0.1.0",
        source_version: "0.2.0",
        action_decision: {
          recommended_action: "refresh",
          status_label: "建议 refresh",
          summary: "优先 refresh 同步最新 definition / version。",
          can_refresh: true,
          can_rebase: true,
          fact_chips: ["template 0.1.0", "source 0.2.0"]
        },
        outcome_explanation: {
          primary_signal: "来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。",
          follow_up: "优先 refresh 同步最新 definition / version。"
        }
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceCard, {
        template,
        sourceGovernance: template.source_governance ?? null,
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?starter=starter-1",
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("建议 refresh");
    expect(html).toContain("来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。");
    expect(html).toContain("优先 refresh 同步最新 definition / version。");
    expect(html).toContain("template 0.1.0");
    expect(html).toContain("source 0.2.0");
    expect(html).toContain("Demo Workflow");
    expect(html).toContain("Review the follow-up before refreshing.");
    expect(html).toContain("Governance</span><strong>建议 refresh");
    expect(html).toContain("Next step</span><strong>建议 refresh");
    expect(html).toContain(
      "Primary governed starter: Governed Workspace Starter · 建议 refresh · source 0.2.0."
    );
    expect(html).not.toContain("Governance kind");
    expect(html).not.toContain("带此 starter 回到创建页");
    expect(html).toContain("从源 workflow 刷新快照");
    expect(html).toContain("执行 rebase");
  });

  it("replaces disabled source actions with a stable create entry when source is missing", () => {
    const template: WorkspaceStarterTemplateItem = {
      id: "starter-missing-source",
      workspace_id: "default",
      name: "Missing source starter",
      description: "Starter with a deleted source workflow.",
      business_track: "应用新建编排",
      default_workflow_name: "Missing Source Workflow",
      workflow_focus: "Keep authoring unblocked.",
      recommended_next_step: "Confirm the template is still reusable.",
      tags: ["workspace starter"],
      definition: {
        nodes: [
          { id: "trigger", type: "trigger", name: "Trigger", config: {} },
          { id: "output", type: "output", name: "Output", config: {} }
        ],
        edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "output" }],
        variables: [],
        publish: []
      },
      created_from_workflow_id: "wf-missing",
      created_from_workflow_version: "0.4.0",
      archived: false,
      archived_at: null,
      created_at: "2026-03-21T12:00:00Z",
      updated_at: "2026-03-21T12:30:00Z",
      source_governance: {
        kind: "missing_source",
        status_label: "来源缺失",
        summary: "记录中的来源 workflow 已不存在或当前不可访问。",
        source_workflow_id: "wf-missing",
        source_workflow_name: null,
        template_version: "0.4.0",
        source_version: null,
        action_decision: null,
        outcome_explanation: {
          primary_signal: "当前 starter 记录的来源 workflow 已不可用。",
          follow_up: "先在当前库里确认模板仍可复用，再从创建页继续创建。"
        }
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceCard, {
        template,
        sourceGovernance: template.source_governance ?? null,
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?starter=starter-missing-source",
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("来源缺失");
    expect(html).toContain("当前 starter 记录的来源 workflow 已不可用。");
    expect(html).toContain("确认模板后带此 starter 回到创建页");
    expect(html).toContain("Next step</span><strong>确认模板后带此 starter 回到创建页");
    expect(html).toContain(
      "Primary governed starter: Missing source starter · 来源缺失 · source wf-missing."
    );
    expect(html).toContain('/workflows/new?starter=starter-missing-source');
    expect(html).not.toContain("从源 workflow 刷新快照");
    expect(html).not.toContain("执行 rebase");
  });

  it("prioritizes catalog gap follow-up over create-entry guidance when the starter still misses tools", () => {
    const template: WorkspaceStarterTemplateItem = {
      id: "starter-missing-tool",
      workspace_id: "default",
      name: "Missing Tool Starter",
      description: "Starter with a missing catalog tool.",
      business_track: "应用新建编排",
      default_workflow_name: "Missing Tool Workflow",
      workflow_focus: "Fail closed on missing catalog tools.",
      recommended_next_step: "Return to create flow after restoring the missing tool.",
      tags: ["workspace starter"],
      definition: {
        nodes: [
          { id: "trigger", type: "trigger", name: "Trigger", config: {} },
          { id: "output", type: "output", name: "Output", config: {} }
        ],
        edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "output" }],
        variables: [],
        publish: []
      },
      created_from_workflow_id: "wf-missing-tool",
      created_from_workflow_version: "0.4.0",
      archived: false,
      archived_at: null,
      created_at: "2026-03-21T12:00:00Z",
      updated_at: "2026-03-21T12:30:00Z",
      source_governance: {
        kind: "missing_source",
        status_label: "来源缺失",
        summary: "记录中的来源 workflow 已不存在或当前不可访问。",
        source_workflow_id: "wf-missing-tool",
        source_workflow_name: "Source Workflow",
        template_version: "0.4.0",
        source_version: null,
        action_decision: null,
        outcome_explanation: {
          primary_signal: "当前 starter 记录的来源 workflow 已不可用。",
          follow_up: "先在当前库里确认模板仍可复用，再从创建页继续创建。"
        }
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceCard, {
        template,
        sourceGovernance: template.source_governance ?? null,
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?starter=starter-missing-tool",
        selectedTemplateToolGovernance: {
          referencedToolIds: ["native.missing"],
          referencedTools: [],
          governedToolCount: 0,
          strongIsolationToolCount: 0,
          missingToolIds: ["native.missing"]
        },
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "all",
          needsFollowUp: true,
          searchQuery: "missing",
          selectedTemplateId: "starter-missing-tool"
        },
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("来源缺失");
    expect(html).toContain("当前 starter 记录的来源 workflow 已不可用。");
    expect(html).toContain("catalog gap");
    expect(html).toContain("Next step</span><strong>catalog gap");
    expect(html).toContain(
      "Primary governed starter: Missing Tool Starter · catalog gap · native.missing · source 0.4.0."
    );
    expect(html).toContain(
      "当前 starter 仍引用目录里不存在的 tool：native.missing；先回源 workflow 补齐 tool binding，再回来继续复用或创建。"
    );
    expect(html).toContain("打开源 workflow");
    expect(html).toContain("definition_issue=missing_tool");
    expect(html).not.toContain("确认模板后带此 starter 回到创建页");
    expect(html).not.toContain("先在当前库里确认模板仍可复用，再从创建页继续创建。");
    expect(html).not.toContain("/workflows/new?starter=starter-missing-tool");
    expect(html).not.toContain("从源 workflow 刷新快照");
    expect(html).not.toContain("执行 rebase");
  });

  it("surfaces an honest governance gap when the selected starter still lacks source governance payload", () => {
    const template: WorkspaceStarterTemplateItem = {
      id: "starter-governance-gap",
      workspace_id: "default",
      name: "Gap starter",
      description: "Starter with missing governance payload.",
      business_track: "应用新建编排",
      default_workflow_name: "Gap Workflow",
      workflow_focus: "Expose governance gaps honestly.",
      recommended_next_step: "Wait for the backend governance surface to recover.",
      tags: ["workspace starter"],
      definition: {
        nodes: [
          { id: "trigger", type: "trigger", name: "Trigger", config: {} },
          { id: "output", type: "output", name: "Output", config: {} }
        ],
        edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "output" }],
        variables: [],
        publish: []
      },
      created_from_workflow_id: "wf-gap",
      created_from_workflow_version: "0.5.0",
      archived: false,
      archived_at: null,
      created_at: "2026-03-21T12:00:00Z",
      updated_at: "2026-03-21T12:30:00Z"
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceCard, {
        template,
        sourceGovernance: null,
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?starter=starter-governance-gap",
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("治理缺口");
    expect(html).toContain("当前 starter 已绑定来源 workflow，但列表缺少统一来源治理摘要。");
    expect(html).toContain("wf-gap");
    expect(html).toContain("缺少 diff");
    expect(html).toContain("Governance</span><strong>治理缺口");
    expect(html).toContain("Next step</span><strong>治理缺口");
    expect(html).not.toContain("Governance kind");
    expect(html).not.toContain("从源 workflow 刷新快照");
    expect(html).not.toContain("执行 rebase");
  });
});
