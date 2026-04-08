/* @vitest-environment jsdom */
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowEditorWorkbench } from "@/components/workflow-editor-workbench";

Object.assign(globalThis, { React });

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
});

const reactFlowPropHistory = vi.hoisted(() => ({
  nodeTypes: [] as unknown[],
  edgeTypes: [] as unknown[]
}));

const mocks = vi.hoisted(() => ({
  useWorkflowEditorShellState: vi.fn(),
  useWorkflowEditorGraph: vi.fn(),
  useWorkflowEditorRuntimeData: vi.fn(),
  useWorkflowRunOverlay: vi.fn(),
  useWorkflowEditorValidation: vi.fn(),
  useWorkflowEditorPersistence: vi.fn(),
  useWorkflowEditorPanels: vi.fn(),
  applyRunOverlayToNodes: vi.fn(<T,>(nodes: T[]) => nodes)
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: React.ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
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
    }
  };
});

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-component": "react-flow-provider" }, children),
  ReactFlow: ({
    children,
    nodeTypes,
    edgeTypes,
    className
  }: {
    children: React.ReactNode;
    nodeTypes: unknown;
    edgeTypes: unknown;
    className?: string;
  }) => {
    reactFlowPropHistory.nodeTypes.push(nodeTypes);
    reactFlowPropHistory.edgeTypes.push(edgeTypes);

    return createElement(
      "div",
      { className, "data-component": "react-flow" },
      children
    );
  },
  Panel: ({ children, className, position }: { children: React.ReactNode; className?: string; position?: string }) =>
    createElement(
      "div",
      { className, "data-component": "react-flow-panel", "data-position": position ?? "unknown" },
      children
    ),
  Background: () => createElement("div", { "data-component": "react-flow-background" }),
  MiniMap: () => createElement("div", { "data-component": "react-flow-minimap" }),
  Controls: () => createElement("div", { "data-component": "react-flow-controls" })
}));

vi.mock("@/lib/workflow-node-catalog", () => ({
  getPaletteNodeCatalog: () => [],
  getPlannedNodeCatalog: () => [],
  sortWorkflowNodeCatalogForAuthoring: <T,>(items: T[]) => items
}));

vi.mock("@/components/workflow-editor-inspector", () => ({
  WorkflowEditorInspector: () =>
    createElement("div", { "data-component": "workflow-editor-inspector" }, "inspector")
}));

vi.mock("@/components/workflow-editor-workbench/persist-blockers", () => ({
  summarizeWorkflowPersistBlockers: () => null
}));

vi.mock("@/components/workflow-editor-workbench/workflow-canvas-node", () => ({
  WorkflowCanvasNode: () => createElement("div", { "data-component": "workflow-canvas-node" }, "node"),
  applyRunOverlayToNodes: mocks.applyRunOverlayToNodes,
  nodeColorByType: () => "#1f5ed5"
}));

vi.mock("@/components/workflow-editor-workbench/workflow-canvas-edge", () => ({
  WorkflowCanvasEdge: () => createElement("div", { "data-component": "workflow-canvas-edge" }, "edge")
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-shell-state", () => ({
  useWorkflowEditorShellState: mocks.useWorkflowEditorShellState
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-graph", () => ({
  useWorkflowEditorGraph: mocks.useWorkflowEditorGraph
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-runtime-data", () => ({
  useWorkflowEditorRuntimeData: mocks.useWorkflowEditorRuntimeData
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-run-overlay", () => ({
  useWorkflowRunOverlay: mocks.useWorkflowRunOverlay
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-validation", () => ({
  useWorkflowEditorValidation: mocks.useWorkflowEditorValidation
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-persistence", () => ({
  useWorkflowEditorPersistence: mocks.useWorkflowEditorPersistence
}));

vi.mock("@/components/workflow-editor-workbench/use-workflow-editor-panels", () => ({
  useWorkflowEditorPanels: mocks.useWorkflowEditorPanels
}));

function buildWorkflow() {
  return {
    id: "workflow-1",
    name: "Demo workflow",
    version: "0.1.0",
    status: "draft",
    node_count: 1,
    publish_count: 0,
    versions: [],
    created_at: "2026-04-01T08:00:00Z",
    updated_at: "2026-04-01T08:00:00Z",
    definition: {
      nodes: [],
      edges: [],
      variables: [],
      publish: []
    },
    definition_issues: [],
    tool_governance: {
      referenced_tool_ids: [],
      missing_tool_ids: [],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0
    }
  };
}

function buildShellState(overrides: Record<string, unknown> = {}) {
  return {
    serverValidationIssues: [],
    setServerValidationIssues: () => undefined,
    setServerValidationIssueSourceSignature: () => undefined,
    setMessage: () => undefined,
    setMessageTone: () => undefined,
    setMessageKind: () => undefined,
    setSavedWorkspaceStarter: () => undefined,
    validationFocusItem: null,
    isSidebarCollapsed: true,
    toggleSidebar: () => undefined,
    openNodeAssistant: () => undefined,
    openNodeRuntime: () => undefined,
    runtimeRequest: null,
    assistantRequestSerial: 0,
    clearRuntimeRequest: () => undefined,
    getInspectorFocusState: () => ({
      highlightedNodeSection: null,
      highlightedNodeFieldPath: null,
      highlightedPublishEndpointIndex: null,
      highlightedPublishEndpointFieldPath: null,
      highlightedVariableIndex: null,
      highlightedVariableFieldPath: null
    }),
    ...overrides
  };
}

