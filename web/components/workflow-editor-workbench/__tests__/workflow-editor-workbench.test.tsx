import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowEditorWorkbench } from "@/components/workflow-editor-workbench";

Object.assign(globalThis, { React });

const mocks = vi.hoisted(() => ({
  useWorkflowEditorShellState: vi.fn(),
  useWorkflowEditorGraph: vi.fn(),
  useWorkflowEditorRuntimeData: vi.fn(),
  useWorkflowRunOverlay: vi.fn(),
  useWorkflowEditorValidation: vi.fn(),
  useWorkflowEditorPersistence: vi.fn(),
  useWorkflowEditorPanels: vi.fn(),
}));

vi.mock("next/dynamic", async () => {
  const canvasModule = await vi.importActual<
    typeof import("@/components/workflow-editor-workbench/workflow-editor-canvas")
  >("@/components/workflow-editor-workbench/workflow-editor-canvas");

  return {
    default: (loader: { toString: () => string }) => {
      const source = loader.toString();
      if (source.includes("workflow-editor-canvas")) {
        return canvasModule.WorkflowEditorCanvas;
      }
      return () => null;
    },
  };
});

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd");
  return {
    ...actual,
    Drawer: ({ open, placement, children, className }: Record<string, unknown>) =>
      createElement(
        "div",
        {
          className,
          "data-component": placement === "left"
            ? "workflow-editor-sidebar-drawer-shell"
            : "workflow-editor-inspector-drawer-shell",
          "data-open": open ? "true" : "false",
        },
        children as React.ReactNode,
      ),
  };
});

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-component": "react-flow-provider" }, children),
  ReactFlow: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    createElement(
      "div",
      { className, "data-component": "react-flow" },
      children,
    ),
  Panel: ({ children, className, position }: { children: React.ReactNode; className?: string; position?: string }) =>
    createElement(
      "div",
      { className, "data-component": "react-flow-panel", "data-position": position ?? "unknown" },
      children,
    ),
  Background: () => createElement("div", { "data-component": "react-flow-background" }),
  MiniMap: () => createElement("div", { "data-component": "react-flow-minimap" }),
  Controls: () => createElement("div", { "data-component": "react-flow-controls" }),
}));

vi.mock("@/lib/workflow-node-catalog", () => ({
  getPaletteNodeCatalog: () => [],
  getPlannedNodeCatalog: () => [],
  sortWorkflowNodeCatalogForAuthoring: <T,>(items: T[]) => items,
}));

vi.mock("@/components/workflow-editor-workbench/workflow-editor-hero", () => ({
  WorkflowEditorHero: () => createElement("div", { "data-component": "workflow-editor-hero" }, "hero"),
}));

vi.mock("@/components/workflow-editor-workbench/workflow-editor-sidebar", () => ({
  WorkflowEditorSidebar: () => createElement("div", { "data-component": "workflow-editor-sidebar" }, "sidebar"),
}));

vi.mock("@/components/workflow-editor-inspector", () => ({
  WorkflowEditorInspector: () => createElement("div", { "data-component": "workflow-editor-inspector" }, "inspector"),
}));

vi.mock("@/components/workflow-editor-workbench/persist-blockers", () => ({
  summarizeWorkflowPersistBlockers: () => null,
}));

vi.mock("@/components/workflow-editor-workbench/workflow-canvas-node", () => ({
  WorkflowCanvasNode: () => createElement("div", { "data-component": "workflow-canvas-node" }, "node"),
  applyRunOverlayToNodes: <T,>(nodes: T[]) => nodes,
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-shell-state", () => ({
  useWorkflowEditorShellState: mocks.useWorkflowEditorShellState,
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-graph", () => ({
  useWorkflowEditorGraph: mocks.useWorkflowEditorGraph,
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-runtime-data", () => ({
  useWorkflowEditorRuntimeData: mocks.useWorkflowEditorRuntimeData,
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-run-overlay", () => ({
  useWorkflowRunOverlay: mocks.useWorkflowRunOverlay,
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-validation", () => ({
  useWorkflowEditorValidation: mocks.useWorkflowEditorValidation,
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-persistence", () => ({
  useWorkflowEditorPersistence: mocks.useWorkflowEditorPersistence,
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-panels", () => ({
  useWorkflowEditorPanels: mocks.useWorkflowEditorPanels,
}));

vi.mock("@/components/workflow-editor-workbench/workflow-editor-run-launcher-surface", () => ({
  WorkflowEditorRunLauncherSurface: () =>
    createElement("div", { "data-component": "workflow-editor-run-launcher-surface" }, "run-launcher"),
}));

