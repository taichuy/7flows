"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentProps
} from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Input } from "antd";

import {
  getPaletteNodeCatalog,
  getPlannedNodeCatalog,
  sortWorkflowNodeCatalogForAuthoring
} from "@/lib/workflow-node-catalog";

import { useWorkflowEditorShellState } from "@/components/workflow-editor-workbench/use-workflow-editor-shell-state";
import { useWorkflowEditorPanels } from "@/components/workflow-editor-workbench/use-workflow-editor-panels";
import {
  summarizeWorkflowPersistBlockers
} from "@/components/workflow-editor-workbench/persist-blockers";
import {
  applyRunOverlayToNodes,
  WorkflowCanvasNode
} from "@/components/workflow-editor-workbench/workflow-canvas-node";
import { WorkflowCanvasEdge } from "@/components/workflow-editor-workbench/workflow-canvas-edge";
import type { WorkflowCanvasQuickAddOption } from "@/components/workflow-editor-workbench/workflow-canvas-quick-add";
import { useWorkflowEditorGraph } from "@/components/workflow-editor-workbench/use-workflow-editor-graph";
import { useWorkflowEditorPersistence } from "@/components/workflow-editor-workbench/use-workflow-editor-persistence";
import { useWorkflowEditorValidation } from "@/components/workflow-editor-workbench/use-workflow-editor-validation";
import { useWorkflowRunOverlay } from "@/components/workflow-editor-workbench/use-workflow-run-overlay";
import { WorkflowEditorRunLauncherSurface } from "@/components/workflow-editor-workbench/workflow-editor-run-launcher-surface";
import { WorkflowEditorInspector } from "@/components/workflow-editor-inspector";
import { useWorkflowEditorRuntimeData } from "@/components/workflow-editor-workbench/use-workflow-editor-runtime-data";
import { WorkflowEditorFloatingPanel } from "@/components/workflow-editor-workbench/workflow-editor-floating-panel";
import type { WorkflowEditorCanvasProps } from "@/components/workflow-editor-workbench/workflow-editor-canvas";
import type { WorkflowEditorWorkbenchProps } from "@/components/workflow-editor-workbench/types";
import type { WorkflowDefinitionPreflightIssue } from "@/lib/get-workflows";

const FLOATING_NODE_WORKBENCH_WIDTH = 440;
const FLOATING_NODE_WORKBENCH_MARGIN = 16;
const FLOATING_NODE_WORKBENCH_TOP = 76;
const EMPTY_SERVER_VALIDATION_ISSUES: WorkflowDefinitionPreflightIssue[] = [];

type FloatingWorkbenchPosition = {
  x: number;
  y: number;
};

type FloatingWorkbenchDragState = {
  pointerId: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  stageWidth: number;
  stageHeight: number;
  panelWidth: number;
  panelHeight: number;
};

function hasValidFloatingWorkbenchBounds(bounds: FloatingWorkbenchDragState | {
  stageWidth: number;
  stageHeight: number;
  panelWidth: number;
  panelHeight: number;
}) {
  return (
    Number.isFinite(bounds.stageWidth) &&
    bounds.stageWidth > 0 &&
    Number.isFinite(bounds.stageHeight) &&
    bounds.stageHeight > 0 &&
    Number.isFinite(bounds.panelWidth) &&
    bounds.panelWidth > 0 &&
    Number.isFinite(bounds.panelHeight) &&
    bounds.panelHeight > 0
  );
}

function areFloatingWorkbenchPositionsEqual(
  left: FloatingWorkbenchPosition | null,
  right: FloatingWorkbenchPosition | null
) {
  if (!left || !right) {
    return false;
  }

  return left.x === right.x && left.y === right.y;
}

