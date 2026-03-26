import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorSidebar } from "@/components/workflow-editor-workbench/workflow-editor-sidebar";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: false,
        backend_ids: [],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason:
          "No sandbox backend is currently enabled. Strong-isolation execution must fail closed until a compatible backend is configured."
      }
    ],
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false,
    affected_run_count: 4,
    affected_workflow_count: 1,
    primary_blocker_kind: "execution_class_blocked",
    recommended_action: {
      kind: "workflow library",
      entry_key: "workflowLibrary",
      href: "/workflows?execution=sandbox",
      label: "Open workflow library"
    }
  };
}

function buildSavedWorkspaceStarter(): WorkspaceStarterTemplateItem {
  return {
    id: "workspace-starter-1",
    workspace_id: "default",
    name: "Starter A",
    description: "Governed starter",
    business_track: "应用新建编排",
    default_workflow_name: "Demo workflow",
    workflow_focus: "复用当前 workflow 草稿",
    recommended_next_step: "带此 starter 回到创建页继续创建 workflow。",
    tags: ["workspace starter"],
    definition: {
      nodes: [],
      edges: [],
      variables: [],
      publish: []
    },
    created_from_workflow_id: "workflow-1",
    created_from_workflow_version: "0.1.0",
    archived: false,
    created_at: "2026-03-25T07:30:00Z",
    updated_at: "2026-03-25T07:30:00Z",
    source_governance: {
      kind: "synced",
      status_label: "已对齐",
      summary: "当前 starter 与来源 workflow 已对齐。",
      source_workflow_id: "workflow-1",
      source_workflow_name: "Demo workflow",
      template_version: "0.1.0",
      source_version: "0.1.0",
      action_decision: {
        recommended_action: "none",
        status_label: "已对齐",
        summary: "带此 starter 回到创建页继续创建 workflow，并保留当前模板上下文。",
        can_refresh: false,
        can_rebase: false,
        fact_chips: ["source 0.1.0"]
      },
      outcome_explanation: {
        follow_up: "带此 starter 回到创建页继续创建 workflow，并保留当前模板上下文。"
      }
    }
  };
}