function buildWorkflow() {
  return {
    id: "workflow-1",
    name: "Demo workflow",
    version: "0.1.0",
    status: "draft",
    created_at: "2026-04-02T18:00:00Z",
    updated_at: "2026-04-02T18:00:00Z",
    node_count: 1,
    publish_count: 0,
    versions: [{ version: "0.1.0" }],
    definition: {
      nodes: [],
      edges: [],
      variables: [],
      publish: [],
    },
    definition_issues: [],
    tool_governance: {
      referenced_tool_ids: [],
      missing_tool_ids: [],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0,
    },
  };
}

function buildShellState(overrides: Record<string, unknown> = {}) {
  return {
    message: null,
    setMessage: () => undefined,
    messageTone: "idle",
    setMessageTone: () => undefined,
    messageKind: "default",
    setMessageKind: () => undefined,
    savedWorkspaceStarter: null,
    setSavedWorkspaceStarter: () => undefined,
    serverValidationIssues: [],
    setServerValidationIssues: () => undefined,
    setServerValidationIssueSourceSignature: () => undefined,
    validationFocusItem: null,
    setValidationFocusItem: () => undefined,
    isSidebarCollapsed: true,
    setIsSidebarCollapsed: () => undefined,
    isInspectorCollapsed: true,
    setIsInspectorCollapsed: () => undefined,
    assistantRequestSerial: 0,
    toggleSidebar: () => undefined,
    toggleInspector: () => undefined,
    openNodeAssistant: () => undefined,
    getInspectorFocusState: () => ({
      highlightedNodeSection: null,
      highlightedNodeFieldPath: null,
      highlightedPublishEndpointIndex: null,
      highlightedPublishEndpointFieldPath: null,
      highlightedVariableIndex: null,
      highlightedVariableFieldPath: null,
    }),
    ...overrides,
  };
}

function buildGraphState(overrides: Record<string, unknown> = {}) {
  return {
    currentDefinition: {
      nodes: [],
      edges: [],
      variables: [],
      publish: [],
    },
    nodes: [
      {
        id: "node-1",
        data: {
          label: "LLM Agent",
          nodeType: "llm_agent",
        },
      },
    ],
    edges: [],
    onNodesChange: () => undefined,
    onEdgesChange: () => undefined,
    onConnect: () => undefined,
    handleSelectionChange: () => undefined,
    handleAddNode: () => undefined,
    handleDeleteNode: () => undefined,
    focusNode: () => undefined,
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedNode: null,
    selectedEdge: null,
    workflowName: "Demo workflow",
    workflowVersion: "0.1.0",
    canUndo: false,
    canRedo: false,
    undo: () => undefined,
    redo: () => undefined,
    isDirty: false,
    setWorkflowName: () => undefined,
    setPersistedWorkflowName: () => undefined,
    setPersistedDefinition: () => undefined,
    setWorkflowVersion: () => undefined,
    ...overrides,
  };
}

function buildPanels() {
  return {
    heroProps: {
      workflowName: "Demo workflow",
      onWorkflowNameChange: () => undefined,
      workflowVersion: "0.1.0",
      nodesCount: 1,
      edgesCount: 0,
      toolsCount: 0,
      availableRunsCount: 0,
      isDirty: false,
      selectedNodeLabel: null,
      selectedEdgeId: null,
      selectedRunAttached: false,
      contractValidationIssuesCount: 0,
      toolReferenceValidationIssuesCount: 0,
      nodeExecutionValidationIssuesCount: 0,
      toolExecutionValidationIssuesCount: 0,
      publishDraftValidationIssuesCount: 0,
      persistBlockerSummary: null,
      isSaving: false,
      isSavingStarter: false,
      isSidebarCollapsed: true,
      isInspectorCollapsed: true,
      hasNodeAssistant: false,
      onToggleSidebar: () => undefined,
      onToggleInspector: () => undefined,
      onOpenAssistant: () => undefined,
      onSave: () => undefined,
      onSaveAsWorkspaceStarter: () => undefined,
      onOpenRunLauncher: () => undefined,
    },
    sidebarProps: {} as never,
    inspectorProps: {} as never,
    runLauncherSurfaceProps: {
      workflowId: "workflow-1",
      open: false,
      workflowVariables: [],
      onClose: () => undefined,
      onRunSuccess: () => undefined,
      onRunError: () => undefined,
    },
  };
}

