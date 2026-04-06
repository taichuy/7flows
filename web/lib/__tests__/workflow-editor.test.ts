import { describe, expect, it } from "vitest";

import type { WorkflowNodeCatalogItem } from "../get-workflow-library";
import { sortWorkflowNodeCatalogForAuthoring } from "../workflow-node-catalog";
import {
  buildWorkflowInsertedNodePosition,
  insertNodeIntoCanvasGraph,
  removeNodeFromCanvasGraph,
  type WorkflowCanvasNodeData
} from "../workflow-editor";

const nodeCatalog: WorkflowNodeCatalogItem[] = [
  {
    type: "trigger",
    label: "Trigger",
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
      name: "Trigger",
      config: {}
    }
  },
  {
    type: "llm_agent",
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
    type: "reference",
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
    type: "output",
    label: "Output",
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
      name: "Output",
      config: {}
    }
  }
];

const baseNodes = [
  {
    id: "trigger",
    type: "workflowNode",
    position: { x: 120, y: 120 },
    data: {
      label: "Trigger",
      nodeType: "trigger",
      config: {}
    } satisfies WorkflowCanvasNodeData
  },
  {
    id: "output",
    type: "workflowNode",
    position: { x: 400, y: 120 },
    data: {
      label: "Output",
      nodeType: "output",
      config: {}
    } satisfies WorkflowCanvasNodeData
  }
];

const baseEdge = {
  id: "edge-trigger-output",
  source: "trigger",
  target: "output",
  type: "smoothstep",
  animated: false,
  data: {
    channel: "control" as const
  }
};

describe("workflow-editor quick add helpers", () => {
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
      type: "llm_agent",
      sourceNodeId: "trigger"
    });

    expect(result.sourceNode?.id).toBe("trigger");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.source).toBe("trigger");
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
      type: "llm_agent",
      sourceNodeId: "trigger"
    });

    expect(result.insertionMode).toBe("inline");
    expect(result.sourceNode?.id).toBe("trigger");
    expect(result.displacedTargetNode?.id).toBe("output");
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0]?.source).toBe("trigger");
    expect(result.edges[0]?.target).toBe(result.nextNode.id);
    expect(result.edges[1]?.source).toBe(result.nextNode.id);
    expect(result.edges[1]?.target).toBe("output");
    expect(result.nextNode.position).toEqual({ x: 400, y: 120 });
    expect(result.nodes.find((node) => node.id === "output")?.position).toEqual({
      x: 760,
      y: 120
    });
    expect(result.nextNode.selected).toBe(true);
    expect(result.nodes.find((node) => node.id === "trigger")?.selected).toBe(false);
    expect(result.nodes.find((node) => node.id === "output")?.selected).not.toBe(true);
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
            nodeType: "output",
            config: {}
          } satisfies WorkflowCanvasNodeData
        }
      ],
      edges: [
        baseEdge,
        {
          id: "edge-trigger-output-secondary",
          source: "trigger",
          target: "output-secondary",
          type: "smoothstep",
          animated: false,
          data: {
            channel: "control" as const
          }
        }
      ],
      type: "llm_agent",
      sourceNodeId: "trigger"
    });

    expect(result.insertionMode).toBe("branch");
    expect(result.edges).toHaveLength(3);
    expect(result.edges[2]?.source).toBe("trigger");
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
            nodeType: "output",
            config: {}
          } satisfies WorkflowCanvasNodeData
        }
      ],
      edges: [
        baseEdge,
        {
          id: "edge-trigger-output-secondary",
          source: "trigger",
          target: "output-secondary",
          type: "smoothstep",
          animated: false,
          data: {
            channel: "control" as const
          }
        }
      ],
      type: "llm_agent",
      sourceNodeId: "trigger",
      sourceEdgeId: "edge-trigger-output-secondary"
    });

    expect(result.insertionMode).toBe("inline");
    expect(result.sourceNode?.id).toBe("trigger");
    expect(result.displacedTargetNode?.id).toBe("output-secondary");
    expect(result.nextNode.position).toEqual({ x: 400, y: 300 });
    expect(result.nodes.find((node) => node.id === "output")?.position).toEqual({
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
      type: "reference",
      sourceNodeId: "trigger"
    });

    expect(result.sourceNode?.id).toBe("trigger");
    expect(result.nextNode.data.typeLabel).toBe("Reference");
    expect(result.nextNode.data.config).toMatchObject({
      contextAccess: {
        readableNodeIds: ["trigger"]
      },
      reference: {
        sourceNodeId: "trigger",
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
    ).toEqual(["llm_agent", "reference", "trigger", "output"]);

    expect(
      sortWorkflowNodeCatalogForAuthoring([
        nodeCatalog[3],
        nodeCatalog[2],
        {
          ...nodeCatalog[2],
          type: "tool",
          label: "Tool",
          palette: {
            ...nodeCatalog[2].palette,
            order: 10
          }
        },
        {
          ...nodeCatalog[2],
          type: "condition",
          label: "Condition",
          palette: {
            ...nodeCatalog[2].palette,
            order: 11
          }
        },
        nodeCatalog[1]
      ]).map((item) => item.type)
    ).toEqual(["llm_agent", "reference", "tool", "condition", "output"]);
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
            nodeType: "llm_agent",
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
          target: "output"
        }
      ]
    });

    expect(result.deletionMode).toBe("inline");
    expect(result.upstreamNode?.id).toBe("trigger");
    expect(result.downstreamNode?.id).toBe("output");
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.find((node) => node.id === "output")?.position).toEqual({
      x: 320,
      y: 120
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.source).toBe("trigger");
    expect(result.edges[0]?.target).toBe("output");
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
            nodeType: "llm_agent",
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
          target: "output",
          data: {
            channel: "control",
            condition: "succeeded"
          }
        }
      ]
    });

    expect(result.deletionMode).toBe("detached");
    expect(result.edges).toHaveLength(0);
    expect(result.nodes.find((node) => node.id === "output")?.position).toEqual({
      x: 680,
      y: 120
    });
  });
});
