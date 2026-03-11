import {
  buildCatalogNodeDefinition,
  getWorkflowNodeCatalogItem,
  type WorkflowNodeType
} from "@/lib/workflow-node-catalog";
import type { WorkflowDefinition } from "@/lib/workflow-editor";

export type WorkflowStarterId = "blank" | "agent" | "tooling";

export type WorkflowStarterTemplate = {
  id: WorkflowStarterId;
  name: string;
  description: string;
  businessTrack: string;
  defaultWorkflowName: string;
  nodeCount: number;
  nodeLabels: string[];
  tags: string[];
};

type WorkflowStarterBlueprint = Omit<WorkflowStarterTemplate, "nodeCount" | "nodeLabels"> & {
  nodes: Array<{
    id: string;
    type: WorkflowNodeType;
    name?: string;
    position?: { x: number; y: number };
    config?: Record<string, unknown>;
  }>;
  edges: NonNullable<WorkflowDefinition["edges"]>;
};

const WORKFLOW_STARTER_BLUEPRINTS: WorkflowStarterBlueprint[] = [
  {
    id: "blank",
    name: "Blank Flow",
    description: "保留最小 trigger -> output 骨架，适合从零开始搭应用入口。",
    businessTrack: "应用新建编排",
    defaultWorkflowName: "Blank Workflow",
    tags: ["最小骨架", "可立即运行", "适合打草稿"],
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 140, y: 220 }
      },
      {
        id: "output",
        type: "output",
        position: { x: 520, y: 220 }
      }
    ],
    edges: [createEdge("edge_trigger_output", "trigger", "output")]
  },
  {
    id: "agent",
    name: "Agent Draft",
    description: "预留一个 LLM Agent 节点，方便继续补提示词、上下文授权和输出结构。",
    businessTrack: "编排节点能力",
    defaultWorkflowName: "Agent Workflow",
    tags: ["LLM Agent", "多 Agent 起点", "便于继续扩节点"],
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 100, y: 220 }
      },
      {
        id: "agent",
        type: "llm_agent",
        name: "Planner Agent",
        position: { x: 420, y: 220 },
        config: {
          prompt: "Describe how this agent should respond.",
          role: "planner"
        }
      },
      {
        id: "output",
        type: "output",
        position: { x: 760, y: 220 },
        config: {
          format: "text"
        }
      }
    ],
    edges: [
      createEdge("edge_trigger_agent", "trigger", "agent"),
      createEdge("edge_agent_output", "agent", "output")
    ]
  },
  {
    id: "tooling",
    name: "Tool Pipeline",
    description: "预留一个 tool 节点，创建后即可在编辑器里绑定 catalog tool 或 compat tool。",
    businessTrack: "Dify 插件兼容",
    defaultWorkflowName: "Tool Workflow",
    tags: ["工具节点", "插件目录", "compat 入口"],
    nodes: [
      {
        id: "trigger",
        type: "trigger",
        position: { x: 100, y: 220 }
      },
      {
        id: "tool",
        type: "tool",
        name: "Tool Node",
        position: { x: 420, y: 220 },
        config: {
          notes: "Bind a catalog tool from the inspector after creation."
        }
      },
      {
        id: "output",
        type: "output",
        position: { x: 760, y: 220 }
      }
    ],
    edges: [
      createEdge("edge_trigger_tool", "trigger", "tool"),
      createEdge("edge_tool_output", "tool", "output")
    ]
  }
];

export const WORKFLOW_STARTER_TEMPLATES: WorkflowStarterTemplate[] =
  WORKFLOW_STARTER_BLUEPRINTS.map((starter) => ({
    id: starter.id,
    name: starter.name,
    description: starter.description,
    businessTrack: starter.businessTrack,
    defaultWorkflowName: starter.defaultWorkflowName,
    nodeCount: starter.nodes.length,
    nodeLabels: starter.nodes.map(
      (node) => getWorkflowNodeCatalogItem(node.type)?.label ?? node.type
    ),
    tags: starter.tags
  }));

export function buildWorkflowStarterDefinition(
  starterId: WorkflowStarterId
): WorkflowDefinition {
  const starter =
    WORKFLOW_STARTER_BLUEPRINTS.find((item) => item.id === starterId) ??
    WORKFLOW_STARTER_BLUEPRINTS[0];

  return {
    nodes: starter.nodes.map((node) => buildCatalogNodeDefinition(node)),
    edges: starter.edges.map((edge) => ({ ...edge })),
    variables: [],
    publish: []
  };
}

function createEdge(id: string, sourceNodeId: string, targetNodeId: string) {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    channel: "control" as const
  };
}
