"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  addEdge,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
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
  type WorkflowDefinition,
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

type WorkflowEditorDocumentHistory = {
  past: WorkflowDefinition[];
  present: WorkflowDefinition;
  future: WorkflowDefinition[];
};

type WorkflowEditorCanvasNode = Node<import("@/lib/workflow-editor").WorkflowCanvasNodeData>;
type WorkflowEditorCanvasEdge = Edge<WorkflowCanvasEdgeData>;

export function createWorkflowEditorDocumentHistory(
  definition: WorkflowDefinition
): WorkflowEditorDocumentHistory {
  const present = cloneWorkflowDefinition(definition);

  return {
    past: [],
    present,
    future: []
  };
}

export function recordWorkflowEditorDocumentHistory(
  history: WorkflowEditorDocumentHistory,
  nextDefinition: WorkflowDefinition
) {
  if (
    serializeWorkflowEditorDefinition(history.present) ===
    serializeWorkflowEditorDefinition(nextDefinition)
  ) {
    return history;
  }

  return {
    past: [...history.past, cloneWorkflowDefinition(history.present)],
    present: cloneWorkflowDefinition(nextDefinition),
    future: []
  } satisfies WorkflowEditorDocumentHistory;
}

export function undoWorkflowEditorDocumentHistory(history: WorkflowEditorDocumentHistory) {
  const previousDefinition = history.past.at(-1);
  if (!previousDefinition) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: cloneWorkflowDefinition(previousDefinition),
    future: [cloneWorkflowDefinition(history.present), ...history.future]
  } satisfies WorkflowEditorDocumentHistory;
}

export function redoWorkflowEditorDocumentHistory(history: WorkflowEditorDocumentHistory) {
  const nextDefinition = history.future[0];
  if (!nextDefinition) {
    return history;
  }

  return {
    past: [...history.past, cloneWorkflowDefinition(history.present)],
    present: cloneWorkflowDefinition(nextDefinition),
    future: history.future.slice(1).map(cloneWorkflowDefinition)
  } satisfies WorkflowEditorDocumentHistory;
}

export function isWorkflowEditorGraphDirty(options: {
  workflowName: string;
  persistedWorkflowName: string;
  currentDefinition: WorkflowDefinition;
  persistedDefinition: WorkflowDefinition;
}) {
  return (
    options.workflowName.trim() !== options.persistedWorkflowName ||
    serializeWorkflowEditorDefinition(options.currentDefinition) !==
      serializeWorkflowEditorDefinition(options.persistedDefinition)
  );
}

