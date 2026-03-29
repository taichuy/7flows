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
  const persistence = useWorkflowEditorPersistence({
    workflowId: workflow.id,
    fallbackWorkflowName: workflow.name,
    workflowName: graph.workflowName,
    workflowVersion: graph.workflowVersion,
    currentDefinition: graph.currentDefinition,
    persistBlockerSummary,
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
        <WorkflowEditorHero
          currentHref={currentEditorHref}
          workflowId={workflow.id}
          workflowName={graph.workflowName}
          onWorkflowNameChange={graph.setWorkflowName}
          workflowVersion={graph.workflowVersion}
          nodesCount={graph.nodes.length}
          edgesCount={graph.edges.length}
          toolsCount={tools.length}
          availableRunsCount={runOverlay.availableRuns.length}
          isDirty={graph.isDirty}
          selectedNodeLabel={graph.selectedNode?.data.label ?? null}
          selectedEdgeId={graph.selectedEdge?.id ?? null}
          workflowsCount={workflows.length}
          selectedRunAttached={Boolean(runOverlay.selectedRunId)}
          plannedNodeLabels={plannedNodeLibrary.map((item) => item.label)}
          unsupportedNodes={validation.unsupportedNodes}
          contractValidationIssuesCount={validation.contractValidationIssues.length}
          toolReferenceValidationIssuesCount={validation.toolReferenceValidationIssues.length}
          nodeExecutionValidationIssuesCount={validation.nodeExecutionValidationIssues.length}
          toolExecutionValidationIssuesCount={validation.toolExecutionValidationIssues.length}
          publishDraftValidationIssuesCount={validation.publishDraftValidationIssues.length}
          persistBlockedMessage={validation.persistBlockedMessage || null}
          persistBlockerSummary={persistBlockerSummary}
          persistBlockers={validation.persistBlockers}
          persistBlockerRecommendedNextStep={persistBlockerRecommendedNextStep}
          isSaving={persistence.isSaving}
          isSavingStarter={persistence.isSavingStarter}
          workflowLibraryHref={workflowLibraryHref}
          createWorkflowHref={createWorkflowHref}
          workspaceStarterLibraryHref={workspaceStarterLibraryHref}
          hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
          isSidebarCollapsed={shell.isSidebarCollapsed}
          isInspectorCollapsed={shell.isInspectorCollapsed}
          onToggleSidebar={shell.toggleSidebar}
          onToggleInspector={shell.toggleInspector}
          onSave={persistence.handleSave}
          onSaveAsWorkspaceStarter={persistence.handleSaveAsWorkspaceStarter}
        />

        <section className={editorWorkspaceClassName}>
          {shell.isSidebarCollapsed ? null : (
            <WorkflowEditorSidebar
              currentHref={currentEditorHref}
              workflowId={workflow.id}
              workflowName={graph.workflowName}
              workflows={workflows}
              nodeSourceLanes={nodeSourceLanes}
              toolSourceLanes={toolSourceLanes}
              editorNodeLibrary={editorNodeLibrary}
              plannedNodeLibrary={plannedNodeLibrary}
              unsupportedNodes={validation.unsupportedNodes}
              message={shell.message}
              messageTone={shell.messageTone}
              messageKind={shell.messageKind}
              savedWorkspaceStarter={shell.savedWorkspaceStarter}
              persistBlockerSummary={persistBlockerSummary}
              persistBlockers={validation.persistBlockers}
              persistBlockerRecommendedNextStep={persistBlockerRecommendedNextStep}
              executionPreflightMessage={executionPreflightMessage}
              toolExecutionValidationIssueCount={validation.toolExecutionValidationIssues.length}
              focusedValidationItem={shell.validationFocusItem}
              preflightValidationItem={preflightValidationItem}
              validationNavigatorItems={validation.validationNavigatorItems}
              runs={runOverlay.availableRuns}
              selectedRunId={runOverlay.selectedRunId}
              run={runOverlay.selectedRunDetail}
              runSnapshot={runOverlay.selectedRunSnapshot}
              trace={runOverlay.selectedRunTrace}
              traceError={runOverlay.runOverlayError}
              selectedNodeId={graph.selectedNodeId}
              callbackWaitingAutomation={callbackWaitingAutomation}
              sandboxReadiness={sandboxReadiness}
              workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
              createWorkflowHref={createWorkflowHref}
              workspaceStarterLibraryHref={workspaceStarterLibraryHref}
              hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
              isLoadingRunOverlay={runOverlay.isLoadingRunOverlay}
              isRefreshingRuns={runOverlay.isRefreshingRuns}
              onAddNode={graph.handleAddNode}
              onNavigateValidationIssue={persistence.handleNavigateValidationIssue}
              onSelectRunId={runOverlay.setSelectedRunId}
              onRefreshRuns={runOverlay.refreshRecentRuns}
            />
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
              <WorkflowEditorInspector
                currentHref={currentEditorHref}
                selectedNode={graph.selectedNode}
                selectedEdge={graph.selectedEdge}
                nodes={graph.nodes}
                edges={graph.edges}
                tools={tools}
                adapters={adapters}
                nodeConfigText={graph.nodeConfigText}
                onNodeConfigTextChange={graph.setNodeConfigText}
                onApplyNodeConfigJson={graph.applyNodeConfigJson}
                onNodeNameChange={graph.handleNodeNameChange}
                onNodeConfigChange={graph.handleSelectedNodeConfigChange}
                onNodeInputSchemaChange={graph.updateNodeInputSchema}
                onNodeOutputSchemaChange={graph.updateNodeOutputSchema}
                onNodeRuntimePolicyUpdate={graph.updateNodeRuntimePolicy}
                onNodeRuntimePolicyChange={graph.handleNodeRuntimePolicyChange}
                workflowVersion={graph.workflowVersion}
                availableWorkflowVersions={validation.availableWorkflowVersions}
                workflowVariables={graph.workflowVariables}
                workflowPublish={graph.workflowPublish}
                onWorkflowVariablesChange={graph.updateWorkflowVariables}
                onWorkflowPublishChange={graph.updateWorkflowPublish}
                onDeleteSelectedNode={graph.handleDeleteSelectedNode}
                onUpdateSelectedEdge={graph.updateSelectedEdge}
                onDeleteSelectedEdge={graph.handleDeleteSelectedEdge}
                highlightedNodeSection={inspectorFocusState.highlightedNodeSection}
                highlightedNodeFieldPath={inspectorFocusState.highlightedNodeFieldPath}
                highlightedPublishEndpointIndex={
                  inspectorFocusState.highlightedPublishEndpointIndex
                }
                highlightedPublishEndpointFieldPath={
                  inspectorFocusState.highlightedPublishEndpointFieldPath
                }
                highlightedVariableIndex={inspectorFocusState.highlightedVariableIndex}
                highlightedVariableFieldPath={inspectorFocusState.highlightedVariableFieldPath}
                focusedValidationItem={shell.validationFocusItem}
                persistBlockedMessage={validation.persistBlockedMessage || null}
                persistBlockerSummary={persistBlockerSummary}
                persistBlockers={validation.persistBlockers}
                persistBlockerRecommendedNextStep={persistBlockerRecommendedNextStep}
                sandboxReadiness={sandboxReadiness}
              />
            </aside>
          )}
        </section>
      </main>
    </ReactFlowProvider>
  );
}
