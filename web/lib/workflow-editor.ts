import type { Edge, Node } from "@xyflow/react";

import type { WorkflowDetail } from "@/lib/get-workflows";
import {
  buildCatalogNodeDefinition,
  getPaletteNodeCatalog,
  getWorkflowNodeCatalogItem,
  getWorkflowNodeDefaultPosition
} from "@/lib/workflow-node-catalog";

export type WorkflowDefinition = WorkflowDetail["definition"];

export type WorkflowCanvasNodeData = {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
  runtimePolicy?: Record<string, unknown>;
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

export const EDITOR_NODE_LIBRARY = getPaletteNodeCatalog();

const DEFAULT_EDGE_OPTIONS: WorkflowCanvasEdgeData = {
  channel: "control"
};

export function createStarterWorkflowDefinition(): WorkflowDefinition {
  return {
    nodes: [
      buildCatalogNodeDefinition({
        id: createEntityId("trigger"),
        type: "trigger"
      }),
      buildCatalogNodeDefinition({
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
  type: (typeof EDITOR_NODE_LIBRARY)[number]["type"],
  existingNodesCount: number
) {
  const fallbackPosition = getWorkflowNodeDefaultPosition(type);
  const catalogItem = getWorkflowNodeCatalogItem(type);

  return {
    id: createEntityId(type),
    type,
    name: buildDefaultNodeName(type, existingNodesCount),
    config: withCanvasPosition(
      structuredClone(catalogItem?.defaults.config ?? {}),
      {
        x: fallbackPosition.x + Math.max(0, existingNodesCount - 1) * 36,
        y: fallbackPosition.y + (existingNodesCount % 3) * 44
      }
    )
  };
}

export function workflowDefinitionToReactFlow(
  definition: WorkflowDefinition
): {
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
} {
  const rawNodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const rawEdges = Array.isArray(definition.edges) ? definition.edges : [];

  const nodes = rawNodes.map((node, index) => {
    const config = toRecord(node.config);
    const position = readCanvasPosition(config, node.type, index);

    return {
      id: node.id,
      type: "workflowNode",
      position,
      data: {
        label: node.name,
        nodeType: node.type,
        config: stripCanvasMetadata(config),
        runtimePolicy: toOptionalRecord(node.runtimePolicy),
        inputSchema: toOptionalRecord(node.inputSchema),
        outputSchema: toOptionalRecord(node.outputSchema)
      }
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

function buildDefaultNodeName(type: string, existingNodesCount: number) {
  const baseName = getWorkflowNodeCatalogItem(type)?.label ?? type;
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

  const fallback = getWorkflowNodeDefaultPosition(nodeType);
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
