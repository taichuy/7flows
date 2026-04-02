"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { Drawer } from "antd";

import {
  getPaletteNodeCatalog,
  getPlannedNodeCatalog,
  sortWorkflowNodeCatalogForAuthoring
} from "@/lib/workflow-node-catalog";

import { WorkflowEditorHero } from "@/components/workflow-editor-workbench/workflow-editor-hero";
import { useWorkflowEditorShellState } from "@/components/workflow-editor-workbench/use-workflow-editor-shell-state";
import { useWorkflowEditorPanels } from "@/components/workflow-editor-workbench/use-workflow-editor-panels";
import { WorkflowEditorSidebar } from "@/components/workflow-editor-workbench/workflow-editor-sidebar";
import {
  summarizeWorkflowPersistBlockers
} from "@/components/workflow-editor-workbench/persist-blockers";
import {
  applyRunOverlayToNodes,
  WorkflowCanvasNode,
  type WorkflowCanvasQuickAddOption
} from "@/components/workflow-editor-workbench/workflow-canvas-node";
import { useWorkflowEditorGraph } from "@/components/workflow-editor-workbench/use-workflow-editor-graph";
import { useWorkflowEditorPersistence } from "@/components/workflow-editor-workbench/use-workflow-editor-persistence";
import { useWorkflowEditorValidation } from "@/components/workflow-editor-workbench/use-workflow-editor-validation";
import { useWorkflowRunOverlay } from "@/components/workflow-editor-workbench/use-workflow-run-overlay";
import { WorkflowEditorRunLauncherSurface } from "@/components/workflow-editor-workbench/workflow-editor-run-launcher-surface";
import { WorkflowEditorInspector } from "@/components/workflow-editor-inspector";
import { useWorkflowEditorRuntimeData } from "@/components/workflow-editor-workbench/use-workflow-editor-runtime-data";
import type { WorkflowEditorCanvasProps } from "@/components/workflow-editor-workbench/workflow-editor-canvas";
import type { WorkflowEditorWorkbenchProps } from "@/components/workflow-editor-workbench/types";

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
            <p>先稳定输出 editor chrome、节点目录摘要和 inspector 壳层，再接入 xyflow 画布。</p>
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
  const editorNodeLibrary = getPaletteNodeCatalog(nodeCatalog);
  const plannedNodeLibrary = getPlannedNodeCatalog(nodeCatalog);
  const persistedDefinitionSignature = useMemo(
    () => JSON.stringify(workflow.definition),
    [workflow.definition]
  );
  const shell = useWorkflowEditorShellState({
    persistedDefinitionSignature,
    initialServerValidationIssues: workflow.definition_issues ?? []
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
        .filter((item) => item.type !== "trigger")
        .map((item) => ({
          type: item.type,
          label: item.label,
          description: item.description,
          capabilityGroup: item.capabilityGroup
        })),
    [orderedEditorNodeLibrary]
  );
  const handleCanvasQuickAdd = graph.handleAddNode;
  const handleCanvasDeleteNode = graph.handleDeleteNode;
  const handleCanvasOpenConfig = graph.focusNode;
  const canvasNodeTypes = useMemo(
    () => ({
      workflowNode: (props: ComponentProps<typeof WorkflowCanvasNode>) => (
        <WorkflowCanvasNode
          {...props}
          quickAddOptions={canvasQuickAddOptions}
          onDeleteNode={(nodeId) => handleCanvasDeleteNode(nodeId)}
          onOpenConfig={(nodeId) => handleCanvasOpenConfig(nodeId)}
          onQuickAdd={(sourceNodeId, type) =>
            handleCanvasQuickAdd(type, { sourceNodeId })
          }
        />
      )
    }),
    [canvasQuickAddOptions, handleCanvasDeleteNode, handleCanvasOpenConfig, handleCanvasQuickAdd]
  );
  const isSidebarOpen = !shell.isSidebarCollapsed;
  const isInspectorOpen = !shell.isInspectorCollapsed;
  const hasCanvasSelection = Boolean(graph.selectedNodeId || graph.selectedEdgeId);

  return (
    <main className="editor-shell" data-component="workflow-editor-workbench">
      <WorkflowEditorHero {...panels.heroProps} />

      <section className="editor-workspace">
        <LazyWorkflowEditorCanvas
          nodes={displayedNodes}
          edges={graph.edges}
          nodeTypes={canvasNodeTypes}
          onNodesChange={graph.onNodesChange}
          onEdgesChange={graph.onEdgesChange}
          onConnect={graph.onConnect}
          onSelectionChange={graph.handleSelectionChange}
          isSidebarOpen={isSidebarOpen}
          isInspectorOpen={isInspectorOpen}
          hasSelection={hasCanvasSelection}
          hasNodeAssistant={Boolean(graph.selectedNodeId)}
          canUndo={graph.canUndo}
          canRedo={graph.canRedo}
          onToggleSidebar={shell.toggleSidebar}
          onToggleInspector={shell.toggleInspector}
          onOpenAssistant={shell.openNodeAssistant}
          onUndo={graph.undo}
          onRedo={graph.redo}
        />
      </section>

      <Drawer
        open={isSidebarOpen}
        placement="left"
        width={360}
        title={null}
        closable={false}
        getContainer={false}
        mask={false}
        destroyOnClose={false}
        bodyStyle={{ padding: 0 }}
        className="workflow-editor-floating-drawer workflow-editor-sidebar-drawer"
        onClose={() => shell.setIsSidebarCollapsed(true)}
      >
        <div
          className="workflow-editor-drawer-panel"
          data-component="workflow-editor-sidebar-drawer"
        >
          <WorkflowEditorSidebar {...panels.sidebarProps} />
        </div>
      </Drawer>

      <Drawer
        open={isInspectorOpen}
        placement="right"
        width={420}
        title={null}
        closable={false}
        getContainer={false}
        mask={false}
        destroyOnClose={false}
        bodyStyle={{ padding: 0 }}
        className="workflow-editor-floating-drawer workflow-editor-inspector-drawer"
        onClose={() => shell.setIsInspectorCollapsed(true)}
      >
        <div
          className="workflow-editor-drawer-panel"
          data-component="workflow-editor-inspector-drawer"
        >
          <WorkflowEditorInspector {...panels.inspectorProps} />
        </div>
      </Drawer>

      <WorkflowEditorRunLauncherSurface {...panels.runLauncherSurfaceProps} />
    </main>
  );
}
