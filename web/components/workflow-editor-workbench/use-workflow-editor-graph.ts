"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  addEdge,
  type Node,
  type OnConnect,
  type OnSelectionChangeParams,
  useEdgesState,
  useNodesState
} from "@xyflow/react";

import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkflowDetail } from "@/lib/get-workflows";
import {
  buildEditorEdge,
  createWorkflowNodeDraft,
  reactFlowToWorkflowDefinition,
  workflowDefinitionToReactFlow,
  type WorkflowCanvasEdgeData,
  type WorkflowCanvasNodeData
} from "@/lib/workflow-editor";

import {
  isRecord,
  readNodePosition,
  stringifyJson,
  stripUiPosition,
  type WorkflowEditorMessageTone
} from "./shared";

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
  const [workflowVariables, setWorkflowVariables] = useState(() =>
    normalizeWorkflowVariables(workflow.definition.variables)
  );
  const [workflowPublish, setWorkflowPublish] = useState(() =>
    normalizeWorkflowPublishDraft(workflow.definition.publish)
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialGraph.nodes[0]?.id ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [nodeConfigText, setNodeConfigText] = useState(() =>
    stringifyJson(initialGraph.nodes[0]?.data.config ?? {})
  );

  const currentDefinition = reactFlowToWorkflowDefinition(nodes, edges, {
    ...persistedDefinition,
    variables: workflowVariables,
    publish: workflowPublish
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
    setWorkflowVariables(normalizeWorkflowVariables(workflow.definition.variables));
    setWorkflowPublish(normalizeWorkflowPublishDraft(workflow.definition.publish));
    setNodes(nextGraph.nodes);
    setEdges(nextGraph.edges);
    setSelectedNodeId(nextGraph.nodes[0]?.id ?? null);
    setSelectedEdgeId(null);
    setNodeConfigText(stringifyJson(nextGraph.nodes[0]?.data.config ?? {}));
  }, [nodeCatalog, workflow, setEdges, setNodes]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  useEffect(() => {
    setNodeConfigText(stringifyJson(selectedNode?.data.config ?? {}));
  }, [selectedNodeId, selectedNode?.data.config, setNodeConfigText]);

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

  const focusNode = (nodeId: string | null) => {
    if (!nodeId) {
      return;
    }
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  };

  const handleAddNode = (type: string) => {
    const draft = createWorkflowNodeDraft(nodeCatalog, type, nodes.length + 1);
    const nextNode: Node<WorkflowCanvasNodeData> = {
      id: draft.id,
      type: "workflowNode",
      position: readNodePosition(draft.config),
      data: {
        label: draft.name,
        nodeType: draft.type,
        config: stripUiPosition(draft.config)
      },
      selected: true
    };

    setNodes((currentNodes) => [...currentNodes, nextNode]);
    setSelectedNodeId(nextNode.id);
    setSelectedEdgeId(null);
    setMessage(`${draft.name} 已加入画布，记得保存 workflow。`);
    setMessageTone("success");
  };

  const handleNodeNameChange = (value: string) => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                label: value
              }
            }
          : node
      )
    );
  };

  const handleSelectedNodeConfigChange = (nextConfig: Record<string, unknown>) => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                config: nextConfig
              }
            }
          : node
      )
    );
    setMessage(null);
    setMessageTone("idle");
  };

  const applyNodeConfigJson = () => {
    if (!selectedNodeId) {
      return;
    }

    try {
      const parsed = JSON.parse(nodeConfigText) as unknown;
      if (!isRecord(parsed)) {
        throw new Error("节点 config 必须是 JSON 对象。");
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: parsed
                }
              }
            : node
        )
      );
      setMessage("节点 config 已应用到本地画布。");
      setMessageTone("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "节点 config 不是合法 JSON。");
      setMessageTone("error");
    }
  };

  const handleNodeRuntimePolicyChange = (value: string) => {
    if (!selectedNodeId) {
      return;
    }

    if (!value.trim()) {
      updateNodeRuntimePolicy(undefined, { successMessage: "已清空 runtimePolicy。" });
      return;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!isRecord(parsed)) {
        throw new Error("runtimePolicy 必须是 JSON 对象。");
      }

      updateNodeRuntimePolicy(parsed, { successMessage: "runtimePolicy 已应用。" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "runtimePolicy 不是合法 JSON。");
      setMessageTone("error");
    }
  };

  const updateNodeRuntimePolicy = (
    nextRuntimePolicy: Record<string, unknown> | undefined,
    options?: { successMessage?: string }
  ) => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                runtimePolicy: nextRuntimePolicy
              }
            }
          : node
      )
    );

    if (options?.successMessage) {
      setMessage(options.successMessage);
      setMessageTone("success");
    } else {
      setMessage(null);
      setMessageTone("idle");
    }
  };

  const updateNodeSchema = (
    field: "inputSchema" | "outputSchema",
    nextSchema: Record<string, unknown> | undefined,
    options?: { successMessage?: string }
  ) => {
    if (!selectedNodeId) {
      return;
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                [field]: nextSchema
              }
            }
          : node
      )
    );

    if (options?.successMessage) {
      setMessage(options.successMessage);
      setMessageTone("success");
    } else {
      setMessage(null);
      setMessageTone("idle");
    }
  };

  const updateNodeInputSchema = (nextSchema: Record<string, unknown> | undefined) => {
    updateNodeSchema("inputSchema", nextSchema, {
      successMessage: nextSchema ? "inputSchema 已应用。" : "已清空 inputSchema。"
    });
  };

  const updateNodeOutputSchema = (nextSchema: Record<string, unknown> | undefined) => {
    updateNodeSchema("outputSchema", nextSchema, {
      successMessage: nextSchema ? "outputSchema 已应用。" : "已清空 outputSchema。"
    });
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedNode) {
      return;
    }

    if (selectedNode.data.nodeType === "trigger") {
      setMessage("最小编辑器暂不允许删除唯一 trigger 节点。");
      setMessageTone("error");
      return;
    }

    if (
      selectedNode.data.nodeType === "output" &&
      nodes.filter((node) => node.data.nodeType === "output").length <= 1
    ) {
      setMessage("至少保留一个 output 节点，避免保存后被后端校验拒绝。");
      setMessageTone("error");
      return;
    }

    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== selectedNode.id));
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id
      )
    );
    setSelectedNodeId(null);
    setMessage(`节点 ${selectedNode.data.label} 已从画布移除。`);
    setMessageTone("success");
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

  const updateWorkflowPublish = (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => {
    setWorkflowPublish(normalizeWorkflowPublishDraft(nextPublish));

    if (options?.successMessage) {
      setMessage(options.successMessage);
      setMessageTone("success");
    } else {
      setMessage(null);
      setMessageTone("idle");
    }
  };

  const updateWorkflowVariables = (
    nextVariables: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => {
    setWorkflowVariables(normalizeWorkflowVariables(nextVariables));

    if (options?.successMessage) {
      setMessage(options.successMessage);
      setMessageTone("success");
    } else {
      setMessage(null);
      setMessageTone("idle");
    }
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
    nodeConfigText,
    setNodeConfigText,
    currentDefinition,
    workflowVariables,
    workflowPublish,
    isDirty,
    onConnect,
    handleSelectionChange,
    focusNode,
    handleAddNode,
    handleNodeNameChange,
    handleSelectedNodeConfigChange,
    applyNodeConfigJson,
    updateNodeInputSchema,
    updateNodeOutputSchema,
    updateNodeRuntimePolicy,
    handleNodeRuntimePolicyChange,
    handleDeleteSelectedNode,
    handleDeleteSelectedEdge,
    updateSelectedEdge,
    updateWorkflowVariables,
    updateWorkflowPublish
  };
}

function normalizeWorkflowVariables(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item)).map((item) => ({
        ...item
      }))
    : [];
}

function normalizeWorkflowPublishDraft(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item)).map((item) => ({
        ...item
      }))
    : [];
}
