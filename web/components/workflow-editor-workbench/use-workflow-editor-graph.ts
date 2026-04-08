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

export function shouldRetainNodeSelectionAfterTransientCanvasReset(options: {
  retainedNodeId: string | null;
  nextNodeId: string | null;
  nextEdgeId: string | null;
  selectedNodeId: string | null;
  nodes: WorkflowEditorCanvasNode[];
}) {
  if (!options.retainedNodeId) {
    return false;
  }

  if (options.nextNodeId || options.nextEdgeId) {
    return false;
  }

  if (options.selectedNodeId !== options.retainedNodeId) {
    return false;
  }

  return options.nodes.some((node) => node.id === options.retainedNodeId);
}

export function buildWorkflowEditorGraphResetSignature(options: {
  workflowId: string;
  workflowName: string;
  workflowVersion: string;
  workflowDefinition: WorkflowDefinition;
  nodeCatalog: WorkflowNodeCatalogItem[];
}) {
  return JSON.stringify({
    workflowId: options.workflowId,
    workflowName: options.workflowName,
    workflowVersion: options.workflowVersion,
    workflowDefinition: options.workflowDefinition,
    nodeCatalog: options.nodeCatalog
  });
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
  const workflowResetSignature = useMemo(
    () => buildWorkflowEditorGraphResetSignature({
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      workflowDefinition: workflow.definition,
      nodeCatalog
    }),
    [nodeCatalog, workflow.definition, workflow.id, workflow.name, workflow.version]
  );
  const workflowResetPayloadRef = useRef({
    workflowName: workflow.name,
    workflowVersion: workflow.version,
    workflowDefinition: workflow.definition,
    nodeCatalog
  });
  workflowResetPayloadRef.current = {
    workflowName: workflow.name,
    workflowVersion: workflow.version,
    workflowDefinition: workflow.definition,
    nodeCatalog
  };
  const initialDocumentStateRef = useRef<ReturnType<typeof createWorkflowEditorCanonicalState> | null>(null);
  if (!initialDocumentStateRef.current) {
    initialDocumentStateRef.current = createWorkflowEditorCanonicalState(nodeCatalog, workflow.definition);
  }
  const initialGraph = initialDocumentStateRef.current.graph;
  const initialDocumentDefinition = initialDocumentStateRef.current.definition;
  const [workflowName, setWorkflowName] = useState(workflow.name);
  const [persistedWorkflowName, setPersistedWorkflowName] = useState(workflow.name);
  const [workflowVersion, setWorkflowVersion] = useState(workflow.version);
  const [persistedDefinitionState, setPersistedDefinitionState] = useState(initialDocumentDefinition);
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
  const retainedNodeSelectionIdRef = useRef<string | null>(null);
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
    persistedDefinition: persistedDefinitionState
  });

  const setPersistedDefinition = (definition: WorkflowDefinition) => {
    setPersistedDefinitionState(createWorkflowEditorCanonicalState(nodeCatalog, definition).definition);
  };

  useEffect(() => {
    const nextInitialState = createWorkflowEditorCanonicalState(
      workflowResetPayloadRef.current.nodeCatalog,
      workflowResetPayloadRef.current.workflowDefinition
    );
    const nextGraph = nextInitialState.graph;
    const nextInitialDefinition = nextInitialState.definition;
    skipNextHistorySyncRef.current = true;
    setWorkflowName(workflowResetPayloadRef.current.workflowName);
    setPersistedWorkflowName(workflowResetPayloadRef.current.workflowName);
    setWorkflowVersion(workflowResetPayloadRef.current.workflowVersion);
    setPersistedDefinitionState(nextInitialDefinition);
    setDocumentHistory(createWorkflowEditorDocumentHistory(nextInitialDefinition));
    resetWorkflowState(workflowResetPayloadRef.current.workflowDefinition);
    setNodes(nextGraph.nodes);
    setEdges(nextGraph.edges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    retainedNodeSelectionIdRef.current = null;
  }, [workflowResetSignature, resetWorkflowState, setEdges, setNodes]);

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
    retainedNodeSelectionIdRef.current = null;
  };

  const canUndo = documentHistory.past.length > 0;
  const canRedo = documentHistory.future.length > 0;

  const commitWorkflowDraftUpdate = (
    nextDefinition: WorkflowDefinition,
    applyUpdate: () => void
  ) => {
    const currentDefinitionSignature = serializeWorkflowEditorDefinition(currentDefinitionRef.current);
    const nextDefinitionSignature = serializeWorkflowEditorDefinition(nextDefinition);

    if (currentDefinitionSignature !== nextDefinitionSignature) {
      skipNextHistorySyncRef.current = true;
      setDocumentHistory((currentHistory) =>
        recordWorkflowEditorDocumentHistory(currentHistory, nextDefinition)
      );
    }

    applyUpdate();
  };

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
    const nextNodeId = selection.nodes[0]?.id ?? null;
    const nextEdgeId = selection.edges[0]?.id ?? null;
    const retainedNodeId = retainedNodeSelectionIdRef.current;

    if (
      shouldRetainNodeSelectionAfterTransientCanvasReset({
        retainedNodeId,
        nextNodeId,
        nextEdgeId,
        selectedNodeId,
        nodes
      })
    ) {
      retainedNodeSelectionIdRef.current = null;
      nodeActions.focusNode(retainedNodeId);
      return;
    }

    if (
      retainedNodeSelectionIdRef.current &&
      ((nextNodeId && nextNodeId !== retainedNodeSelectionIdRef.current) || nextEdgeId)
    ) {
      retainedNodeSelectionIdRef.current = null;
    }

    setSelectedNodeId(nextNodeId);
    setSelectedEdgeId(nextEdgeId);
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
    persistedDefinition: persistedDefinitionState,
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
    retainNodeSelectionOnce: (nodeId: string | null) => {
      retainedNodeSelectionIdRef.current = nodeId;
    },
    focusNode: nodeActions.focusNode,
    handleAddNode: nodeActions.handleAddNode,
    handleNodeNameChange: nodeActions.handleNodeNameChange,
    handleNodeDescriptionChange: nodeActions.handleNodeDescriptionChange,
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
    updateWorkflowVariables: (
      nextVariables: Array<Record<string, unknown>>,
      options?: { successMessage?: string }
    ) => {
      const normalizedWorkflowVariables = cloneWorkflowEditorDraftRecords(nextVariables);

      commitWorkflowDraftUpdate(
        applyWorkflowEditorDraftPatch(currentDefinitionRef.current, {
          variables: normalizedWorkflowVariables
        }),
        () => workflowState.updateWorkflowVariables(normalizedWorkflowVariables, options)
      );
    },
    updateWorkflowPublish: (
      nextPublish: Array<Record<string, unknown>>,
      options?: { successMessage?: string }
    ) => {
      const normalizedWorkflowPublish = cloneWorkflowEditorDraftRecords(nextPublish);

      commitWorkflowDraftUpdate(
        applyWorkflowEditorDraftPatch(currentDefinitionRef.current, {
          publish: normalizedWorkflowPublish
        }),
        () => workflowState.updateWorkflowPublish(normalizedWorkflowPublish, options)
      );
    }
  };
}

