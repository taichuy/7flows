import type { Edge, Node } from "@xyflow/react";

import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkflowDetail } from "@/lib/get-workflows";
import type { WorkflowNodeRuntimePolicy } from "@/lib/workflow-runtime-policy";
import {
  buildCatalogNodeDefinition,
  getWorkflowNodeCatalogItem,
  getWorkflowNodeDefaultPosition
} from "@/lib/workflow-node-catalog";

export type WorkflowDefinition = WorkflowDetail["definition"];

export type WorkflowCanvasNodeData = {
  label: string;
  nodeType: string;
  typeLabel?: string;
  typeDescription?: string;
  capabilityGroup?: WorkflowNodeCatalogItem["capabilityGroup"];
  config: Record<string, unknown>;
  runtimePolicy?: WorkflowNodeRuntimePolicy;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  runStatus?: string;
  runNodeId?: string;
  runDurationMs?: number;
  runErrorMessage?: string | null;
  runLastEventType?: string;
  runEventCount?: number;
};

export type WorkflowCanvasEdgeData = {
  channel: "control" | "data";
  condition?: string;
  conditionExpression?: string;
  mapping?: Array<Record<string, unknown>>;
};

const DEFAULT_EDGE_OPTIONS: WorkflowCanvasEdgeData = {
  channel: "control"
};
const WORKFLOW_NODE_HORIZONTAL_SPACING = 360;

export function createStarterWorkflowDefinition(
  nodeCatalog: WorkflowNodeCatalogItem[]
): WorkflowDefinition {
  return {
    nodes: [
      buildCatalogNodeDefinition(nodeCatalog, {
        id: createEntityId("trigger"),
        type: "trigger"
      }),
      buildCatalogNodeDefinition(nodeCatalog, {
        id: createEntityId("output"),
        type: "output"
      })
    ],
    edges: [],
    variables: [],
    publish: []
  };
}

export function createWorkflowNodeDraft(
  nodeCatalog: WorkflowNodeCatalogItem[],
  type: string,
  existingNodesCount: number,
  options?: { anchorPosition?: { x: number; y: number } }
) {
  const fallbackPosition = getWorkflowNodeDefaultPosition(nodeCatalog, type);
  const catalogItem = getWorkflowNodeCatalogItem(nodeCatalog, type);
  const anchorPosition = options?.anchorPosition;
  const basePosition = anchorPosition ?? fallbackPosition;

  return {
    id: createEntityId(type),
    type,
    name: buildDefaultNodeName(nodeCatalog, type, existingNodesCount),
    config: withCanvasPosition(
      structuredClone(catalogItem?.defaults.config ?? {}),
      {
        x: basePosition.x + (anchorPosition ? 0 : Math.max(0, existingNodesCount - 1) * 36),
        y: basePosition.y + (anchorPosition ? 0 : (existingNodesCount % 3) * 44)
      }
    )
  };
}

export function workflowDefinitionToReactFlow(
  nodeCatalog: WorkflowNodeCatalogItem[],
  definition: WorkflowDefinition
): {
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
} {
  const rawNodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const rawEdges = Array.isArray(definition.edges) ? definition.edges : [];

  const nodes = rawNodes.map((node, index) => {
    const config = toRecord(node.config);
    const position = readCanvasPosition(nodeCatalog, config, node.type, index);

    return {
      id: node.id,
      type: "workflowNode",
      position,
      data: buildWorkflowCanvasNodeData(nodeCatalog, {
        label: node.name,
        nodeType: node.type,
        config: stripCanvasMetadata(config),
        runtimePolicy: toOptionalRecord(node.runtimePolicy),
        inputSchema: toOptionalRecord(node.inputSchema),
        outputSchema: toOptionalRecord(node.outputSchema)
      })
    } satisfies Node<WorkflowCanvasNodeData>;
  });

  const edges = rawEdges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: "smoothstep",
    animated: edge.channel === "data",
    label: edge.condition ?? undefined,
    data: {
      channel: edge.channel === "data" ? "data" : "control",
      condition: normalizeOptionalString(edge.condition),
      conditionExpression: normalizeOptionalString(edge.conditionExpression),
      mapping: Array.isArray(edge.mapping)
        ? edge.mapping.filter(isRecord).map((item) => ({ ...item }))
        : undefined
    }
  })) satisfies Array<Edge<WorkflowCanvasEdgeData>>;

  return { nodes, edges };
}

