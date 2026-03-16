"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import {
  createWorkflowNodeDraft,
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

type UseWorkflowEditorNodeActionsOptions = {
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  selectedNodeId: string | null;
  setNodes: Dispatch<SetStateAction<Array<Node<WorkflowCanvasNodeData>>>>;
  setEdges: Dispatch<SetStateAction<Array<Edge<WorkflowCanvasEdgeData>>>>;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
  setSelectedEdgeId: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setMessageTone: Dispatch<SetStateAction<WorkflowEditorMessageTone>>;
};

export function useWorkflowEditorNodeActions({
  nodeCatalog,
  nodes,
  selectedNodeId,
  setNodes,
  setEdges,
  setSelectedNodeId,
  setSelectedEdgeId,
  setMessage,
  setMessageTone
}: UseWorkflowEditorNodeActionsOptions) {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const [nodeConfigText, setNodeConfigText] = useState(() =>
    stringifyJson(nodes[0]?.data.config ?? {})
  );

  useEffect(() => {
    setNodeConfigText(stringifyJson(selectedNode?.data.config ?? {}));
  }, [selectedNode?.data.config]);

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

  const updateSelectedNode = (
    patch: Partial<WorkflowCanvasNodeData>,
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
                ...patch
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

  const handleNodeNameChange = (value: string) => {
    updateSelectedNode({ label: value });
  };

  const handleSelectedNodeConfigChange = (nextConfig: Record<string, unknown>) => {
    updateSelectedNode({ config: nextConfig });
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

      updateSelectedNode({ config: parsed }, { successMessage: "节点 config 已应用到本地画布。" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "节点 config 不是合法 JSON。");
      setMessageTone("error");
    }
  };

  const updateNodeRuntimePolicy = (
    nextRuntimePolicy: Record<string, unknown> | undefined,
    options?: { successMessage?: string }
  ) => {
    updateSelectedNode({ runtimePolicy: nextRuntimePolicy }, options);
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

  const updateNodeSchema = (
    field: "inputSchema" | "outputSchema",
    nextSchema: Record<string, unknown> | undefined,
    options?: { successMessage?: string }
  ) => {
    updateSelectedNode({ [field]: nextSchema }, options);
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

  return {
    selectedNode,
    nodeConfigText,
    setNodeConfigText,
    focusNode,
    handleAddNode,
    handleNodeNameChange,
    handleSelectedNodeConfigChange,
    applyNodeConfigJson,
    updateNodeInputSchema,
    updateNodeOutputSchema,
    updateNodeRuntimePolicy,
    handleNodeRuntimePolicyChange,
    handleDeleteSelectedNode
  };
}
