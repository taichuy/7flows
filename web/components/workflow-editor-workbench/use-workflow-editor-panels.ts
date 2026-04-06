import { useMemo, useEffect, useState } from "react";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import { pickWorkflowValidationRemediationItem } from "@/lib/workflow-validation-remediation";
import { buildWorkflowPersistBlockerRecommendedNextStep, summarizeWorkflowPersistBlockers } from "@/components/workflow-editor-workbench/persist-blockers";

import type {
  UseWorkflowEditorPanelsArgs,
  UseWorkflowEditorPanelsResult
} from "@/components/workflow-editor-workbench/types";

export function useWorkflowEditorPanels({
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
  onActivateRunOverlay
}: UseWorkflowEditorPanelsArgs): UseWorkflowEditorPanelsResult {
  useEffect(() => {
    if (graph.selectedNodeId || graph.selectedEdgeId) {
      shell.setIsInspectorCollapsed(false);
    }
  }, [graph.selectedNodeId, graph.selectedEdgeId, shell]);

  const sandboxReadinessPreflightHint = useMemo(
    () => formatSandboxReadinessPreflightHint(sandboxReadiness),
    [sandboxReadiness]
  );
  const executionPreflightMessage = useMemo(() => {
    if (validation.toolExecutionValidationIssues.length > 0) {
      return [
        `保存前还有 ${validation.toolExecutionValidationIssues.length} 个 execution capability 问题。`,
        sandboxReadinessPreflightHint,
        "先对齐 tool binding、tool 节点 runtimePolicy / LLM Agent tool policy，以及 live sandbox readiness，再继续保存。"
      ]
        .filter(Boolean)
        .join(" ");
    }

    return sandboxReadinessPreflightHint;
  }, [sandboxReadinessPreflightHint, validation.toolExecutionValidationIssues.length]);
  const preflightValidationItem = useMemo(
    () => pickWorkflowValidationRemediationItem(validation.validationNavigatorItems),
    [validation.validationNavigatorItems]
  );
  const persistBlockerSummary = useMemo(
    () => summarizeWorkflowPersistBlockers(validation.persistBlockers),
    [validation.persistBlockers]
  );
  const persistBlockerRecommendedNextStep = useMemo(
    () =>
      buildWorkflowPersistBlockerRecommendedNextStep(
        validation.persistBlockers,
        sandboxReadiness,
        currentEditorHref
      ),
    [currentEditorHref, sandboxReadiness, validation.persistBlockers]
  );
  
  const inspectorFocusState = shell.getInspectorFocusState(graph.selectedNodeId);

  const [isRunLauncherOpen, setIsRunLauncherOpen] = useState(false);

  const heroProps: UseWorkflowEditorPanelsResult["heroProps"] = {
    workflowName: graph.workflowName,
    onWorkflowNameChange: graph.setWorkflowName,
    workflowVersion: graph.workflowVersion,
    nodesCount: graph.nodes.length,
    edgesCount: graph.edges.length,
    toolsCount: tools.length,
    availableRunsCount: runOverlay.availableRuns.length,
    isDirty: graph.isDirty,
    selectedNodeLabel: graph.selectedNode?.data.label ?? null,
    selectedEdgeId: graph.selectedEdge?.id ?? null,
    selectedRunAttached: Boolean(runOverlay.selectedRunId),
    contractValidationIssuesCount: validation.contractValidationIssues.length,
    toolReferenceValidationIssuesCount: validation.toolReferenceValidationIssues.length,
    nodeExecutionValidationIssuesCount: validation.nodeExecutionValidationIssues.length,
    toolExecutionValidationIssuesCount: validation.toolExecutionValidationIssues.length,
    publishDraftValidationIssuesCount: validation.publishDraftValidationIssues.length,
    persistBlockerSummary,
    isSaving: persistence.isSaving,
    isSavingStarter: persistence.isSavingStarter,
    isSidebarCollapsed: shell.isSidebarCollapsed,
    isInspectorCollapsed: shell.isInspectorCollapsed,
    hasNodeAssistant: Boolean(graph.selectedNodeId),
    onToggleInspector: shell.toggleInspector,
    onOpenAssistant: shell.openNodeAssistant,
    onSave: persistence.handleSave,
    onSaveAsWorkspaceStarter: persistence.handleSaveAsWorkspaceStarter,
    onOpenRunLauncher: () => setIsRunLauncherOpen(true)
  };

  const sidebarProps: UseWorkflowEditorPanelsResult["sidebarProps"] = {
    currentHref: currentEditorHref,
    workflowId: workflow.id,
    workflowName: graph.workflowName,
    workflowVersion: graph.workflowVersion,
    workflowStageLabel:
      typeof workflow.publish_count === "number" && workflow.publish_count > 0
        ? "publish ready"
        : "draft only",
    workflowLibraryHref,
    workflows,
    nodeSourceLanes,
    toolSourceLanes,
    editorNodeLibrary,
    plannedNodeLibrary,
    unsupportedNodes: validation.unsupportedNodes,
    message: shell.message,
    messageTone: shell.messageTone,
    messageKind: shell.messageKind,
    savedWorkspaceStarter: shell.savedWorkspaceStarter,
    persistBlockerSummary,
    persistBlockers: validation.persistBlockers,
    persistBlockerRecommendedNextStep,
    executionPreflightMessage,
    toolExecutionValidationIssueCount: validation.toolExecutionValidationIssues.length,
    focusedValidationItem: shell.validationFocusItem,
    preflightValidationItem,
    validationNavigatorItems: validation.validationNavigatorItems,
    runs: runOverlay.availableRuns,
    selectedRunId: runOverlay.selectedRunId,
    run: runOverlay.selectedRunDetail,
    runSnapshot: runOverlay.selectedRunSnapshot,
    trace: runOverlay.selectedRunTrace,
    traceError: runOverlay.runOverlayError,
    selectedNodeId: graph.selectedNodeId,
    authoringSourceNodeId:
      graph.selectedNode?.id ??
      graph.nodes.find((node) => node.data.nodeType === "trigger")?.id ??
      null,
    authoringSourceNodeLabel:
      graph.selectedNode?.data.label ??
      graph.nodes.find((node) => node.data.nodeType === "trigger")?.data.label ??
      null,
    authoringSourceContext: graph.selectedNode
      ? "selected"
      : graph.nodes.some((node) => node.data.nodeType === "trigger")
        ? "default_trigger"
        : null,
    callbackWaitingAutomation,
    sandboxReadiness,
    workspaceStarterGovernanceQueryScope,
    createWorkflowHref,
    workspaceStarterLibraryHref,
    hasScopedWorkspaceStarterFilters,
    isLoadingRunOverlay: runOverlay.isLoadingRunOverlay,
    isRefreshingRuns: runOverlay.isRefreshingRuns,
    onCollapse: shell.toggleSidebar,
    onActiveTabChange: (tabKey) => {
      if (tabKey === "3") {
        onActivateRunOverlay();
      }
    },
    onAddNode: graph.handleAddNode,
    onNavigateValidationIssue: persistence.handleNavigateValidationIssue,
    onSelectRunId: runOverlay.setSelectedRunId,
    onRefreshRuns: runOverlay.refreshRecentRuns
  };

  const inspectorProps: UseWorkflowEditorPanelsResult["inspectorProps"] = {
    workflowId: workflow.id,
    currentHref: currentEditorHref,
    selectedNode: graph.selectedNode,
    selectedEdge: graph.selectedEdge,
    nodes: graph.nodes,
    edges: graph.edges,
    tools,
    adapters,
    credentials,
    modelProviderCatalog,
    modelProviderConfigs,
    modelProviderRegistryStatus,
    nodeConfigText: graph.nodeConfigText,
    onNodeConfigTextChange: graph.setNodeConfigText,
    onApplyNodeConfigJson: graph.applyNodeConfigJson,
    onNodeNameChange: graph.handleNodeNameChange,
    onNodeConfigChange: graph.handleSelectedNodeConfigChange,
    onNodeInputSchemaChange: graph.updateNodeInputSchema,
    onNodeOutputSchemaChange: graph.updateNodeOutputSchema,
    onNodeRuntimePolicyUpdate: graph.updateNodeRuntimePolicy,
    onNodeRuntimePolicyChange: graph.handleNodeRuntimePolicyChange,
    workflowVersion: graph.workflowVersion,
    availableWorkflowVersions: validation.availableWorkflowVersions,
    workflowVariables: graph.workflowVariables,
    workflowPublish: graph.workflowPublish,
    onWorkflowVariablesChange: graph.updateWorkflowVariables,
    onWorkflowPublishChange: graph.updateWorkflowPublish,
    onDeleteSelectedNode: graph.handleDeleteSelectedNode,
    onUpdateSelectedEdge: graph.updateSelectedEdge,
    onDeleteSelectedEdge: graph.handleDeleteSelectedEdge,
    highlightedNodeSection: inspectorFocusState.highlightedNodeSection,
    highlightedNodeFieldPath: inspectorFocusState.highlightedNodeFieldPath,
    highlightedPublishEndpointIndex: inspectorFocusState.highlightedPublishEndpointIndex,
    highlightedPublishEndpointFieldPath: inspectorFocusState.highlightedPublishEndpointFieldPath,
    highlightedVariableIndex: inspectorFocusState.highlightedVariableIndex,
    highlightedVariableFieldPath: inspectorFocusState.highlightedVariableFieldPath,
    focusedValidationItem: shell.validationFocusItem,
    persistBlockedMessage: validation.persistBlockedMessage || null,
    persistBlockerSummary,
    persistBlockers: validation.persistBlockers,
    persistBlockerRecommendedNextStep,
    assistantRequestSerial: shell.assistantRequestSerial,
    sandboxReadiness,
    onRuntimeRunSuccess: (runId) => {
      shell.setMessage("工作流已触发运行");
      shell.setMessageTone("success");

      if (shell.isSidebarCollapsed) {
        shell.toggleSidebar();
      }

      if (runId) {
        runOverlay.setSelectedRunId(runId);
      }

      onActivateRunOverlay();
    },
    onRuntimeRunError: (message) => {
      shell.setMessage(message);
      shell.setMessageTone("error");
    },
    onOpenRunOverlay: onActivateRunOverlay
  };

  const runLauncherSurfaceProps = {
    workflowId: workflow.id,
    open: isRunLauncherOpen,
    onClose: () => setIsRunLauncherOpen(false),
    workflowVariables: graph.workflowVariables,
    onRunSuccess: ({ runId }: { runId?: string | null }) => {
      setIsRunLauncherOpen(false);
      shell.setMessage("工作流已触发运行");
      shell.setMessageTone("success");

      if (shell.isSidebarCollapsed) {
        shell.toggleSidebar();
      }
      if (runId) {
        runOverlay.setSelectedRunId(runId);
      }
    },
    onRunError: (message: string) => {
      shell.setMessage(message);
      shell.setMessageTone("error");
    }
  };

  return {
    heroProps,
    sidebarProps,
    inspectorProps,
    runLauncherSurfaceProps
  };
}
