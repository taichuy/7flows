"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  addEdge,
  type OnConnect,
  type OnSelectionChangeParams,
  useEdgesState,
  useNodesState
} from "@xyflow/react";

import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkflowDetail } from "@/lib/get-workflows";
import {
  buildEditorEdge,
  reactFlowToWorkflowDefinition,
  workflowDefinitionToReactFlow,
  type WorkflowCanvasEdgeData
} from "@/lib/workflow-editor";

import { type WorkflowEditorMessageTone } from "./shared";
import { useWorkflowEditorNodeActions } from "./use-workflow-editor-node-actions";
import { useWorkflowEditorWorkflowState } from "./use-workflow-editor-workflow-state";

type UseWorkflowEditorGraphOptions = {
  workflow: WorkflowDetail;
  nodeCatalog: WorkflowNodeCatalogItem[];
  setMessage: Dispatch<SetStateAction<string | null>>;
  setMessageTone: Dispatch<SetStateAction<WorkflowEditorMessageTone>>;
};

export function useWorkflowEditorGraph({
  workflow,
  nodeCatalog,
  setMessage,
  setMessageTone
}: UseWorkflowEditorGraphOptions) {
  const initialGraph = workflowDefinitionToReactFlow(nodeCatalog, workflow.definition);
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const [persistedWorkflowName, setPersistedWorkflowName] = useState(workflow.name);
  const [workflowVersion, setWorkflowVersion] = useState(workflow.version);
  const [persistedDefinition, setPersistedDefinition] = useState(workflow.definition);
  const workflowState = useWorkflowEditorWorkflowState({
    initialDefinition: workflow.definition,
    setMessage,
    setMessageTone
  });
  const { resetWorkflowState } = workflowState;
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialGraph.nodes[0]?.id ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const nodeActions = useWorkflowEditorNodeActions({
    nodeCatalog,
    nodes,
    selectedNodeId,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedEdgeId,
    setMessage,
    setMessageTone
  });

  const currentDefinition = reactFlowToWorkflowDefinition(nodes, edges, {
    ...persistedDefinition,
    variables: workflowState.workflowVariables,
    publish: workflowState.workflowPublish
  });
  const isDirty =
    workflowName.trim() !== persistedWorkflowName ||
    JSON.stringify(currentDefinition) !== JSON.stringify(persistedDefinition);

  useEffect(() => {
    const nextGraph = workflowDefinitionToReactFlow(nodeCatalog, workflow.definition);
    setWorkflowName(workflow.name);
    setPersistedWorkflowName(workflow.name);
    setWorkflowVersion(workflow.version);
    setPersistedDefinition(workflow.definition);
    resetWorkflowState(workflow.definition);
    setNodes(nextGraph.nodes);
    setEdges(nextGraph.edges);
    setSelectedNodeId(nextGraph.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
  }, [nodeCatalog, workflow, resetWorkflowState, setEdges, setNodes]);

  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  const onConnect: OnConnect = (connection) => {
    if (!connection.source || !connection.target) {
      return;
    }

    setEdges((currentEdges) =>
      addEdge(buildEditorEdge(connection.source, connection.target), currentEdges)
    );
    setSelectedEdgeId(null);
    setMessage(null);
    setMessageTone("idle");
  };

  const handleSelectionChange = (selection: OnSelectionChangeParams) => {
    const nextNode = selection.nodes[0];
    const nextEdge = selection.edges[0];
    setSelectedNodeId(nextNode?.id ?? null);
    setSelectedEdgeId(nextEdge?.id ?? null);
  };

  const handleDeleteSelectedEdge = () => {
    if (!selectedEdge) {
      return;
    }

    setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== selectedEdge.id));
    setSelectedEdgeId(null);
    setMessage("已移除所选连线。");
    setMessageTone("success");
  };

  const updateSelectedEdge = (
    patch: Partial<WorkflowCanvasEdgeData> & { label?: string | undefined }
  ) => {
    if (!selectedEdgeId) {
      return;
    }

    const { label, ...dataPatch } = patch;

    setEdges((currentEdges) =>
      currentEdges.map((edge) =>
        edge.id === selectedEdgeId
          ? {
              ...edge,
              ...(label !== undefined ? { label } : {}),
              ...(dataPatch.channel
                ? {
                    animated: dataPatch.channel === "data"
                  }
                : {}),
              data: {
                ...(edge.data ?? { channel: "control" }),
                ...dataPatch
              }
            }
          : edge
      )
    );
  };

  return {
    workflowName,
    setWorkflowName,
    workflowVersion,
    setWorkflowVersion,
    persistedWorkflowName,
    setPersistedWorkflowName,
    persistedDefinition,
    setPersistedDefinition,
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    selectedNodeId,
    selectedEdgeId,
    nodeConfigText: nodeActions.nodeConfigText,
    setNodeConfigText: nodeActions.setNodeConfigText,
    currentDefinition,
    workflowVariables: workflowState.workflowVariables,
    workflowPublish: workflowState.workflowPublish,
    isDirty,
    onConnect,
    handleSelectionChange,
    focusNode: nodeActions.focusNode,
    handleAddNode: nodeActions.handleAddNode,
    handleNodeNameChange: nodeActions.handleNodeNameChange,
    handleSelectedNodeConfigChange: nodeActions.handleSelectedNodeConfigChange,
    applyNodeConfigJson: nodeActions.applyNodeConfigJson,
    updateNodeInputSchema: nodeActions.updateNodeInputSchema,
    updateNodeOutputSchema: nodeActions.updateNodeOutputSchema,
    updateNodeRuntimePolicy: nodeActions.updateNodeRuntimePolicy,
    handleNodeRuntimePolicyChange: nodeActions.handleNodeRuntimePolicyChange,
    handleDeleteSelectedNode: nodeActions.handleDeleteSelectedNode,
    handleDeleteSelectedEdge,
    updateSelectedEdge,
    updateWorkflowVariables: workflowState.updateWorkflowVariables,
    updateWorkflowPublish: workflowState.updateWorkflowPublish
  };
}
