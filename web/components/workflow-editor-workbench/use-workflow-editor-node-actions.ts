"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import {
  insertNodeIntoCanvasGraph,
  removeNodeFromCanvasGraph,
  type WorkflowCanvasEdgeData,
  type WorkflowCanvasNodeData
} from "@/lib/workflow-editor";

import {
  isRecord,
  stringifyJson,
  type WorkflowEditorMessageTone
} from "./shared";

type UseWorkflowEditorNodeActionsOptions = {
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
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
  edges,
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

  const handleAddNode = (
    type: string,
    options?: { sourceNodeId?: string | null; sourceEdgeId?: string | null }
  ) => {
    const insertion = insertNodeIntoCanvasGraph({
      nodeCatalog,
      nodes,
      edges,
      type,
      sourceNodeId: options?.sourceNodeId ?? null,
      sourceEdgeId: options?.sourceEdgeId ?? null
    });

    setNodes(insertion.nodes);
    setEdges(insertion.edges);
    setSelectedNodeId(insertion.nextNode.id);
    setSelectedEdgeId(null);
    const insertionMessage = !insertion.sourceNode
      ? `${insertion.nextNode.data.label} 已加入画布，记得保存 workflow。`
      : insertion.insertionMode === "inline" && insertion.displacedTargetNode
        ? `${insertion.nextNode.data.label} 已插入到 ${insertion.sourceNode.data.label} 与 ${insertion.displacedTargetNode.data.label} 之间，记得保存 workflow。`
        : `${insertion.nextNode.data.label} 已接到 ${insertion.sourceNode.data.label} 后方，记得保存 workflow。`;
    setMessage(insertionMessage);
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

  const handleDeleteNode = (nodeId?: string | null) => {
    const targetNodeId = nodeId ?? selectedNodeId;
    const targetNode = targetNodeId
      ? nodes.find((node) => node.id === targetNodeId) ?? null
      : null;

    if (!targetNode) {
      return;
    }

    if (targetNode.data.nodeType === "trigger") {
      setMessage("最小编辑器暂不允许删除唯一 trigger 节点。");
      setMessageTone("error");
      return;
    }

    if (
      targetNode.data.nodeType === "output" &&
      nodes.filter((node) => node.data.nodeType === "output").length <= 1
    ) {
      setMessage("至少保留一个 output 节点，避免保存后被后端校验拒绝。");
      setMessageTone("error");
      return;
    }

    const removal = removeNodeFromCanvasGraph({
      nodeId: targetNode.id,
      nodes,
      edges
    });

    setNodes(removal.nodes);
    setEdges(removal.edges);
    setSelectedNodeId(removal.upstreamNode?.id ?? removal.downstreamNode?.id ?? null);
    setSelectedEdgeId(null);
    setMessage(
      removal.deletionMode === "inline" && removal.upstreamNode && removal.downstreamNode
        ? `节点 ${targetNode.data.label} 已移除，并已将 ${removal.upstreamNode.data.label} 重新连到 ${removal.downstreamNode.data.label}。`
        : `节点 ${targetNode.data.label} 已从画布移除。`
    );
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
    handleDeleteNode,
    handleDeleteSelectedNode: () => handleDeleteNode(selectedNodeId)
  };
}
