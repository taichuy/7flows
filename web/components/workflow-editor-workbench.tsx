"use client";

import { useEffect, useMemo, type ComponentProps } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import type { PluginAdapterRegistryItem, PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  CallbackWaitingAutomationCheck,
  SandboxBackendCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type {
  WorkflowLibrarySourceLane,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type {
  WorkflowDetail,
  WorkflowListItem
} from "@/lib/get-workflows";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import { pickWorkflowValidationRemediationItem } from "@/lib/workflow-validation-remediation";
import { getPaletteNodeCatalog, getPlannedNodeCatalog } from "@/lib/workflow-node-catalog";

import { WorkflowEditorCanvas } from "@/components/workflow-editor-workbench/workflow-editor-canvas";
import { WorkflowEditorHero } from "@/components/workflow-editor-workbench/workflow-editor-hero";
import { useWorkflowEditorShellState } from "@/components/workflow-editor-workbench/use-workflow-editor-shell-state";
import { useWorkflowEditorPanels } from "@/components/workflow-editor-workbench/use-workflow-editor-panels";
import { WorkflowEditorSidebar } from "@/components/workflow-editor-workbench/workflow-editor-sidebar";
import {
  buildWorkflowPersistBlockerRecommendedNextStep,
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
import { WorkflowEditorInspector } from "@/components/workflow-editor-inspector";
import { WorkflowRunLauncher } from "@/components/workflow-run-launcher";

type WorkflowEditorWorkbenchProps = {
  workflow: WorkflowDetail;
  workflows: WorkflowListItem[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
  recentRuns: WorkflowRunListItem[];
  currentEditorHref?: string;
  workflowLibraryHref?: string;
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
  hasScopedWorkspaceStarterFilters?: boolean;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
};

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
  recentRuns,
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
  const currentDefinitionSignature = useMemo(
    () => JSON.stringify(graph.currentDefinition),
    [graph.currentDefinition]
  );
  const runOverlay = useWorkflowRunOverlay({
    workflowId: workflow.id,
    recentRuns
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
    persistence
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
  const canvasQuickAddOptions = useMemo<WorkflowCanvasQuickAddOption[]>(
    () =>
      editorNodeLibrary
        .filter((item) => item.type !== "trigger")
        .map((item) => ({
          type: item.type,
          label: item.label,
          description: item.description,
          capabilityGroup: item.capabilityGroup
        })),
    [editorNodeLibrary]
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
  const inspectorFocusState = shell.getInspectorFocusState(graph.selectedNodeId);
  const editorWorkspaceClassName = [
    "editor-workspace",
    shell.isSidebarCollapsed ? "sidebar-collapsed" : null,
    shell.isInspectorCollapsed ? "inspector-collapsed" : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ReactFlowProvider>
      <main className="editor-shell">
        <WorkflowEditorHero {...panels.heroProps} />

        <section className={editorWorkspaceClassName}>
          {shell.isSidebarCollapsed ? null : (
            <WorkflowEditorSidebar {...panels.sidebarProps} />
          )}

          <WorkflowEditorCanvas
            nodes={displayedNodes}
            edges={graph.edges}
            nodeTypes={canvasNodeTypes}
            onNodesChange={graph.onNodesChange}
            onEdgesChange={graph.onEdgesChange}
            onConnect={graph.onConnect}
            onSelectionChange={graph.handleSelectionChange}
          />

          {shell.isInspectorCollapsed ? null : (
            <aside className="editor-inspector">
              <WorkflowEditorInspector {...panels.inspectorProps} />
            </aside>
          )}
        </section>

        <WorkflowRunLauncher {...panels.runLauncherProps} />
      </main>
    </ReactFlowProvider>
  );
}