function clampFloatingWorkbenchPosition(
  position: FloatingWorkbenchPosition,
  bounds: { stageWidth: number; stageHeight: number; panelWidth: number; panelHeight: number }
) {
  const maxX = Math.max(
    FLOATING_NODE_WORKBENCH_MARGIN,
    bounds.stageWidth - bounds.panelWidth - FLOATING_NODE_WORKBENCH_MARGIN
  );
  const maxY = Math.max(
    FLOATING_NODE_WORKBENCH_TOP,
    bounds.stageHeight - bounds.panelHeight - FLOATING_NODE_WORKBENCH_MARGIN
  );

  return {
    x: Math.min(maxX, Math.max(FLOATING_NODE_WORKBENCH_MARGIN, Math.round(position.x))),
    y: Math.min(maxY, Math.max(FLOATING_NODE_WORKBENCH_TOP, Math.round(position.y)))
  } satisfies FloatingWorkbenchPosition;
}

function resolveDefaultFloatingWorkbenchPosition(stageWidth: number) {
  return {
    x: Math.max(
      FLOATING_NODE_WORKBENCH_MARGIN,
      stageWidth - FLOATING_NODE_WORKBENCH_WIDTH - FLOATING_NODE_WORKBENCH_MARGIN
    ),
    y: FLOATING_NODE_WORKBENCH_TOP
  } satisfies FloatingWorkbenchPosition;
}

const LazyWorkflowEditorCanvas = dynamic<WorkflowEditorCanvasProps>(
  () =>
    import("@/components/workflow-editor-workbench/workflow-editor-canvas").then(
      (module) => module.WorkflowEditorCanvas
    ),
  {
    ssr: false,
    loading: () => <WorkflowEditorCanvasLoadingState />
  }
);

function WorkflowEditorCanvasLoadingState() {
  return (
    <section className="editor-canvas-panel" data-component="workflow-editor-canvas-loading">
      <div className="editor-canvas-card panel-stack-gap">
        <div className="section-heading">
          <div>
            <h2>交互画布稍后挂载</h2>
            <p>先稳定固定三栏工作台壳层，再接入 xyflow 画布。</p>
          </div>
        </div>
        <div className="panel-muted">
          <p>Hydration 完成后会继续挂载连线编辑、节点 quick-add、mini-map 与运行回放联动。</p>
        </div>
      </div>
    </section>
  );
}