function renderWorkbench() {
  return renderToStaticMarkup(
    createElement(WorkflowEditorWorkbench, {
      workflow: buildWorkflow() as never,
      workflows: [] as never,
      nodeCatalog: [] as never,
      nodeSourceLanes: [] as never,
      toolSourceLanes: [] as never,
      tools: [] as never,
      adapters: [] as never,
      callbackWaitingAutomation: null,
      sandboxReadiness: null,
      sandboxBackends: [],
      initialCredentials: [],
      initialModelProviderCatalog: [],
      initialModelProviderConfigs: [],
      initialModelProviderRegistryStatus: "ready",
      initialRecentRuns: [],
      currentEditorHref: "/workflows/workflow-1/editor",
      workflowLibraryHref: "/workflows",
      createWorkflowHref: "/workflows/new",
      workspaceStarterLibraryHref: "/workspace-starters",
      hasScopedWorkspaceStarterFilters: false,
      workspaceStarterGovernanceQueryScope: null,
    }),
  );
}

beforeEach(() => {
  mocks.useWorkflowEditorShellState.mockReturnValue(buildShellState());
  mocks.useWorkflowEditorGraph.mockReturnValue(buildGraphState());
  mocks.useWorkflowEditorRuntimeData.mockReturnValue({
    credentials: [],
    modelProviderCatalog: [],
    modelProviderConfigs: [],
    modelProviderRegistryStatus: "ready",
    recentRuns: [],
  });
  mocks.useWorkflowRunOverlay.mockReturnValue({
    availableRuns: [],
    selectedRunId: null,
    selectedRunDetail: null,
    selectedRunTrace: null,
  });
  mocks.useWorkflowEditorValidation.mockReturnValue({
    persistBlockers: [],
  });
  mocks.useWorkflowEditorPersistence.mockReturnValue({
    isSaving: false,
    isSavingStarter: false,
    handleSave: () => undefined,
    handleSaveAsWorkspaceStarter: () => undefined,
  });
  mocks.useWorkflowEditorPanels.mockReturnValue(buildPanels());
});

describe("WorkflowEditorWorkbench", () => {
  it("renders canvas action strip and overlay drawers instead of permanent side rails", () => {
    mocks.useWorkflowEditorShellState.mockReturnValue(
      buildShellState({
        isSidebarCollapsed: false,
        isInspectorCollapsed: false,
      }),
    );
    mocks.useWorkflowEditorGraph.mockReturnValue(
      buildGraphState({
        selectedNodeId: "node-1",
        canUndo: true,
        canRedo: true,
      }),
    );

    const html = renderWorkbench();

    expect(html).toContain('data-component="workflow-editor-action-strip"');
    expect(html).toContain('data-action="undo"');
    expect(html).toContain('data-action="redo"');
    expect(html).toContain('data-action="node-library"');
    expect(html).toContain('data-action="inspector"');
    expect(html).toContain('data-action="assistant"');
    expect(html).toContain('data-action="fit-view"');
    expect(html).toContain('data-action="minimap"');
    expect(html).toContain("撤销");
    expect(html).toContain("重做");
    expect(html).toContain("节点目录");
    expect(html).toContain("属性抽屉");
    expect(html).toContain("AI 辅助");
    expect((html.match(/data-command-enabled="true"/g) ?? []).length).toBe(2);
    expect(html).toContain('data-component="workflow-editor-sidebar-drawer-shell"');
    expect(html).toContain('data-component="workflow-editor-inspector-drawer-shell"');
    expect(html).toContain('data-open="true"');
    expect(html).toContain('data-component="workflow-editor-sidebar-drawer"');
    expect(html).toContain('data-component="workflow-editor-inspector-drawer"');
    expect(html).not.toContain("<aside class=\"editor-inspector\"");
  });

  it("falls back to workflow-level inspector entry when nothing is selected", () => {
    const html = renderWorkbench();

    expect(html).toContain('data-component="workflow-editor-action-strip"');
    expect(html).toContain('data-action="undo"');
    expect(html).toContain('data-action="redo"');
    expect((html.match(/data-command-enabled="false"/g) ?? []).length).toBe(2);
    expect(html).toContain("应用配置");
    expect(html).not.toContain("AI 辅助");
    expect(html).toContain('data-component="workflow-editor-sidebar-drawer-shell"');
    expect(html).toContain('data-component="workflow-editor-inspector-drawer-shell"');
    expect(html).toContain('data-open="false"');
  });
});
