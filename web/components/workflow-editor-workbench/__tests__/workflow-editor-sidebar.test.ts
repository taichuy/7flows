import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorSidebar } from "@/components/workflow-editor-workbench/workflow-editor-sidebar";
import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

Object.assign(globalThis, { React });

vi.mock("next/dynamic", async () => {
  const diagnosticsModule = await vi.importActual<
    typeof import("@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-diagnostics-panel")
  >("@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-diagnostics-panel");
  const runPanelModule = await vi.importActual<
    typeof import("@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-run-panel")
  >("@/components/workflow-editor-workbench/sidebar-panels/workflow-editor-run-panel");

  return {
    default: (loader: { toString: () => string }) => {
      const source = loader.toString();

      if (source.includes("sidebar-panels/workflow-editor-diagnostics-panel")) {
        return diagnosticsModule.WorkflowEditorDiagnosticsPanel;
      }

      if (source.includes("sidebar-panels/workflow-editor-run-panel")) {
        return runPanelModule.WorkflowEditorRunPanel;
      }

      return () => null;
    }
  };
});

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/workflow-run-overlay-panel", () => ({
  WorkflowRunOverlayPanel: () =>
    createElement(
      "div",
      { "data-component": "workflow-run-overlay-panel" },
      "workflow-run-overlay-panel"
    )
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

function buildNodeCatalogItem(
  type: string,
  label: string,
  supportStatus: "available" | "planned" = "available"
): WorkflowNodeCatalogItem {
  return {
    type,
    label,
    description: `${label} description`,
    ecosystem: "native",
    source: {
      kind: "node",
      scope: "builtin",
      status: supportStatus,
      governance: "repo",
      ecosystem: "7flows",
      label: "Native nodes",
      shortLabel: "native nodes",
      summary: "Built-in nodes"
    },
    capabilityGroup:
      type === "output"
        ? "output"
        : type === "condition" || type === "loop"
          ? "logic"
          : "integration",
    businessTrack: "编排节点能力",
    tags: [type],
    supportStatus,
    supportSummary: supportStatus === "available" ? "available" : "planned",
    bindingRequired: false,
    bindingSourceLanes: [],
    palette: {
      enabled: supportStatus === "available",
      order: 10,
      defaultPosition: { x: 100, y: 100 }
    },
    defaults: {
      name: label,
      config: {}
    }
  };
}