export function reactFlowToWorkflowDefinition(
  nodes: Array<Node<WorkflowCanvasNodeData>>,
  edges: Array<Edge<WorkflowCanvasEdgeData>>,
  previousDefinition: WorkflowDefinition
): WorkflowDefinition {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      name: node.data.label,
      config: withCanvasPosition(node.data.config, node.position),
      ...(node.data.inputSchema ? { inputSchema: node.data.inputSchema } : {}),
      ...(node.data.outputSchema ? { outputSchema: node.data.outputSchema } : {}),
      ...(node.data.runtimePolicy ? { runtimePolicy: node.data.runtimePolicy } : {})
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      channel: edge.data?.channel === "data" ? "data" : "control",
      ...(normalizeOptionalString(edge.data?.condition)
        ? { condition: normalizeOptionalString(edge.data?.condition) }
        : {}),
      ...(normalizeOptionalString(edge.data?.conditionExpression)
        ? {
            conditionExpression: normalizeOptionalString(edge.data?.conditionExpression)
          }
        : {}),
      ...(Array.isArray(edge.data?.mapping) && edge.data.mapping.length > 0
        ? { mapping: edge.data.mapping }
        : {})
    })),
    variables: Array.isArray(previousDefinition.variables)
      ? previousDefinition.variables
      : [],
    publish: Array.isArray(previousDefinition.publish) ? previousDefinition.publish : []
  };
}

function buildDefaultNodeName(
  nodeCatalog: WorkflowNodeCatalogItem[],
  type: string,
  existingNodesCount: number
) {
  const baseName = getWorkflowNodeCatalogItem(nodeCatalog, type)?.label ?? type;
  return `${baseName} ${Math.max(1, existingNodesCount)}`;
}

