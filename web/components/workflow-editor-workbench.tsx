"use client";

import { useEffect, useMemo, useState } from "react";
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
  WorkflowDefinitionPreflightIssue,
  WorkflowDetail,
  WorkflowListItem
} from "@/lib/get-workflows";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import { pickWorkflowValidationRemediationItem } from "@/lib/workflow-validation-remediation";
import { getPaletteNodeCatalog, getPlannedNodeCatalog } from "@/lib/workflow-node-catalog";

import { WorkflowEditorCanvas } from "@/components/workflow-editor-workbench/workflow-editor-canvas";
import { WorkflowEditorHero } from "@/components/workflow-editor-workbench/workflow-editor-hero";
import {
  type WorkflowEditorMessageKind,
  type WorkflowEditorMessageTone
} from "@/components/workflow-editor-workbench/shared";
import { WorkflowEditorSidebar } from "@/components/workflow-editor-workbench/workflow-editor-sidebar";
import {
  buildWorkflowPersistBlockerRecommendedNextStep,
  summarizeWorkflowPersistBlockers
} from "@/components/workflow-editor-workbench/persist-blockers";
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
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkflowEditorMessageTone>("idle");
  const [messageKind, setMessageKind] = useState<WorkflowEditorMessageKind>("default");
  const persistedDefinitionSignature = useMemo(
    () => JSON.stringify(workflow.definition),
    [workflow.definition]
  );
  const [serverValidationIssues, setServerValidationIssues] = useState<WorkflowDefinitionPreflightIssue[]>(
    workflow.definition_issues ?? []
  );
  const [serverValidationIssueSourceSignature, setServerValidationIssueSourceSignature] =
    useState<string>(persistedDefinitionSignature);
  const [validationFocusItem, setValidationFocusItem] =
    useState<WorkflowValidationNavigatorItem | null>(null);

  const graph = useWorkflowEditorGraph({
    workflow,
    nodeCatalog,
    setMessage,
    setMessageTone
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
    serverValidationIssues
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
    persistBlockedMessage: validation.persistBlockedMessage,
    validationNavigatorItems: validation.validationNavigatorItems,
    sandboxReadiness,
    setPersistedWorkflowName: graph.setPersistedWorkflowName,
    setPersistedDefinition: graph.setPersistedDefinition,
    setWorkflowVersion: graph.setWorkflowVersion,
    currentDefinitionSignature,
    setServerValidationIssues,
    setServerValidationIssueSourceSignature,
    setMessage,
    setMessageTone,
    setMessageKind,
    focusNode: graph.focusNode,
    setValidationFocusItem
  });

  useEffect(() => {
    if (messageKind !== "workspace_starter_saved") {
      return;
    }

    if (messageTone === "success" && message?.startsWith("已保存 workspace starter：")) {
      return;
    }

    setMessageKind("default");
  }, [message, messageKind, messageTone]);

  useEffect(() => {
    setServerValidationIssues(workflow.definition_issues ?? []);
    setServerValidationIssueSourceSignature(persistedDefinitionSignature);
  }, [persistedDefinitionSignature, workflow.definition_issues]);

  useEffect(() => {
    if (serverValidationIssues.length === 0) {
      return;
    }
    if (serverValidationIssueSourceSignature === currentDefinitionSignature) {
      return;
    }
    setServerValidationIssues([]);
  }, [
    currentDefinitionSignature,
    serverValidationIssueSourceSignature,
    serverValidationIssues.length
  ]);

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
          onSave={persistence.handleSave}
          onSaveAsWorkspaceStarter={persistence.handleSaveAsWorkspaceStarter}
        />

        <section className="editor-workspace">
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
            message={message}
            messageTone={messageTone}
            messageKind={messageKind}
            persistBlockerSummary={persistBlockerSummary}
            persistBlockers={validation.persistBlockers}
            persistBlockerRecommendedNextStep={persistBlockerRecommendedNextStep}
            executionPreflightMessage={executionPreflightMessage}
            toolExecutionValidationIssueCount={validation.toolExecutionValidationIssues.length}
            focusedValidationItem={validationFocusItem}
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
              currentHref={currentEditorHref}
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
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
              highlightedNodeSection={
                validationFocusItem?.target.scope === "node" &&
                validationFocusItem.target.nodeId === graph.selectedNodeId
                  ? validationFocusItem.target.section
                  : null
              }
              highlightedNodeFieldPath={
                validationFocusItem?.target.scope === "node" &&
                validationFocusItem.target.nodeId === graph.selectedNodeId
                  ? validationFocusItem.target.fieldPath ?? null
                  : null
              }
              highlightedPublishEndpointIndex={
                validationFocusItem?.target.scope === "publish"
                  ? validationFocusItem.target.endpointIndex
                  : null
              }
              highlightedPublishEndpointFieldPath={
                validationFocusItem?.target.scope === "publish"
                  ? validationFocusItem.target.fieldPath ?? null
                  : null
              }
              highlightedVariableIndex={
                validationFocusItem?.target.scope === "variables"
                  ? validationFocusItem.target.variableIndex
                  : null
              }
              highlightedVariableFieldPath={
                validationFocusItem?.target.scope === "variables"
                  ? validationFocusItem.target.fieldPath ?? null
                  : null
              }
              focusedValidationItem={validationFocusItem}
              persistBlockedMessage={validation.persistBlockedMessage || null}
              persistBlockerSummary={persistBlockerSummary}
              persistBlockers={validation.persistBlockers}
              persistBlockerRecommendedNextStep={persistBlockerRecommendedNextStep}
              sandboxReadiness={sandboxReadiness}
            />
          </aside>
        </section>
      </main>
    </ReactFlowProvider>
  );
}