describe("WorkflowEditorSidebar", () => {
  it("reuses shared workflow detail hrefs in canvas overview chips", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [
          {
            id: "  workflow alpha/beta  ",
            name: "Governed workflow",
            status: "draft",
            version: "0.1.0",
            node_count: 1,
            tool_governance: {
              referenced_tool_ids: ["native.catalog-gap"],
              missing_tool_ids: ["native.catalog-gap"],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            }
          }
        ],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [],
        plannedNodeLibrary: [],
        unsupportedNodes: [],
        message: null,
        messageTone: "idle",
        persistBlockerSummary: null,
        persistBlockers: [],
        executionPreflightMessage: null,
        toolExecutionValidationIssueCount: 0,
        validationNavigatorItems: [],
        runs: [],
        selectedRunId: null,
        run: null,
        runSnapshot: null,
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "workspace-starter-1"
        },
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onWorkflowNameChange: () => undefined,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain(
      'href="/workflows/workflow%20alpha%2Fbeta?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool"'
    );
  });

  it("prioritizes legacy publish auth scope on workflow chips when publish auth backlog still exists", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [
          {
            id: "workflow alpha/beta",
            name: "Governed workflow",
            status: "draft",
            version: "0.1.0",
            node_count: 1,
            tool_governance: {
              referenced_tool_ids: ["native.catalog-gap"],
              missing_tool_ids: ["native.catalog-gap"],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            },
            legacy_auth_governance: {
              binding_count: 1,
              draft_candidate_count: 0,
              published_blocker_count: 1,
              offline_inventory_count: 0
            }
          }
        ],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [],
        plannedNodeLibrary: [],
        unsupportedNodes: [],
        message: null,
        messageTone: "idle",
        persistBlockerSummary: null,
        persistBlockers: [],
        executionPreflightMessage: null,
        toolExecutionValidationIssueCount: 0,
        validationNavigatorItems: [],
        runs: [],
        selectedRunId: null,
        run: null,
        runSnapshot: null,
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "workspace-starter-1"
        },
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onWorkflowNameChange: () => undefined,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain(
      'href="/workflows/workflow%20alpha%2Fbeta?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=legacy_publish_auth"'
    );
  });

  it("shows execution preflight readiness before save when strong isolation is blocked", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [],
        plannedNodeLibrary: [],
        unsupportedNodes: [],
        message: null,
        messageTone: "idle",
        persistBlockerSummary:
          "当前保存会被 2 类问题阻断：Execution capability / Publish draft。",
        persistBlockers: [
          {
            id: "tool_execution",
            label: "Execution capability",
            detail: "当前 workflow definition 还有 execution capability 待修正问题。",
            nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
          },
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "当前 workflow definition 还有 publish draft 待修正问题。",
            nextStep: "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
          }
        ],
        executionPreflightMessage:
          "保存前还有 2 个 execution capability 问题；先对齐 tool binding、tool 节点 runtimePolicy / LLM Agent tool policy，以及 live sandbox readiness。",
        toolExecutionValidationIssueCount: 2,
        validationNavigatorItems: [],
        runs: [],
        selectedRunId: null,
        run: null,
        runSnapshot: null,
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onWorkflowNameChange: () => undefined,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("Execution preflight");
    expect(html).toContain("Save gate");
    expect(html).toContain("当前保存会被 2 类问题阻断");
    expect(html).toContain("保存前还有 2 个 execution capability 问题");
    expect(html).toContain("sandbox backend");
    expect(html).toContain("fail-closed");
    expect(html).toContain("blocked sandbox");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("Open workflow library");
    expect(html.match(/Recommended next step/g)).toHaveLength(1);
  });

  it("hides duplicate save gate next-step when hero already projects the canonical CTA", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [],
        plannedNodeLibrary: [],
        unsupportedNodes: [],
        message: null,
        messageTone: "idle",
        persistBlockerSummary:
          "当前保存会被 2 类问题阻断：Execution capability / Publish draft。",
        persistBlockers: [
          {
            id: "tool_execution",
            label: "Execution capability",
            detail: "当前 workflow definition 还有 execution capability 待修正问题。",
            nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
          },
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "当前 workflow definition 还有 publish draft 待修正问题。",
            nextStep: "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
          }
        ],
        persistBlockerRecommendedNextStep: {
          label: "sandbox readiness",
          detail:
            "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。",
          href: "/workflows?execution=sandbox",
          href_label: "Open workflow library"
        },
        executionPreflightMessage:
          "保存前还有 2 个 execution capability 问题；先对齐 tool binding、tool 节点 runtimePolicy / LLM Agent tool policy，以及 live sandbox readiness。",
        toolExecutionValidationIssueCount: 2,
        validationNavigatorItems: [],
        runs: [],
        selectedRunId: null,
        run: null,
        runSnapshot: null,
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onWorkflowNameChange: () => undefined,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("Save gate");
    expect(html).toContain("当前保存会被 2 类问题阻断");
    expect(html).not.toContain("Recommended next step");
    expect(html).not.toContain("Open workflow library");
  });

  it("shows shared starter save follow-up links after saving a workspace starter", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [],
        plannedNodeLibrary: [],
        unsupportedNodes: [],
        message: "已保存 workspace starter：Starter A。",
        messageTone: "success",
        messageKind: "workspace_starter_saved",
        savedWorkspaceStarter: buildSavedWorkspaceStarter(),
        persistBlockerSummary: null,
        persistBlockers: [],
        executionPreflightMessage: null,
        toolExecutionValidationIssueCount: 0,
        validationNavigatorItems: [],
        runs: [],
        selectedRunId: null,
        run: null,
        runSnapshot: null,
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        createWorkflowHref:
          "/workflows/new?needs_follow_up=true&q=drift&source_governance_kind=drifted",
        workspaceStarterLibraryHref:
          "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted",
        hasScopedWorkspaceStarterFilters: true,
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onWorkflowNameChange: () => undefined,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("query scope");
    expect(html).toContain("Primary governed starter: Starter A · 已对齐 · source 0.1.0.");
    expect(html).toContain("打开刚保存的 starter：Starter A");
    expect(html).toContain("带此 starter 回到创建页");
    expect(html).toContain(
      'href="/workspace-starters?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1"'
    );
    expect(html).toContain(
      'href="/workflows/new?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1"'
    );
  });

  it("prioritizes missing-tool governance handoff after saving a starter from a governed workflow", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [
          {
            id: "workflow-1",
            name: "Governed workflow",
            status: "draft",
            version: "0.1.0",
            node_count: 1,
            tool_governance: {
              referenced_tool_ids: ["native.catalog-gap"],
              missing_tool_ids: ["native.catalog-gap"],
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
        ],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [],
        plannedNodeLibrary: [],
        unsupportedNodes: [],
        message: "已保存 workspace starter：Starter A。",
        messageTone: "success",
        messageKind: "workspace_starter_saved",
        savedWorkspaceStarter: buildSavedWorkspaceStarter(),
        persistBlockerSummary: null,
        persistBlockers: [],
        executionPreflightMessage: null,
        toolExecutionValidationIssueCount: 0,
        validationNavigatorItems: [],
        runs: [],
        selectedRunId: null,
        run: null,
        runSnapshot: null,
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        createWorkflowHref:
          "/workflows/new?needs_follow_up=true&q=drift&source_governance_kind=drifted",
        workspaceStarterLibraryHref:
          "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted",
        hasScopedWorkspaceStarterFilters: true,
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: " drift ",
          selectedTemplateId: "workspace-starter-1"
        },
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onWorkflowNameChange: () => undefined,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("catalog gap");
    expect(html).toContain("native.catalog-gap");
    expect(html).toContain("Primary governed starter: Starter A · catalog gap · native.catalog-gap · publish auth blocker · source 0.1.0.");
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
    expect(html).toContain(
      'href="/workflows/workflow-1?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool"'
    );
  });
});