function createWorkflowEditorCanonicalState(
  nodeCatalog: WorkflowNodeCatalogItem[],
  definition: WorkflowDefinition
) {
  const graph = workflowDefinitionToReactFlow(nodeCatalog, definition);

  return {
    graph,
    definition: buildWorkflowEditorDefinition({
      nodes: graph.nodes,
      edges: graph.edges,
      workflowVariables: Array.isArray(definition.variables)
        ? cloneWorkflowEditorDraftRecords(definition.variables)
        : [],
      workflowPublish: Array.isArray(definition.publish)
        ? cloneWorkflowEditorDraftRecords(definition.publish)
        : []
    })
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

function applyWorkflowEditorDraftPatch(
  definition: WorkflowDefinition,
  patch: Partial<Pick<WorkflowDefinition, "variables" | "publish">>
) {
  const nextDefinition = cloneWorkflowDefinition(definition);

  if (patch.variables) {
    nextDefinition.variables = cloneWorkflowEditorDraftRecords(patch.variables);
  }

  if (patch.publish) {
    nextDefinition.publish = cloneWorkflowEditorDraftRecords(patch.publish);
  }

  return nextDefinition;
}

function cloneWorkflowEditorDraftRecords(records: Array<Record<string, unknown>>) {
  return records.map((record) => ({ ...record }));
}

function cloneWorkflowDefinition(definition: WorkflowDefinition) {
  return structuredClone(definition);
}

function serializeWorkflowEditorDefinition(definition: WorkflowDefinition) {
  return JSON.stringify(definition);
}
