"use client";

import { useMemo, useState, useTransition } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { buildWorkflowDefinitionContractValidationIssues } from "@/lib/workflow-contract-schema-validation";
import { buildWorkflowToolReferenceValidationIssues } from "@/lib/workflow-tool-reference-validation";
import type {
  WorkflowLibrarySourceLane,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import { type WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type { WorkflowDetail, WorkflowListItem } from "@/lib/get-workflows";
import { buildWorkspaceStarterPayload } from "@/lib/workspace-starter-payload";
import { inferWorkflowBusinessTrack } from "@/lib/workflow-starters";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import {
  formatUnsupportedWorkflowNodes,
  getPaletteNodeCatalog,
  getPlannedNodeCatalog,
  summarizeUnsupportedWorkflowNodes
} from "@/lib/workflow-node-catalog";

import { WorkflowEditorCanvas } from "@/components/workflow-editor-workbench/workflow-editor-canvas";
import { WorkflowEditorHero } from "@/components/workflow-editor-workbench/workflow-editor-hero";
import {
  type WorkflowEditorMessageTone
} from "@/components/workflow-editor-workbench/shared";
import { WorkflowEditorSidebar } from "@/components/workflow-editor-workbench/workflow-editor-sidebar";
import {
  applyRunOverlayToNodes,
  WORKFLOW_EDITOR_NODE_TYPES
} from "@/components/workflow-editor-workbench/workflow-canvas-node";
import { useWorkflowEditorGraph } from "@/components/workflow-editor-workbench/use-workflow-editor-graph";
import { useWorkflowRunOverlay } from "@/components/workflow-editor-workbench/use-workflow-run-overlay";
import { WorkflowEditorInspector } from "@/components/workflow-editor-inspector";

type WorkflowEditorWorkbenchProps = {
  workflow: WorkflowDetail;
  workflows: WorkflowListItem[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  tools: PluginToolRegistryItem[];
  recentRuns: WorkflowRunListItem[];
};

export function WorkflowEditorWorkbench({
  workflow,
  workflows,
  nodeCatalog,
  nodeSourceLanes,
  toolSourceLanes,
  tools,
  recentRuns
}: WorkflowEditorWorkbenchProps) {
  const editorNodeLibrary = getPaletteNodeCatalog(nodeCatalog);
  const plannedNodeLibrary = getPlannedNodeCatalog(nodeCatalog);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkflowEditorMessageTone>("idle");
  const [isSaving, startSavingTransition] = useTransition();
  const [isSavingStarter, startSaveStarterTransition] = useTransition();

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

  const displayedNodes = applyRunOverlayToNodes(
    graph.nodes,
    runOverlay.selectedRunDetail,
    runOverlay.selectedRunTrace
  );
  const selectedNode = displayedNodes.find((node) => node.id === graph.selectedNodeId) ?? null;
  const selectedEdge = graph.edges.find((edge) => edge.id === graph.selectedEdgeId) ?? null;
  const unsupportedNodes = summarizeUnsupportedWorkflowNodes(
    nodeCatalog,
    graph.currentDefinition.nodes ?? []
  );
  const unsupportedNodeSummary = formatUnsupportedWorkflowNodes(unsupportedNodes);
  const contractValidationIssues = useMemo(
    () => buildWorkflowDefinitionContractValidationIssues(graph.currentDefinition),
    [graph.currentDefinition]
  );
  const contractValidationSummary = useMemo(() => {
    if (contractValidationIssues.length === 0) {
      return null;
    }
    const head = contractValidationIssues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join("；");
    return contractValidationIssues.length > 3
      ? `${head}；另有 ${contractValidationIssues.length - 3} 项待修正。`
      : head;
  }, [contractValidationIssues]);
  const toolReferenceValidationIssues = useMemo(
    () => buildWorkflowToolReferenceValidationIssues(graph.currentDefinition, tools),
    [graph.currentDefinition, tools]
  );
  const toolReferenceValidationSummary = useMemo(() => {
    if (toolReferenceValidationIssues.length === 0) {
      return null;
    }
    const head = toolReferenceValidationIssues
      .slice(0, 3)
      .map((issue) => issue.message)
      .join("；");
    return toolReferenceValidationIssues.length > 3
      ? `${head}；另有 ${toolReferenceValidationIssues.length - 3} 项待修正。`
      : head;
  }, [toolReferenceValidationIssues]);
  const unsupportedNodesBlockedMessage =
    unsupportedNodes.length > 0
      ? `当前 workflow 包含未进入执行主链的节点，暂不能保存或沉淀为 workspace starter：${unsupportedNodeSummary}。请先移除或替换这些节点，再继续保存。`
      : null;
  const contractBlockedMessage = contractValidationSummary
    ? `当前 workflow definition 还有 contract schema 待修正问题：${contractValidationSummary}${contractValidationSummary.endsWith("。") ? "" : "。"}请先在 Node contract / publish draft 中修正后再保存。`
    : null;
  const toolReferenceBlockedMessage = toolReferenceValidationSummary
    ? `当前 workflow definition 还有 tool catalog 引用待修正问题：${toolReferenceValidationSummary}${toolReferenceValidationSummary.endsWith("。") ? "" : "。"}请先修正 tool binding / LLM Agent tool policy 后再保存。`
    : null;
  const persistBlockedMessage = [
    unsupportedNodesBlockedMessage,
    contractBlockedMessage,
    toolReferenceBlockedMessage
  ]
    .filter(Boolean)
    .join(" ");

  const handleSave = () => {
    if (persistBlockedMessage) {
      setMessage(persistBlockedMessage);
      setMessageTone("error");
      return;
    }

    startSavingTransition(async () => {
      setMessage("正在保存 workflow definition...");
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(workflow.id)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              name: graph.workflowName.trim() || workflow.name,
              definition: graph.currentDefinition
            })
          }
        );
        const body = (await response.json().catch(() => null)) as
          | { detail?: string; version?: string }
          | null;

        if (!response.ok) {
          setMessage(body?.detail ?? `保存失败，API 返回 ${response.status}。`);
          setMessageTone("error");
          return;
        }

        graph.setPersistedWorkflowName(graph.workflowName.trim() || workflow.name);
        graph.setPersistedDefinition(graph.currentDefinition);
        graph.setWorkflowVersion(body?.version ?? graph.workflowVersion);
        setMessage(`已保存 workflow，当前版本 ${body?.version ?? graph.workflowVersion}。`);
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端保存 workflow，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  const handleSaveAsWorkspaceStarter = () => {
    if (persistBlockedMessage) {
      setMessage(persistBlockedMessage);
      setMessageTone("error");
      return;
    }

    const businessTrack = inferWorkflowBusinessTrack(graph.currentDefinition);
    const normalizedWorkflowName = graph.workflowName.trim() || workflow.name;
    const starterPayload = buildWorkspaceStarterPayload({
      workflowId: workflow.id,
      workflowName: normalizedWorkflowName,
      workflowVersion: graph.workflowVersion,
      businessTrack,
      definition: graph.currentDefinition
    });

    startSaveStarterTransition(async () => {
      setMessage("正在保存到 workspace starter library...");
      setMessageTone("idle");

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/workspace-starters`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(starterPayload)
        });
        const body = (await response.json().catch(() => null)) as
          | { detail?: string; name?: string }
          | null;

        if (!response.ok) {
          setMessage(body?.detail ?? `保存模板失败，API 返回 ${response.status}。`);
          setMessageTone("error");
          return;
        }

        setMessage(
          `已保存 workspace starter：${body?.name ?? starterPayload.name}。回到创建页即可复用。`
        );
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端保存 workspace starter，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

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
            unsupportedNodes={unsupportedNodes}
            contractValidationIssuesCount={contractValidationIssues.length}
            toolReferenceValidationIssuesCount={toolReferenceValidationIssues.length}
            persistBlockedMessage={persistBlockedMessage || null}
            isSaving={isSaving}
            isSavingStarter={isSavingStarter}
            onSave={handleSave}
          onSaveAsWorkspaceStarter={handleSaveAsWorkspaceStarter}
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
            unsupportedNodes={unsupportedNodes}
            message={message}
            messageTone={messageTone}
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
              workflowVariables={graph.workflowVariables}
              workflowPublish={graph.workflowPublish}
              onWorkflowVariablesChange={graph.updateWorkflowVariables}
              onWorkflowPublishChange={graph.updateWorkflowPublish}
              onDeleteSelectedNode={graph.handleDeleteSelectedNode}
              onUpdateSelectedEdge={graph.updateSelectedEdge}
              onDeleteSelectedEdge={graph.handleDeleteSelectedEdge}
            />
          </aside>
        </section>
      </main>
    </ReactFlowProvider>
  );
}
