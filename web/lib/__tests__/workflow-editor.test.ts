import { describe, expect, it } from "vitest";

import type { WorkflowNodeCatalogItem } from "../get-workflow-library";
import { sortWorkflowNodeCatalogForAuthoring } from "../workflow-node-catalog";
import {
  buildWorkflowCanvasNodeData,
  buildWorkflowInsertedNodePosition,
  insertNodeIntoCanvasGraph,
  removeNodeFromCanvasGraph,
  type WorkflowCanvasNodeData
} from "../workflow-editor";

const nodeCatalog: WorkflowNodeCatalogItem[] = [
  {
    type: "startNode",
    label: "开始",
    description: "流程入口",
    ecosystem: "7flows",
    source: {
      kind: "node",
      scope: "builtin",
      status: "available",
      governance: "repo",
      ecosystem: "7flows",
      label: "Builtin",
      shortLabel: "Builtin",
      summary: "builtin"
    },
    capabilityGroup: "entry",
    businessTrack: "应用新建编排",
    tags: [],
    supportStatus: "available",
    supportSummary: "ready",
    bindingRequired: false,
    bindingSourceLanes: [],
    palette: {
      enabled: true,
      order: 1,
      defaultPosition: { x: 120, y: 120 }
    },
    defaults: {
      name: "startNode",
      config: {}
    }
  },
  {
    type: "llmAgentNode",
    label: "LLM Agent",
    description: "让 agent 继续推理。",
    ecosystem: "7flows",
    source: {
      kind: "node",
      scope: "builtin",
      status: "available",
      governance: "repo",
      ecosystem: "7flows",
      label: "Builtin",
      shortLabel: "Builtin",
      summary: "builtin"
    },
    capabilityGroup: "agent",
    businessTrack: "应用新建编排",
    tags: [],
    supportStatus: "available",
    supportSummary: "ready",
    bindingRequired: false,
    bindingSourceLanes: [],
    palette: {
      enabled: true,
      order: 2,
      defaultPosition: { x: 360, y: 120 }
    },
    defaults: {
      name: "LLM Agent",
      config: {}
    }
  },
  {
    type: "referenceNode",
    label: "Reference",
    description: "显式引用上游结构化结果。",
    ecosystem: "7flows",
    source: {
      kind: "node",
      scope: "builtin",
      status: "available",
      governance: "repo",
      ecosystem: "7flows",
      label: "Builtin",
      shortLabel: "Builtin",
      summary: "builtin"
    },
    capabilityGroup: "integration",
    businessTrack: "应用新建编排",
    tags: [],
    supportStatus: "available",
    supportSummary: "ready",
    bindingRequired: false,
    bindingSourceLanes: [],
    palette: {
      enabled: true,
      order: 3,
      defaultPosition: { x: 500, y: 120 }
    },
    defaults: {
      name: "Reference",
      config: {
        reference: {
          artifactType: "json"
        }
      }
    }
  },
  {
    type: "endNode",
    label: "结束",
    description: "输出结果。",
    ecosystem: "7flows",
    source: {
      kind: "node",
      scope: "builtin",
      status: "available",
      governance: "repo",
      ecosystem: "7flows",
      label: "Builtin",
      shortLabel: "Builtin",
      summary: "builtin"
    },
    capabilityGroup: "output",
    businessTrack: "应用新建编排",
    tags: [],
    supportStatus: "available",
    supportSummary: "ready",
    bindingRequired: false,
    bindingSourceLanes: [],
    palette: {
      enabled: true,
      order: 4,
      defaultPosition: { x: 640, y: 120 }
    },
    defaults: {
      name: "endNode",
      config: {}
    }
  }
];

const baseNodes = [
  {
    id: "startNode",
    type: "workflowNode",
    position: { x: 120, y: 120 },
    data: {
      label: "开始",
      nodeType: "startNode",
      config: {}
    } satisfies WorkflowCanvasNodeData
  },
  {
    id: "endNode",
    type: "workflowNode",
    position: { x: 400, y: 120 },
    data: {
      label: "结束",
      nodeType: "endNode",
      config: {}
    } satisfies WorkflowCanvasNodeData
  }
];

const baseEdge = {
  id: "edge-trigger-output",
  source: "startNode",
  target: "endNode",
  type: "smoothstep",
  animated: false,
  data: {
    channel: "control" as const
  }
};