function buildGraphState(overrides: Record<string, unknown> = {}) {
  return {
    currentDefinition: {
      nodes: [],
      edges: [],
      variables: [],
      publish: []
    },
    nodes: [
      {
        id: "node-1",
        data: {
          label: "开始",
          nodeType: "startNode"
        },
        selected: true
      }
    ],
    edges: [],
    onNodesChange: () => undefined,
    onEdgesChange: () => undefined,
    onConnect: () => undefined,
    handleSelectionChange: () => undefined,
    handleAddNode: () => undefined,
    handleDeleteNode: () => undefined,
    focusNode: () => undefined,
    selectedNodeId: "node-1",
    selectedEdgeId: null,
    selectedNode: {
      id: "node-1",
      data: {
        label: "开始",
        nodeType: "startNode"
      },
      selected: true
    },
    selectedEdge: null,
    handleNodeNameChange: () => undefined,
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
    ...overrides
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
      selectedNodeLabel: "开始",
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
      onToggleInspector: () => undefined,
      onOpenAssistant: () => undefined,
      onSave: () => undefined,
      onSaveAsWorkspaceStarter: () => undefined,
      onOpenRunLauncher: () => undefined
    },
    sidebarProps: {} as never,
    inspectorProps: {} as never,
    runLauncherSurfaceProps: {
      workflowId: "workflow-1",
      open: false,
      workflowVariables: [],
      onClose: () => undefined,
      onRunSuccess: () => undefined,
      onRunError: () => undefined
    }
  };
}

function buildRunDetail() {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    status: "succeeded",
    trigger_source: "manual",
    started_at: "2026-04-01T08:00:00Z",
    finished_at: "2026-04-01T08:00:03Z",
    created_at: "2026-04-01T08:00:00Z",
    updated_at: "2026-04-01T08:00:03Z",
    node_runs: [
      {
        id: "node-run-1",
        node_id: "node-1",
        status: "succeeded",
        started_at: "2026-04-01T08:00:00Z",
        finished_at: "2026-04-01T08:00:03Z",
        error_message: null,
        execution_class: "host"
      }
    ]
  };
}

function renderWorkbench(root: Root) {
  return act(async () => {
    root.render(
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
        workspaceStarterGovernanceQueryScope: null
      })
    );
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

beforeEach(() => {
  reactFlowPropHistory.nodeTypes.length = 0;
  reactFlowPropHistory.edgeTypes.length = 0;
  mocks.applyRunOverlayToNodes.mockReset();
  mocks.applyRunOverlayToNodes.mockImplementation(<T,>(nodes: T[]) => nodes);
  mocks.useWorkflowEditorShellState.mockReturnValue(buildShellState());
  mocks.useWorkflowEditorGraph.mockReturnValue(buildGraphState());
  mocks.useWorkflowEditorRuntimeData.mockReturnValue({
    credentials: [],
    modelProviderCatalog: [],
    modelProviderConfigs: [],
    modelProviderRegistryStatus: "ready",
    recentRuns: []
  });
  mocks.useWorkflowRunOverlay.mockReturnValue({
    availableRuns: [],
    selectedRunId: null,
    setSelectedRunId: () => undefined,
    selectedRunDetail: null,
    selectedRunSnapshot: null,
    selectedRunTrace: null,
    runOverlayError: null,
    isLoadingRunOverlay: false,
    isRefreshingRuns: false,
    refreshRecentRuns: async () => undefined
  });
  mocks.useWorkflowEditorValidation.mockReturnValue({
    persistBlockers: [],
    persistBlockedMessage: null,
    validationNavigatorItems: []
  });
  mocks.useWorkflowEditorPersistence.mockReturnValue({
    isSaving: false,
    isSavingStarter: false,
    handleSave: () => undefined,
    handleSaveAsWorkspaceStarter: () => undefined
  });
  mocks.useWorkflowEditorPanels.mockReturnValue(buildPanels());

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

describe("WorkflowEditorWorkbench client render", () => {
  it("keeps canvas node and edge renderers stable across overlay-driven rerenders", async () => {
    await renderWorkbench(root as Root);

    const firstNodeTypes = reactFlowPropHistory.nodeTypes.at(-1);
    const firstEdgeTypes = reactFlowPropHistory.edgeTypes.at(-1);

    mocks.applyRunOverlayToNodes.mockImplementation((nodes: unknown[]) =>
      nodes.map((node) => {
        const workflowNode = node as { id: string; data: Record<string, unknown> };

        return workflowNode.id === "node-1"
            ? {
                ...workflowNode,
                data: {
                  ...workflowNode.data,
                  runStatus: "succeeded"
                }
              }
            : workflowNode;
      })
    );
    mocks.useWorkflowRunOverlay.mockReturnValue({
      availableRuns: [],
      selectedRunId: "run-1",
      setSelectedRunId: () => undefined,
      selectedRunDetail: buildRunDetail(),
      selectedRunSnapshot: null,
      selectedRunTrace: { events: [] },
      runOverlayError: null,
      isLoadingRunOverlay: false,
      isRefreshingRuns: false,
      refreshRecentRuns: async () => undefined
    });

    await renderWorkbench(root as Root);

    expect(reactFlowPropHistory.nodeTypes.at(-1)).toBe(firstNodeTypes);
    expect(reactFlowPropHistory.edgeTypes.at(-1)).toBe(firstEdgeTypes);
  });
});