function createEntityId(prefix: string) {
  const normalizedPrefix = prefix.replace(/[^a-z0-9_]+/gi, "_").toLowerCase();
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${normalizedPrefix}_${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${normalizedPrefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function readCanvasPosition(
  nodeCatalog: WorkflowNodeCatalogItem[],
  config: Record<string, unknown>,
  nodeType: string,
  index: number
) {
  const ui = toOptionalRecord(config.ui);
  const position = toOptionalRecord(ui?.position);
  const x = typeof position?.x === "number" ? position.x : undefined;
  const y = typeof position?.y === "number" ? position.y : undefined;

  if (typeof x === "number" && typeof y === "number") {
    return { x, y };
  }

  const fallback = getWorkflowNodeDefaultPosition(nodeCatalog, nodeType);
  return {
    x: fallback.x + index * 40,
    y: fallback.y + (index % 3) * 48
  };
}

function stripCanvasMetadata(config: Record<string, unknown>) {
  const nextConfig = { ...config };
  const ui = toOptionalRecord(nextConfig.ui);
  if (!ui) {
    return nextConfig;
  }

  const nextUi = { ...ui };
  delete nextUi.position;
  if (Object.keys(nextUi).length === 0) {
    delete nextConfig.ui;
    return nextConfig;
  }

  nextConfig.ui = nextUi;
  return nextConfig;
}

function withCanvasPosition(
  config: Record<string, unknown>,
  position: { x: number; y: number }
) {
  const nextConfig = { ...config };
  const ui = toOptionalRecord(nextConfig.ui) ?? {};
  nextConfig.ui = {
    ...ui,
    position: {
      x: Math.round(position.x),
      y: Math.round(position.y)
    }
  };
  return nextConfig;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function toRecord(value: unknown) {
  return isRecord(value) ? { ...value } : {};
}

function toOptionalRecord(value: unknown) {
  return isRecord(value) ? { ...value } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildEditorEdge(
  source: string,
  target: string
): Edge<WorkflowCanvasEdgeData> {
  return {
    id: createEntityId("edge"),
    source,
    target,
    type: "smoothstep",
    animated: false,
    data: { ...DEFAULT_EDGE_OPTIONS }
  };
}

export function buildWorkflowCanvasNodeData(
  nodeCatalog: WorkflowNodeCatalogItem[],
  input: Omit<WorkflowCanvasNodeData, "typeLabel" | "typeDescription" | "capabilityGroup">
): WorkflowCanvasNodeData {
  const catalogItem = getWorkflowNodeCatalogItem(nodeCatalog, input.nodeType);

  return {
    ...input,
    typeLabel: catalogItem?.label ?? input.nodeType,
    typeDescription: catalogItem?.description ?? catalogItem?.supportSummary,
    capabilityGroup: catalogItem?.capabilityGroup
  };
}

export function buildWorkflowInsertedNodePosition(
  sourcePosition: { x: number; y: number },
  branchIndex: number
) {
  if (branchIndex <= 0) {
    return {
      x: Math.round(sourcePosition.x + WORKFLOW_NODE_HORIZONTAL_SPACING),
      y: Math.round(sourcePosition.y)
    };
  }

  const verticalLane = Math.ceil(branchIndex / 2) * 156;
  const direction = branchIndex % 2 === 1 ? 1 : -1;

  return {
    x: Math.round(sourcePosition.x + WORKFLOW_NODE_HORIZONTAL_SPACING),
    y: Math.round(sourcePosition.y + verticalLane * direction)
  };
}

export function insertNodeIntoCanvasGraph({
  nodeCatalog,
  nodes,
  edges,
  type,
  sourceNodeId,
  sourceEdgeId
}: {
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  type: string;
  sourceNodeId?: string | null;
  sourceEdgeId?: string | null;
}) {
  const sourceNode = sourceNodeId
    ? nodes.find((item) => item.id === sourceNodeId) ?? null
    : null;
  const outgoingEdges = sourceNode
    ? edges.filter((edge) => edge.source === sourceNode.id)
    : [];
  const targetedInlineEdge =
    sourceNode && sourceEdgeId
      ? outgoingEdges.find(
          (edge) => edge.id === sourceEdgeId && isWorkflowControlEdge(edge)
        ) ?? null
      : null;
  const inlineEdge =
    targetedInlineEdge ??
    (sourceNode && outgoingEdges.length === 1 && isWorkflowControlEdge(outgoingEdges[0])
      ? outgoingEdges[0]
      : null);
  const inlineTargetNode = inlineEdge
    ? nodes.find((item) => item.id === inlineEdge.target) ?? null
    : null;
  const shouldInsertInline = Boolean(sourceNode && inlineEdge && inlineTargetNode);
  const outgoingEdgeCount = shouldInsertInline ? 0 : outgoingEdges.length;
  const clearedNodes = nodes.map((node) =>
    node.selected
      ? {
          ...node,
          selected: false
        }
      : node
  );
  const clearedEdges = edges.map((edge) =>
    edge.selected
      ? {
          ...edge,
          selected: false
        }
      : edge
  );
  const draft = createWorkflowNodeDraft(nodeCatalog, type, nodes.length + 1, {
    anchorPosition: inlineTargetNode
      ? inlineTargetNode.position
      : sourceNode
        ? buildWorkflowInsertedNodePosition(sourceNode.position, outgoingEdgeCount)
        : undefined
  });
  const hydratedDraftConfig = applyInsertedNodeConfigDefaults(draft.type, draft.config, sourceNode);
  const nextNode: Node<WorkflowCanvasNodeData> = {
    id: draft.id,
    type: "workflowNode",
    position: readCanvasPosition(
      nodeCatalog,
      toRecord(hydratedDraftConfig),
      draft.type,
      nodes.length
    ),
    data: buildWorkflowCanvasNodeData(nodeCatalog, {
      label: draft.name,
      nodeType: draft.type,
      config: stripCanvasMetadata(hydratedDraftConfig)
    }),
    selected: true
  };

  if (shouldInsertInline && sourceNode && inlineEdge && inlineTargetNode) {
    const downstreamNodeIds = collectWorkflowDownstreamNodeIds(inlineTargetNode.id, edges);
    const shiftedNodes = clearedNodes.map((node) =>
      downstreamNodeIds.has(node.id)
        ? {
            ...node,
            position: {
              x: Math.round(node.position.x + WORKFLOW_NODE_HORIZONTAL_SPACING),
              y: node.position.y
            }
          }
        : node
    );

    return {
      nextNode,
      sourceNode,
      displacedTargetNode: inlineTargetNode,
      insertionMode: "inline" as const,
      nodes: [...shiftedNodes, nextNode],
      edges: [
        ...clearedEdges.map((edge) =>
          edge.id === inlineEdge.id
            ? {
                ...edge,
                target: nextNode.id,
                data: cloneWorkflowCanvasEdgeData(edge.data),
                label: edge.label
              }
            : edge
        ),
        buildEditorEdge(nextNode.id, inlineTargetNode.id)
      ]
    };
  }

  return {
    nextNode,
    sourceNode,
    displacedTargetNode: null,
    insertionMode: sourceNode ? ("branch" as const) : ("append" as const),
    nodes: [...clearedNodes, nextNode],
    edges: sourceNode
      ? [...clearedEdges, buildEditorEdge(sourceNode.id, nextNode.id)]
      : clearedEdges
  };
}

function applyInsertedNodeConfigDefaults(
  type: string,
  config: Record<string, unknown>,
  sourceNode: Node<WorkflowCanvasNodeData> | null
) {
  if (type !== "reference" || !sourceNode) {
    return config;
  }

  const nextConfig = structuredClone(config);
  const nextContextAccess = toRecord(nextConfig.contextAccess);
  const readableNodeIds = Array.isArray(nextContextAccess.readableNodeIds)
    ? nextContextAccess.readableNodeIds.filter(
        (value): value is string => typeof value === "string" && Boolean(value.trim())
      )
    : [];
  nextContextAccess.readableNodeIds = Array.from(new Set([...readableNodeIds, sourceNode.id]));
  nextConfig.contextAccess = nextContextAccess;

  const nextReference = toRecord(nextConfig.reference);
  nextReference.sourceNodeId = sourceNode.id;
  nextReference.artifactType = normalizeOptionalString(nextReference.artifactType) ?? "json";
  nextConfig.reference = nextReference;

  return nextConfig;
}

export function removeNodeFromCanvasGraph({
  nodeId,
  nodes,
  edges
}: {
  nodeId: string;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
}) {
  const deletedNode = nodes.find((node) => node.id === nodeId) ?? null;
  if (!deletedNode) {
    return {
      deletedNode: null,
      upstreamNode: null,
      downstreamNode: null,
      deletionMode: "detached" as const,
      nodes,
      edges
    };
  }

  const incomingEdges = edges.filter((edge) => edge.target === nodeId);
  const outgoingEdges = edges.filter((edge) => edge.source === nodeId);
  const reconnectIncomingEdge =
    incomingEdges.length === 1 && isWorkflowReconnectableControlEdge(incomingEdges[0])
      ? incomingEdges[0]
      : null;
  const reconnectOutgoingEdge =
    outgoingEdges.length === 1 && isWorkflowReconnectableControlEdge(outgoingEdges[0])
      ? outgoingEdges[0]
      : null;
  const upstreamNode = reconnectIncomingEdge
    ? nodes.find((node) => node.id === reconnectIncomingEdge.source) ?? null
    : null;
  const downstreamNode = reconnectOutgoingEdge
    ? nodes.find((node) => node.id === reconnectOutgoingEdge.target) ?? null
    : null;
  const canReconnectInline = Boolean(
    reconnectIncomingEdge &&
      reconnectOutgoingEdge &&
      upstreamNode &&
      downstreamNode &&
      upstreamNode.id !== downstreamNode.id
  );

  let nextNodes = nodes.filter((node) => node.id !== nodeId);
  let nextEdges = edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);

  if (canReconnectInline && upstreamNode && downstreamNode) {
    const downstreamNodeIds = collectWorkflowDownstreamNodeIds(downstreamNode.id, nextEdges);
    nextNodes = nextNodes.map((node) =>
      downstreamNodeIds.has(node.id)
        ? {
            ...node,
            position: {
              x: Math.round(node.position.x - WORKFLOW_NODE_HORIZONTAL_SPACING),
              y: node.position.y
            }
          }
        : node
    );

    if (
      !nextEdges.some(
        (edge) =>
          edge.source === upstreamNode.id &&
          edge.target === downstreamNode.id &&
          isWorkflowControlEdge(edge)
      )
    ) {
      nextEdges = [...nextEdges, buildEditorEdge(upstreamNode.id, downstreamNode.id)];
    }
  }

  return {
    deletedNode,
    upstreamNode,
    downstreamNode,
    deletionMode: canReconnectInline ? ("inline" as const) : ("detached" as const),
    nodes: nextNodes,
    edges: nextEdges
  };
}

function isWorkflowControlEdge(edge: Edge<WorkflowCanvasEdgeData>) {
  return edge.data?.channel !== "data";
}

function isWorkflowReconnectableControlEdge(edge: Edge<WorkflowCanvasEdgeData>) {
  if (!isWorkflowControlEdge(edge)) {
    return false;
  }

  return !normalizeOptionalString(edge.data?.condition) &&
    !normalizeOptionalString(edge.data?.conditionExpression)
    ? !Array.isArray(edge.data?.mapping) || edge.data.mapping.length === 0
    : false;
}

function collectWorkflowDownstreamNodeIds(
  startNodeId: string,
  edges: Array<Edge<WorkflowCanvasEdgeData>>
) {
  const visited = new Set<string>();
  const queue = [startNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    edges.forEach((edge) => {
      if (edge.source === nodeId && !visited.has(edge.target)) {
        queue.push(edge.target);
      }
    });
  }

  return visited;
}

function cloneWorkflowCanvasEdgeData(
  data?: WorkflowCanvasEdgeData
): WorkflowCanvasEdgeData {
  return {
    channel: data?.channel === "data" ? "data" : "control",
    ...(normalizeOptionalString(data?.condition)
      ? { condition: normalizeOptionalString(data?.condition) }
      : {}),
    ...(normalizeOptionalString(data?.conditionExpression)
      ? { conditionExpression: normalizeOptionalString(data?.conditionExpression) }
      : {}),
    ...(Array.isArray(data?.mapping)
      ? { mapping: data.mapping.map((item) => ({ ...item })) }
      : {})
  };
}