describe("workflow-editor quick add helpers", () => {
  it("localizes built-in start and end node display names", () => {
    const startNode = buildWorkflowCanvasNodeData(nodeCatalog, {
      label: "startNode",
      nodeType: "startNode",
      config: {}
    });

    expect(startNode).toMatchObject({
      label: "开始",
      typeLabel: "开始"
    });
    expect(startNode.inputSchema).toMatchObject({
      type: "object",
      properties: {
        query: { type: "string" },
        files: { type: "array" }
      },
      required: ["query"]
    });

    expect(
      buildWorkflowCanvasNodeData(nodeCatalog, {
        label: "endNode 2",
        nodeType: "endNode",
        config: {}
      })
    ).toMatchObject({
      label: "结束 2",
      typeLabel: "结束"
    });
  });

  it("builds a stable next-node insert position", () => {
    expect(buildWorkflowInsertedNodePosition({ x: 120, y: 120 }, 0)).toEqual({
      x: 480,
      y: 120
    });
    expect(buildWorkflowInsertedNodePosition({ x: 120, y: 120 }, 1)).toEqual({
      x: 480,
      y: 276
    });
    expect(buildWorkflowInsertedNodePosition({ x: 120, y: 120 }, 2)).toEqual({
      x: 480,
      y: -36
    });
  });

  it("inserts a node after the selected node and auto-connects it", () => {
    const result = insertNodeIntoCanvasGraph({
      nodeCatalog,
      nodes: baseNodes,
      edges: [],
      type: "llmAgentNode",
      sourceNodeId: "startNode"
    });

    expect(result.sourceNode?.id).toBe("startNode");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.source).toBe("startNode");
    expect(result.edges[0]?.target).toBe(result.nextNode.id);
    expect(result.nextNode.position).toEqual({ x: 480, y: 120 });
    expect(result.nextNode.data.typeLabel).toBe("LLM Agent");
    expect(result.nextNode.data.typeDescription).toBe("让 agent 继续推理。");
    expect(result.insertionMode).toBe("branch");
    expect(result.displacedTargetNode).toBeNull();
  });

  it("inserts inline when the source node already has a single downstream control edge", () => {
    const result = insertNodeIntoCanvasGraph({
      nodeCatalog,
      nodes: [
        {
          ...baseNodes[0],
          selected: true
        },
        baseNodes[1]
      ],
      edges: [
        {
          ...baseEdge,
          selected: true
        }
      ],
      type: "llmAgentNode",
      sourceNodeId: "startNode"
    });

    expect(result.insertionMode).toBe("inline");
    expect(result.sourceNode?.id).toBe("startNode");
    expect(result.displacedTargetNode?.id).toBe("endNode");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]?.source).toBe("startNode");
    expect(result.edges[0]?.target).toBe(result.nextNode.id);
    expect(result.edges[1]?.source).toBe(result.nextNode.id);
    expect(result.edges[1]?.target).toBe("endNode");
    expect(result.nextNode.position).toEqual({ x: 400, y: 120 });
    expect(result.nodes.find((node) => node.id === "endNode")?.position).toEqual({
      x: 760,
      y: 120
    });
    expect(result.nextNode.selected).toBe(true);
    expect(result.nodes.find((node) => node.id === "startNode")?.selected).toBe(false);
    expect(result.nodes.find((node) => node.id === "endNode")?.selected).not.toBe(true);
    expect(result.edges.some((edge) => edge.selected)).toBe(false);
  });

  it("keeps branch insertion when the source node already fans out", () => {
    const result = insertNodeIntoCanvasGraph({
      nodeCatalog,
      nodes: [
        ...baseNodes,
        {
          id: "output-secondary",
          type: "workflowNode",
          position: { x: 400, y: 300 },
          data: {
            label: "Output Secondary",
            nodeType: "endNode",
            config: {}
          } satisfies WorkflowCanvasNodeData
        }
      ],
      edges: [
        baseEdge,
        {
          id: "edge-trigger-output-secondary",
          source: "startNode",
          target: "output-secondary",
          type: "smoothstep",
          animated: false,
          data: {
            channel: "control" as const
          }
        }
      ],
      type: "llmAgentNode",
      sourceNodeId: "startNode"
    });

    expect(result.insertionMode).toBe("branch");
    expect(result.edges).toHaveLength(3);
    expect(result.edges[2]?.source).toBe("startNode");
    expect(result.edges[2]?.target).toBe(result.nextNode.id);
  });

  it("can insert inline into a selected control edge even when the source node fans out", () => {
    const result = insertNodeIntoCanvasGraph({
      nodeCatalog,
      nodes: [
        ...baseNodes,
        {
          id: "output-secondary",
          type: "workflowNode",
          position: { x: 400, y: 300 },
          data: {
            label: "Output Secondary",
            nodeType: "endNode",
            config: {}
          } satisfies WorkflowCanvasNodeData
        }
      ],
      edges: [
        baseEdge,
        {
          id: "edge-trigger-output-secondary",
          source: "startNode",
          target: "output-secondary",
          type: "smoothstep",
          animated: false,
          data: {
            channel: "control" as const
          }
        }
      ],
      type: "llmAgentNode",
      sourceNodeId: "startNode",
      sourceEdgeId: "edge-trigger-output-secondary"
    });

    expect(result.insertionMode).toBe("inline");
    expect(result.sourceNode?.id).toBe("startNode");
    expect(result.displacedTargetNode?.id).toBe("output-secondary");
    expect(result.nextNode.position).toEqual({ x: 400, y: 300 });
    expect(result.nodes.find((node) => node.id === "endNode")?.position).toEqual({
      x: 400,
      y: 120
    });
    expect(result.nodes.find((node) => node.id === "output-secondary")?.position).toEqual({
      x: 760,
      y: 300
    });
    expect(
      result.edges.find((edge) => edge.id === "edge-trigger-output-secondary")?.target
    ).toBe(result.nextNode.id);
    expect(result.edges.at(-1)?.source).toBe(result.nextNode.id);
    expect(result.edges.at(-1)?.target).toBe("output-secondary");
  });

  it("auto-targets the current source when quick-adding a reference node", () => {
    const result = insertNodeIntoCanvasGraph({
      nodeCatalog,
      nodes: baseNodes,
      edges: [],
      type: "referenceNode",
      sourceNodeId: "startNode"
    });

    expect(result.sourceNode?.id).toBe("startNode");
    expect(result.nextNode.data.typeLabel).toBe("Reference");
    expect(result.nextNode.data.config).toMatchObject({
      contextAccess: {
        readableNodeIds: ["startNode"]
      },
      reference: {
        sourceNodeId: "startNode",
        artifactType: "json"
      }
    });
  });

  it("surfaces llm/reference/tool/condition first in authoring order", () => {
    expect(
      sortWorkflowNodeCatalogForAuthoring([
        nodeCatalog[3],
        nodeCatalog[2],
        nodeCatalog[0],
        nodeCatalog[1]
      ]).map((item) => item.type)
    ).toEqual(["llmAgentNode", "referenceNode", "startNode", "endNode"]);

    expect(
      sortWorkflowNodeCatalogForAuthoring([
        nodeCatalog[3],
        nodeCatalog[2],
        {
          ...nodeCatalog[2],
          type: "toolNode",
          label: "Tool",
          palette: {
            ...nodeCatalog[2].palette,
            order: 10
          }
        },
        {
          ...nodeCatalog[2],
          type: "conditionNode",
          label: "Condition",
          palette: {
            ...nodeCatalog[2].palette,
            order: 11
          }
        },
        nodeCatalog[1]
      ]).map((item) => item.type)
    ).toEqual(["llmAgentNode", "referenceNode", "toolNode", "conditionNode", "endNode"]);
  });

  it("reconnects and closes the gap when removing an inline node", () => {
    const result = removeNodeFromCanvasGraph({
      nodeId: "agent",
      nodes: [
        baseNodes[0],
        {
          id: "agent",
          type: "workflowNode",
          position: { x: 400, y: 120 },
          data: {
            label: "LLM Agent",
            nodeType: "llmAgentNode",
            config: {}
          } satisfies WorkflowCanvasNodeData
        },
        {
          ...baseNodes[1],
          position: { x: 680, y: 120 }
        }
      ],
      edges: [
        {
          ...baseEdge,
          id: "edge-trigger-agent",
          target: "agent"
        },
        {
          ...baseEdge,
          id: "edge-agent-output",
          source: "agent",
          target: "endNode"
        }
      ]
    });

    expect(result.deletionMode).toBe("inline");
    expect(result.upstreamNode?.id).toBe("startNode");
    expect(result.downstreamNode?.id).toBe("endNode");
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.find((node) => node.id === "endNode")?.position).toEqual({
      x: 320,
      y: 120
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.source).toBe("startNode");
    expect(result.edges[0]?.target).toBe("endNode");
  });

  it("keeps delete detached when the removed node sits on conditional edges", () => {
    const result = removeNodeFromCanvasGraph({
      nodeId: "agent",
      nodes: [
        baseNodes[0],
        {
          id: "agent",
          type: "workflowNode",
          position: { x: 400, y: 120 },
          data: {
            label: "LLM Agent",
            nodeType: "llmAgentNode",
            config: {}
          } satisfies WorkflowCanvasNodeData
        },
        {
          ...baseNodes[1],
          position: { x: 680, y: 120 }
        }
      ],
      edges: [
        {
          ...baseEdge,
          id: "edge-trigger-agent",
          target: "agent"
        },
        {
          ...baseEdge,
          id: "edge-agent-output",
          source: "agent",
          target: "endNode",
          data: {
            channel: "control",
            condition: "succeeded"
          }
        }
      ]
    });

    expect(result.deletionMode).toBe("detached");
    expect(result.edges).toHaveLength(0);
    expect(result.nodes.find((node) => node.id === "endNode")?.position).toEqual({
      x: 680,
      y: 120
    });
  });
});
