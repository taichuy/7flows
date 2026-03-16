"use client";

import { useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import type { PluginAdapterRegistryItem, PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  WorkflowLibrarySourceLane,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type {
  WorkflowDefinitionPreflightIssue,
  WorkflowDetail,
  WorkflowListItem
} from "@/lib/get-workflows";
import type { WorkflowValidationFocusTarget } from "@/lib/workflow-validation-navigation";
import { getPaletteNodeCatalog, getPlannedNodeCatalog } from "@/lib/workflow-node-catalog";

import { WorkflowEditorCanvas } from "@/components/workflow-editor-workbench/workflow-editor-canvas";
import { WorkflowEditorHero } from "@/components/workflow-editor-workbench/workflow-editor-hero";
import { type WorkflowEditorMessageTone } from "@/components/workflow-editor-workbench/shared";
import { WorkflowEditorSidebar } from "@/components/workflow-editor-workbench/workflow-editor-sidebar";
import {
  applyRunOverlayToNodes,
  WORKFLOW_EDITOR_NODE_TYPES
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
  recentRuns: WorkflowRunListItem[];
};

export function WorkflowEditorWorkbench({
  workflow,
  workflows,
  nodeCatalog,
  nodeSourceLanes,
  toolSourceLanes,
  tools,
  adapters,
  recentRuns
}: WorkflowEditorWorkbenchProps) {
  const editorNodeLibrary = getPaletteNodeCatalog(nodeCatalog);
  const plannedNodeLibrary = getPlannedNodeCatalog(nodeCatalog);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkflowEditorMessageTone>("idle");
  const [serverValidationIssues, setServerValidationIssues] = useState<WorkflowDefinitionPreflightIssue[]>([]);
  const [validationFocusTarget, setValidationFocusTarget] =
    useState<WorkflowValidationFocusTarget | null>(null);

  const graph = useWorkflowEditorGraph({
    workflow,
    nodeCatalog,
    setMessage,
    setMessageTone
  });
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
    serverValidationIssues
  });
  const persistence = useWorkflowEditorPersistence({
    workflowId: workflow.id,
    fallbackWorkflowName: workflow.name,
    workflowName: graph.workflowName,
    workflowVersion: graph.workflowVersion,
    currentDefinition: graph.currentDefinition,
    persistBlockedMessage: validation.persistBlockedMessage,
    setPersistedWorkflowName: graph.setPersistedWorkflowName,
    setPersistedDefinition: graph.setPersistedDefinition,
    setWorkflowVersion: graph.setWorkflowVersion,
    setServerValidationIssues,
    setMessage,
    setMessageTone,
    focusNode: graph.focusNode,
    setValidationFocusTarget
  });

  const displayedNodes = applyRunOverlayToNodes(
    graph.nodes,
    runOverlay.selectedRunDetail,
    runOverlay.selectedRunTrace
  );
  const selectedNode = displayedNodes.find((node) => node.id === graph.selectedNodeId) ?? null;
  const selectedEdge = graph.edges.find((edge) => edge.id === graph.selectedEdgeId) ?? null;

  return (
    <ReactFlowProvider>
      <main className="editor-shell">
        <WorkflowEditorHero
          workflowId={workflow.id}
          workflowVersion={graph.workflowVersion}
          nodesCount={graph.nodes.length}
          edgesCount={graph.edges.length}
          toolsCount={tools.length}
          availableRunsCount={runOverlay.availableRuns.length}
          isDirty={graph.isDirty}
          selectedNodeLabel={selectedNode?.data.label ?? null}
          selectedEdgeId={selectedEdge?.id ?? null}
          workflowsCount={workflows.length}
          selectedRunAttached={Boolean(runOverlay.selectedRunId)}
          plannedNodeLabels={plannedNodeLibrary.map((item) => item.label)}
          unsupportedNodes={validation.unsupportedNodes}
          contractValidationIssuesCount={validation.contractValidationIssues.length}
          toolReferenceValidationIssuesCount={validation.toolReferenceValidationIssues.length}
          toolExecutionValidationIssuesCount={validation.toolExecutionValidationIssues.length}
          publishVersionValidationIssuesCount={validation.publishVersionValidationIssues.length}
          persistBlockedMessage={validation.persistBlockedMessage || null}
          isSaving={persistence.isSaving}
          isSavingStarter={persistence.isSavingStarter}
          onSave={persistence.handleSave}
          onSaveAsWorkspaceStarter={persistence.handleSaveAsWorkspaceStarter}
        />

        <section className="editor-workspace">
          <WorkflowEditorSidebar
            workflowId={workflow.id}
            workflowName={graph.workflowName}
            workflows={workflows}
            nodeSourceLanes={nodeSourceLanes}
            toolSourceLanes={toolSourceLanes}
            editorNodeLibrary={editorNodeLibrary}
            plannedNodeLibrary={plannedNodeLibrary}
            unsupportedNodes={validation.unsupportedNodes}
            message={message}
            messageTone={messageTone}
            validationNavigatorItems={validation.validationNavigatorItems}
            runs={runOverlay.availableRuns}
            selectedRunId={runOverlay.selectedRunId}
            run={runOverlay.selectedRunDetail}
            trace={runOverlay.selectedRunTrace}
            traceError={runOverlay.runOverlayError}
            selectedNodeId={graph.selectedNodeId}
            isLoadingRunOverlay={runOverlay.isLoadingRunOverlay}
            isRefreshingRuns={runOverlay.isRefreshingRuns}
            onWorkflowNameChange={graph.setWorkflowName}
            onAddNode={graph.handleAddNode}
            onNavigateValidationIssue={persistence.handleNavigateValidationIssue}
            onSelectRunId={runOverlay.setSelectedRunId}
            onRefreshRuns={runOverlay.refreshRecentRuns}
          />

          <WorkflowEditorCanvas
            nodes={displayedNodes}
            edges={graph.edges}
            nodeTypes={WORKFLOW_EDITOR_NODE_TYPES}
            onNodesChange={graph.onNodesChange}
            onEdgesChange={graph.onEdgesChange}
            onConnect={graph.onConnect}
            onSelectionChange={graph.handleSelectionChange}
          />

          <aside className="editor-inspector">
            <WorkflowEditorInspector
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              nodes={graph.nodes}
              edges={graph.edges}
              tools={tools}
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
              highlightedNodeSection={
                validationFocusTarget?.scope === "node" &&
                validationFocusTarget.nodeId === graph.selectedNodeId
                  ? validationFocusTarget.section
                  : null
              }
              highlightedPublishEndpointIndex={
                validationFocusTarget?.scope === "publish"
                  ? validationFocusTarget.endpointIndex
                  : null
              }
              highlightedPublishEndpointFieldPath={
                validationFocusTarget?.scope === "publish"
                  ? validationFocusTarget.fieldPath ?? null
                  : null
              }
              highlightedVariableIndex={
                validationFocusTarget?.scope === "variables"
                  ? validationFocusTarget.variableIndex
                  : null
              }
              highlightedVariableFieldPath={
                validationFocusTarget?.scope === "variables"
                  ? validationFocusTarget.fieldPath ?? null
                  : null
              }
            />
          </aside>
        </section>
      </main>
    </ReactFlowProvider>
  );
}