export function WorkflowEditorWorkbench({
  workflow,
  workflows,
  nodeCatalog,
  nodeSourceLanes,
  toolSourceLanes,
  tools,
  adapters,
  callbackWaitingAutomation,
  sandboxReadiness,
  sandboxBackends,
  initialCredentials = [],
  initialModelProviderCatalog = [],
  initialModelProviderConfigs = [],
  initialModelProviderRegistryStatus = "idle",
  initialRecentRuns = [],
  currentEditorHref,
  workflowLibraryHref,
  createWorkflowHref,
  workspaceStarterLibraryHref,
  hasScopedWorkspaceStarterFilters = false,
  workspaceStarterGovernanceQueryScope = null
}: WorkflowEditorWorkbenchProps) {
  const canvasStageRef = useRef<HTMLElement | null>(null);
  const floatingWorkbenchRef = useRef<HTMLDivElement | null>(null);
  const floatingWorkbenchDragStateRef = useRef<FloatingWorkbenchDragState | null>(null);
  const editorNodeLibrary = getPaletteNodeCatalog(nodeCatalog);
  const plannedNodeLibrary = getPlannedNodeCatalog(nodeCatalog);
  const persistedDefinitionSignature = useMemo(
    () => JSON.stringify(workflow.definition),
    [workflow.definition]
  );
  const initialServerValidationIssues =
    workflow.definition_issues ?? EMPTY_SERVER_VALIDATION_ISSUES;
  const shell = useWorkflowEditorShellState({
    persistedDefinitionSignature,
    initialServerValidationIssues
  });

  const graph = useWorkflowEditorGraph({
    workflow,
    nodeCatalog,
    setMessage: shell.setMessage,
    setMessageTone: shell.setMessageTone
  });
  const [hasRequestedRunOverlay, setHasRequestedRunOverlay] = useState(
    initialRecentRuns.length > 0
  );
  const {
    credentials,
    modelProviderCatalog,
    modelProviderConfigs,
    modelProviderRegistryStatus,
    recentRuns
  } =
    useWorkflowEditorRuntimeData({
      workflowId: workflow.id,
      initialCredentials,
      initialModelProviderCatalog,
      initialModelProviderConfigs,
      initialModelProviderRegistryStatus,
      initialRecentRuns,
      loadCredentials: Boolean(graph.selectedNodeId),
      loadRecentRuns: hasRequestedRunOverlay
    });
  const currentDefinitionSignature = useMemo(
    () => JSON.stringify(graph.currentDefinition),
    [graph.currentDefinition]
  );
  const selectedInspectorKey = graph.selectedNodeId
    ? `node:${graph.selectedNodeId}`
    : graph.selectedEdgeId
      ? `edge:${graph.selectedEdgeId}`
      : null;
  const [isFloatingInspectorOpen, setIsFloatingInspectorOpen] = useState(
    Boolean(selectedInspectorKey)
  );
  const lastAutoOpenedInspectorKeyRef = useRef<string | null>(selectedInspectorKey);
  const [floatingWorkbenchPosition, setFloatingWorkbenchPosition] = useState<FloatingWorkbenchPosition | null>(null);
  const [isFloatingWorkbenchDragging, setIsFloatingWorkbenchDragging] = useState(false);
  const runOverlay = useWorkflowRunOverlay({
    workflowId: workflow.id,
    recentRuns,
    enabled: hasRequestedRunOverlay
  });
  const validation = useWorkflowEditorValidation({
    currentDefinition: graph.currentDefinition,
    workflowVersion: graph.workflowVersion,
    historicalVersions: workflow.versions.map((item) => item.version),
    nodeCatalog,
    tools,
    adapters,
    sandboxReadiness,
    sandboxBackends,
    serverValidationIssues: shell.serverValidationIssues
  });
  const persistence = useWorkflowEditorPersistence({
    workflowId: workflow.id,
    fallbackWorkflowName: workflow.name,
    workflowName: graph.workflowName,
    workflowVersion: graph.workflowVersion,
    currentDefinition: graph.currentDefinition,
    persistBlockerSummary: summarizeWorkflowPersistBlockers(validation.persistBlockers),
    persistBlockedMessage: validation.persistBlockedMessage,
    validationNavigatorItems: validation.validationNavigatorItems,
    sandboxReadiness,
    setPersistedWorkflowName: graph.setPersistedWorkflowName,
    setPersistedDefinition: graph.setPersistedDefinition,
    setWorkflowVersion: graph.setWorkflowVersion,
    currentDefinitionSignature,
    setServerValidationIssues: shell.setServerValidationIssues,
    setServerValidationIssueSourceSignature: shell.setServerValidationIssueSourceSignature,
    setMessage: shell.setMessage,
    setMessageTone: shell.setMessageTone,
    setMessageKind: shell.setMessageKind,
    setSavedWorkspaceStarter: shell.setSavedWorkspaceStarter,
    focusNode: graph.focusNode,
    setValidationFocusItem: shell.setValidationFocusItem
  });

  const serverValidationIssueCount = shell.serverValidationIssues.length;
  const clearServerValidationIssues = shell.setServerValidationIssues;

  const panels = useWorkflowEditorPanels({
    workflow,
    workflows,
    nodeCatalog,
    nodeSourceLanes,
    toolSourceLanes,
    tools,
    adapters,
    credentials,
    modelProviderCatalog,
    modelProviderConfigs,
    modelProviderRegistryStatus,
    callbackWaitingAutomation,
    sandboxReadiness,
    sandboxBackends,
    recentRuns,
    currentEditorHref,
    workflowLibraryHref,
    createWorkflowHref,
    workspaceStarterLibraryHref,
    hasScopedWorkspaceStarterFilters,
    workspaceStarterGovernanceQueryScope,
    editorNodeLibrary,
    plannedNodeLibrary,
    shell,
    graph,
    validation,
    runOverlay,
    persistence,
    onActivateRunOverlay: () => setHasRequestedRunOverlay(true)
  });

  useEffect(() => {
    if (serverValidationIssueCount === 0) {
      return;
    }

    if (persistedDefinitionSignature === currentDefinitionSignature) {
      return;
    }

    clearServerValidationIssues([]);
  }, [
    clearServerValidationIssues,
    currentDefinitionSignature,
    persistedDefinitionSignature,
    serverValidationIssueCount
  ]);

  const displayedNodes = applyRunOverlayToNodes(
    graph.nodes,
    runOverlay.selectedRunDetail,
    runOverlay.selectedRunTrace
  );
  const orderedEditorNodeLibrary = useMemo(
    () => sortWorkflowNodeCatalogForAuthoring(editorNodeLibrary),
    [editorNodeLibrary]
  );
  const canvasQuickAddOptions = useMemo<WorkflowCanvasQuickAddOption[]>(
    () =>
      orderedEditorNodeLibrary
        .filter((item) => item.type !== "startNode")
        .map((item) => ({
          type: item.type,
          label: item.label,
          description: item.description,
          capabilityGroup: item.capabilityGroup
        })),
    [orderedEditorNodeLibrary]
  );
  const canvasQuickAddOptionsRef = useRef(canvasQuickAddOptions);
  const focusNode = graph.focusNode;
  const selectedNodeId = graph.selectedNodeId;
  const displayedSelectedNode = useMemo(
    () => displayedNodes.find((node) => node.id === selectedNodeId) ?? graph.selectedNode,
    [displayedNodes, graph.selectedNode, selectedNodeId]
  );
  const handleCanvasQuickAdd = graph.handleAddNode;
  const handleCanvasDeleteNode = graph.handleDeleteNode;
  const handleCanvasQuickAddRef = useRef(handleCanvasQuickAdd);
  const handleCanvasDeleteNodeRef = useRef(handleCanvasDeleteNode);
  const handleCanvasOpenConfig = useCallback(
    (nodeId: string) => {
      focusNode(nodeId);
      lastAutoOpenedInspectorKeyRef.current = `node:${nodeId}`;
      setIsFloatingInspectorOpen(true);
    },
    [focusNode]
  );
  const handleOpenNodeRuntime = useCallback((nodeId: string) => {
    if (!nodeId) {
      return;
    }

    setIsFloatingInspectorOpen(true);
    shell.openNodeRuntime(nodeId);
  }, [shell]);
  const handleOpenNodeRuntimeRef = useRef(handleOpenNodeRuntime);

  canvasQuickAddOptionsRef.current = canvasQuickAddOptions;
  handleCanvasQuickAddRef.current = handleCanvasQuickAdd;
  handleCanvasDeleteNodeRef.current = handleCanvasDeleteNode;
  handleOpenNodeRuntimeRef.current = handleOpenNodeRuntime;

  const canvasNodeTypes = useMemo(
    () => ({
      workflowNode: (props: ComponentProps<typeof WorkflowCanvasNode>) => (
        <WorkflowCanvasNode
          {...props}
          quickAddOptions={canvasQuickAddOptionsRef.current}
          onOpenRuntime={handleOpenNodeRuntimeRef.current}
          onDeleteNode={(nodeId) => handleCanvasDeleteNodeRef.current(nodeId)}
          onQuickAdd={(sourceNodeId, type) =>
            handleCanvasQuickAddRef.current(type, { sourceNodeId })
          }
        />
      )
    }),
    []
  );
  const canvasEdgeTypes = useMemo(
    () => ({
      smoothstep: (props: ComponentProps<typeof WorkflowCanvasEdge>) => (
        <WorkflowCanvasEdge
          {...props}
          quickAddOptions={canvasQuickAddOptionsRef.current}
          onQuickAdd={(sourceNodeId, sourceEdgeId, type) =>
            handleCanvasQuickAddRef.current(type, { sourceNodeId, sourceEdgeId })
          }
        />
      )
    }),
    []
  );
  const hasInspectorTarget = Boolean(graph.selectedNode || graph.selectedEdge);
  const isFloatingInspectorVisible = Boolean(
    hasInspectorTarget && isFloatingInspectorOpen
  );
  const inspectorSurfaceTitle = graph.selectedNode?.data.label
    ?? (typeof graph.selectedEdge?.label === "string" ? graph.selectedEdge.label : null)
    ?? (graph.selectedEdgeId ? `连线 ${graph.selectedEdgeId}` : "配置面板");
  const inspectorSurfaceTitleNode = graph.selectedNode ? (
    <div
      className="workflow-editor-floating-panel-editable-title"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Input
        aria-label="节点名称"
        className="workflow-editor-floating-panel-title-input"
        placeholder="节点名称"
        variant="borderless"
        value={graph.selectedNode.data.label}
        onChange={(event) => graph.handleNodeNameChange(event.target.value)}
      />
    </div>
  ) : (
    inspectorSurfaceTitle
  );
  const workspaceStyle = useMemo(
    () =>
      ({
        "--workflow-editor-sidebar-width": "320px",
        "--workflow-editor-inspector-width": "420px",
        "--workflow-editor-floating-workbench-top": `${FLOATING_NODE_WORKBENCH_TOP}px`
      }) as CSSProperties,
    []
  );

  useEffect(() => {
    if (!selectedInspectorKey) {
      lastAutoOpenedInspectorKeyRef.current = null;
      setIsFloatingInspectorOpen(false);
      setFloatingWorkbenchPosition(null);
      return;
    }

    if (lastAutoOpenedInspectorKeyRef.current === selectedInspectorKey) {
      return;
    }

    lastAutoOpenedInspectorKeyRef.current = selectedInspectorKey;
    setIsFloatingInspectorOpen(true);
    setFloatingWorkbenchPosition(null);
  }, [selectedInspectorKey]);

  const handleToggleInspectorSurface = useCallback(() => {
    if (!selectedInspectorKey) {
      return;
    }

    setIsFloatingInspectorOpen((current) => !current);
  }, [selectedInspectorKey]);

  useEffect(() => {
    if (!isFloatingInspectorVisible) {
      return;
    }

    const stageElement = canvasStageRef.current;
    const workbenchElement = floatingWorkbenchRef.current;
    if (!stageElement || !workbenchElement) {
      return;
    }

    const stageRect = stageElement.getBoundingClientRect();
    const workbenchRect = workbenchElement.getBoundingClientRect();
    const bounds = {
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      panelWidth: workbenchRect.width,
      panelHeight: workbenchRect.height
    };

    if (!hasValidFloatingWorkbenchBounds(bounds)) {
      return;
    }

    setFloatingWorkbenchPosition((current) => {
      const nextPosition = clampFloatingWorkbenchPosition(
        current ?? resolveDefaultFloatingWorkbenchPosition(bounds.stageWidth),
        bounds
      );

      if (!Number.isFinite(nextPosition.x) || !Number.isFinite(nextPosition.y)) {
        return current;
      }

      return areFloatingWorkbenchPositionsEqual(current, nextPosition) ? current : nextPosition;
    });
  }, [isFloatingInspectorVisible, selectedInspectorKey]);

  useEffect(() => {
    if (!isFloatingWorkbenchDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = floatingWorkbenchDragStateRef.current;
      const stageElement = canvasStageRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId || !stageElement) {
        return;
      }

      const stageRect = stageElement.getBoundingClientRect();
      setFloatingWorkbenchPosition(
        clampFloatingWorkbenchPosition(
          {
            x: event.clientX - stageRect.left - dragState.pointerOffsetX,
            y: event.clientY - stageRect.top - dragState.pointerOffsetY
          },
          dragState
        )
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = floatingWorkbenchDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      floatingWorkbenchDragStateRef.current = null;
      setIsFloatingWorkbenchDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isFloatingWorkbenchDragging]);

  const handleCloseFloatingInspector = useCallback(() => {
    setIsFloatingInspectorOpen(false);
  }, []);

  const handleFloatingWorkbenchPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const stageElement = canvasStageRef.current;
      const workbenchElement = floatingWorkbenchRef.current;
      if (!stageElement || !workbenchElement) {
        return;
      }

      const stageRect = stageElement.getBoundingClientRect();
      const workbenchRect = workbenchElement.getBoundingClientRect();
      const currentPosition = floatingWorkbenchPosition ??
        resolveDefaultFloatingWorkbenchPosition(stageRect.width);

      floatingWorkbenchDragStateRef.current = {
        pointerId: event.pointerId,
        pointerOffsetX: event.clientX - (stageRect.left + currentPosition.x),
        pointerOffsetY: event.clientY - (stageRect.top + currentPosition.y),
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        panelWidth: workbenchRect.width,
        panelHeight: workbenchRect.height
      };
      setIsFloatingWorkbenchDragging(true);
      event.preventDefault();
    },
    [floatingWorkbenchPosition]
  );

  return (
    <main className="editor-shell" data-component="workflow-editor-workbench">
      <section
        className="editor-workspace"
        data-layout="canvas-overlay"
        data-inspector-open={isFloatingInspectorVisible ? "true" : "false"}
        style={workspaceStyle}
      >
        <section
          ref={canvasStageRef}
          className="editor-canvas-stage"
          data-component="workflow-editor-canvas-stage"
        >
          <LazyWorkflowEditorCanvas
            nodes={displayedNodes}
            edges={graph.edges}
            nodeTypes={canvasNodeTypes}
            edgeTypes={canvasEdgeTypes}
            onNodesChange={graph.onNodesChange}
            onEdgesChange={graph.onEdgesChange}
            onConnect={graph.onConnect}
            onSelectionChange={graph.handleSelectionChange}
            isInspectorOpen={isFloatingInspectorVisible}
            hasNodeAssistant={Boolean(graph.selectedNodeId)}
            canOpenInspector={hasInspectorTarget}
            canUndo={graph.canUndo}
            canRedo={graph.canRedo}
            onToggleInspector={handleToggleInspectorSurface}
            onNodeClick={handleCanvasOpenConfig}
            onOpenAssistant={shell.openNodeAssistant}
            persistBlockerSummary={panels.heroProps.persistBlockerSummary}
            isSaving={panels.heroProps.isSaving}
            isSavingStarter={panels.heroProps.isSavingStarter}
            onSave={panels.heroProps.onSave}
            onSaveAsWorkspaceStarter={panels.heroProps.onSaveAsWorkspaceStarter}
            onOpenRunLauncher={panels.heroProps.onOpenRunLauncher}
            onUndo={graph.undo}
            onRedo={graph.redo}
          />

          {isFloatingInspectorVisible ? (
            <WorkflowEditorFloatingPanel
              ref={floatingWorkbenchRef}
              panelKind={selectedNodeId ? "node-config" : "edge-config"}
              title={inspectorSurfaceTitleNode}
              closeLabel="关闭配置面板"
              closeAction="close-floating-inspector"
              onTrialRun={selectedNodeId ? () => handleOpenNodeRuntime(selectedNodeId) : undefined}
              dragging={isFloatingWorkbenchDragging}
              style={
                floatingWorkbenchPosition
                  ? {
                      left: `${floatingWorkbenchPosition.x}px`,
                      top: `${floatingWorkbenchPosition.y}px`
                    }
                  : {
                      right: `${FLOATING_NODE_WORKBENCH_MARGIN}px`,
                      top: `${FLOATING_NODE_WORKBENCH_TOP}px`
                    }
              }
              onClose={handleCloseFloatingInspector}
              onHeaderPointerDown={handleFloatingWorkbenchPointerDown}
            >
              <div
                className="workflow-editor-node-config-workbench-body"
                data-component="workflow-editor-node-config-workbench-body"
              >
                <WorkflowEditorInspector
                  {...panels.inspectorProps}
                  selectedNode={displayedSelectedNode ?? panels.inspectorProps.selectedNode}
                  nodes={displayedNodes}
                />
              </div>
            </WorkflowEditorFloatingPanel>
          ) : null}
        </section>

      </section>

      <WorkflowEditorRunLauncherSurface {...panels.runLauncherSurfaceProps} />
    </main>
  );
}