export function useWorkflowEditorGraph({
  workflow,
  nodeCatalog,
  setMessage,
  setMessageTone
}: UseWorkflowEditorGraphOptions) {
  const initialGraph = useMemo(
    () => workflowDefinitionToReactFlow(nodeCatalog, workflow.definition),
    [nodeCatalog, workflow.definition]
  );
  const initialDocumentDefinition = useMemo(
    () =>
      buildWorkflowEditorDefinition({
        nodes: initialGraph.nodes,
        edges: initialGraph.edges,
        workflowVariables: Array.isArray(workflow.definition.variables)
          ? workflow.definition.variables
          : [],
        workflowPublish: Array.isArray(workflow.definition.publish) ? workflow.definition.publish : []
      }),
    [initialGraph.edges, initialGraph.nodes, workflow.definition.publish, workflow.definition.variables]
  );
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const [persistedWorkflowName, setPersistedWorkflowName] = useState(workflow.name);
  const [workflowVersion, setWorkflowVersion] = useState(workflow.version);
  const [persistedDefinition, setPersistedDefinition] = useState(workflow.definition);
  const [documentHistory, setDocumentHistory] = useState(() =>
    createWorkflowEditorDocumentHistory(initialDocumentDefinition)
  );
  const skipNextHistorySyncRef = useRef(false);
  const workflowState = useWorkflowEditorWorkflowState({
    initialDefinition: workflow.definition,
    setMessage,
    setMessageTone
  });
  const { resetWorkflowState } = workflowState;
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const currentDefinition = useMemo(
    () =>
      buildWorkflowEditorDefinition({
        nodes,
        edges,
        workflowVariables: workflowState.workflowVariables,
        workflowPublish: workflowState.workflowPublish
      }),
    [edges, nodes, workflowState.workflowPublish, workflowState.workflowVariables]
  );
  const currentDefinitionRef = useRef(currentDefinition);
  currentDefinitionRef.current = currentDefinition;
  const currentDefinitionSignature = useMemo(
    () => serializeWorkflowEditorDefinition(currentDefinition),
    [currentDefinition]
  );
  const nodeActions = useWorkflowEditorNodeActions({
    nodeCatalog,
    nodes,
    edges,
    selectedNodeId,
    setNodes,
    setEdges,
    setSelectedNodeId,
    setSelectedEdgeId,
    setMessage,
    setMessageTone
  });
  const isDirty = isWorkflowEditorGraphDirty({
    workflowName,
    persistedWorkflowName,
    currentDefinition,
    persistedDefinition
  });

  useEffect(() => {
    const nextGraph = workflowDefinitionToReactFlow(nodeCatalog, workflow.definition);
    const nextInitialDefinition = buildWorkflowEditorDefinition({
      nodes: nextGraph.nodes,
      edges: nextGraph.edges,
      workflowVariables: Array.isArray(workflow.definition.variables)
        ? workflow.definition.variables
        : [],
      workflowPublish: Array.isArray(workflow.definition.publish) ? workflow.definition.publish : []
    });
    skipNextHistorySyncRef.current = true;
    setWorkflowName(workflow.name);
    setPersistedWorkflowName(workflow.name);
    setWorkflowVersion(workflow.version);
    setPersistedDefinition(workflow.definition);
    setDocumentHistory(createWorkflowEditorDocumentHistory(nextInitialDefinition));
    resetWorkflowState(workflow.definition);
    setNodes(nextGraph.nodes);
    setEdges(nextGraph.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [nodeCatalog, workflow, resetWorkflowState, setEdges, setNodes]);

  useEffect(() => {
    if (skipNextHistorySyncRef.current) {
      skipNextHistorySyncRef.current = false;
      return;
    }

    setDocumentHistory((currentHistory) =>
      recordWorkflowEditorDocumentHistory(currentHistory, currentDefinitionRef.current)
    );
  }, [currentDefinitionSignature]);

  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  const applyDocumentDefinition = (definition: WorkflowDefinition) => {
    const nextGraph = workflowDefinitionToReactFlow(nodeCatalog, definition);

    skipNextHistorySyncRef.current = true;
    resetWorkflowState(definition);
    setNodes(nextGraph.nodes);
    setEdges(nextGraph.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const canUndo = documentHistory.past.length > 0;
  const canRedo = documentHistory.future.length > 0;

  const undo = () => {
    const nextHistory = undoWorkflowEditorDocumentHistory(documentHistory);
    if (nextHistory === documentHistory) {
      return;
    }

    setDocumentHistory(nextHistory);
    applyDocumentDefinition(nextHistory.present);
  };

  const redo = () => {
    const nextHistory = redoWorkflowEditorDocumentHistory(documentHistory);
    if (nextHistory === documentHistory) {
      return;
    }

    setDocumentHistory(nextHistory);
    applyDocumentDefinition(nextHistory.present);
  };

  const handleNodesChange = (changes: NodeChange<WorkflowEditorCanvasNode>[]) => {
    onNodesChange(changes);

    if (changes.some((change) => change.type !== "select")) {
      setSelectedEdgeId(null);
    }
  };

  const handleEdgesChange = (changes: EdgeChange<WorkflowEditorCanvasEdge>[]) => {
    onEdgesChange(changes);

    if (changes.some((change) => change.type !== "select")) {
      setSelectedNodeId(null);
    }
  };

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
    onNodesChange: handleNodesChange,
    edges,
    setEdges,
    onEdgesChange: handleEdgesChange,
    selectedNodeId,
    selectedEdgeId,
    selectedNode: nodeActions.selectedNode,
    selectedEdge,
    nodeConfigText: nodeActions.nodeConfigText,
    setNodeConfigText: nodeActions.setNodeConfigText,
    currentDefinition,
    workflowVariables: workflowState.workflowVariables,
    workflowPublish: workflowState.workflowPublish,
    canUndo,
    canRedo,
    undo,
    redo,
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
    handleDeleteNode: nodeActions.handleDeleteNode,
    handleDeleteSelectedNode: nodeActions.handleDeleteSelectedNode,
    handleDeleteSelectedEdge,
    updateSelectedEdge,
    updateWorkflowVariables: workflowState.updateWorkflowVariables,
    updateWorkflowPublish: workflowState.updateWorkflowPublish
  };
}

function buildWorkflowEditorDefinition(options: {
  nodes: WorkflowEditorCanvasNode[];
  edges: WorkflowEditorCanvasEdge[];
  workflowVariables: Array<Record<string, unknown>>;
  workflowPublish: Array<Record<string, unknown>>;
}) {
  return reactFlowToWorkflowDefinition(options.nodes, options.edges, {
    nodes: [],
    edges: [],
    variables: options.workflowVariables,
    publish: options.workflowPublish
  });
}

function cloneWorkflowDefinition(definition: WorkflowDefinition) {
  return structuredClone(definition);
}

function serializeWorkflowEditorDefinition(definition: WorkflowDefinition) {
  return JSON.stringify(definition);
}