describe("WorkflowEditorSidebar", () => {
  it("does not mount diagnostics content before the diagnostics tab is opened", () => {
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
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).not.toContain('data-component="workflow-editor-diagnostics-panel"');
  });

  it("shows a collapse action on the shared studio rail section", () => {
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
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onCollapse: () => undefined,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain('data-component="workflow-editor-sidebar-studio-rail"');
    expect(html).toContain('data-action="collapse-sidebar"');
    expect(html).toContain("编排中心");
    expect(html).toContain("画布编排");
  });

  it("mounts diagnostics content when the diagnostics tab becomes the active entry", () => {
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
        persistBlockerSummary: "还有阻断",
        persistBlockers: [
          {
            id: "contract_schema",
            label: "Contract schema",
            detail: "当前 workflow 缺少触发器。",
            nextStep: "请先补触发器。"
          }
        ],
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
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain('data-component="workflow-editor-diagnostics-panel"');
  });

  it("does not mount run overlay content before the run tab is opened", () => {
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
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).not.toContain('data-component="workflow-run-overlay-panel"');
  });

  it("mounts run overlay content when the run tab becomes the active entry", () => {
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
        persistBlockerSummary: null,
        persistBlockers: [],
        executionPreflightMessage: null,
        toolExecutionValidationIssueCount: 0,
        validationNavigatorItems: [],
        runs: [{
          id: "run-1",
          workflow_id: "workflow-1",
          workflow_version: "0.1.0",
          status: "completed",
          created_at: "2026-03-31T03:00:00Z",
          started_at: "2026-03-31T03:00:01Z",
          finished_at: "2026-03-31T03:00:02Z",
          node_run_count: 1,
          event_count: 3,
          last_event_at: "2026-03-31T03:00:02Z"
        }],
        selectedRunId: "run-1",
        run: null,
        runSnapshot: null,
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain('data-component="workflow-editor-run-overlay-panel"');
    expect(html).toContain('data-component="workflow-run-overlay-panel"');
  });

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
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain(
      'href="/workflows/workflow%20alpha%2Fbeta/editor?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool"'
    );
    expect(html).toContain("同域草稿 1");
    expect(html).toContain("切草稿只放这里，不和节点插入混在一起。");
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
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain(
      'href="/workflows/workflow%20alpha%2Fbeta/editor?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=legacy_publish_auth"'
    );
  });

  it("marks the current workflow chip as current when the scoped editor href already matches", () => {
    const currentHref =
      "/workflows/workflow-1/editor?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=workspace-starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool";
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        currentHref,
        workflowId: "workflow-1",
        workflowName: "Governed workflow",
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
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain(
      'href="/workflows/workflow-1/editor?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool"'
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
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("执行前检查");
    expect(html).toContain("保存阻断");
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
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("保存阻断");
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

  it("adds shared governance previews to validation issue buttons", () => {
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
        persistBlockerSummary: null,
        persistBlockers: [],
        executionPreflightMessage: null,
        toolExecutionValidationIssueCount: 0,
        validationNavigatorItems: [
          {
            key: "tool-reference",
            category: "tool_reference",
            message: "Tool 节点 Search 引用了当前目录中不存在的工具 native.catalog-gap。",
            catalogGapToolIds: ["native.catalog-gap"],
            target: {
              scope: "node",
              nodeId: "node-1",
              section: "config",
              fieldPath: "config.tool.toolId",
              label: "Node · Search"
            }
          },
          {
            key: "publish-auth-mode",
            category: "publish_draft",
            message: "Public Search 当前不能使用 authMode = token。",
            hasLegacyPublishAuthModeIssues: true,
            target: {
              scope: "publish",
              endpointIndex: 0,
              fieldPath: "authMode",
              label: "Publish · Public Search"
            }
          }
        ],
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
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("catalog gap");
    expect(html).toContain("native.catalog-gap");
    expect(html).toContain("workflow governance handoff 收口");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain("Publish auth contract：supported api_key / internal；legacy token。");
    expect(html).toContain("先把 workflow draft endpoint 切回 api_key/internal 并保存");
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
      'href="/workflows/workflow-1/editor?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=workspace-starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool"'
    );
  });

  it("surfaces planned loop nodes directly in the node rail summary", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [
          buildNodeCatalogItem("llm_agent", "LLM Agent"),
          buildNodeCatalogItem("tool", "Tool"),
          buildNodeCatalogItem("condition", "Condition"),
          buildNodeCatalogItem("mcp_query", "MCP Query"),
          buildNodeCatalogItem("sandbox_code", "Sandbox Code"),
          buildNodeCatalogItem("output", "Output")
        ],
        plannedNodeLibrary: [buildNodeCatalogItem("loop", "Loop", "planned")],
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
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("LLM Agent");
    expect(html).toContain("Condition");
    expect(html).toContain("MCP Query");
    expect(html).toContain("Sandbox Code");
    expect(html).toContain("规划中的节点 (1) · Loop");
  });

  it("surfaces a primary authoring path that continues from the selected node", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [
          buildNodeCatalogItem("condition", "Condition"),
          buildNodeCatalogItem("tool", "Tool"),
          buildNodeCatalogItem("llm_agent", "LLM Agent"),
          buildNodeCatalogItem("reference", "Reference"),
          buildNodeCatalogItem("output", "Output")
        ],
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
        selectedNodeId: "agent-1",
        authoringSourceNodeId: "agent-1",
        authoringSourceNodeLabel: "Planner",
        authoringSourceContext: "selected",
        sandboxReadiness: buildSandboxReadiness(),
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain('data-component="workflow-editor-primary-authoring-path"');
    expect(html).toContain("常用主链");
    expect(html).toContain("当前已选中 Planner；这里的常用节点会直接插到它后方。");
    expect(html).toContain("Planner 后方优先接 LLM 主节点，继续模型编排主链。");
    expect(html).toContain("Planner 后方新增 Reference 时，会自动补齐显式引用授权。");
  });

  it("falls back to the trigger-centered authoring path when no node is selected", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorSidebar, {
        workflowId: "workflow-1",
        workflowName: "Demo workflow",
        workflows: [],
        nodeSourceLanes: [],
        toolSourceLanes: [],
        editorNodeLibrary: [
          buildNodeCatalogItem("tool", "Tool"),
          buildNodeCatalogItem("reference", "Reference"),
          buildNodeCatalogItem("llm_agent", "LLM Agent"),
          buildNodeCatalogItem("condition", "Condition"),
          buildNodeCatalogItem("output", "Output")
        ],
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
        authoringSourceNodeId: "trigger",
        authoringSourceNodeLabel: "Trigger",
        authoringSourceContext: "default_trigger",
        sandboxReadiness: buildSandboxReadiness(),
        isLoadingRunOverlay: false,
        isRefreshingRuns: false,
        onAddNode: () => undefined,
        onNavigateValidationIssue: () => undefined,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("当前未选节点；这里会默认从 Trigger 继续主链。");
    expect(html).toContain(
      "Reference 会自动补齐 reference.sourceNodeId 与 readableNodeIds，但仍保持显式授权边界。"
    );
  });
});
