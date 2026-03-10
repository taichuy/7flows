import type { WorkflowDefinition } from "@/lib/workflow-editor";

export type WorkflowStarterId = "blank" | "agent" | "tooling";

export type WorkflowStarterTemplate = {
  id: WorkflowStarterId;
  name: string;
  description: string;
  businessTrack: string;
  defaultWorkflowName: string;
  nodeCount: number;
  tags: string[];
};

export const WORKFLOW_STARTER_TEMPLATES: WorkflowStarterTemplate[] = [
  {
    id: "blank",
    name: "Blank Flow",
    description: "保留最小 trigger -> output 骨架，适合从零开始搭应用入口。",
    businessTrack: "应用新建编排",
    defaultWorkflowName: "Blank Workflow",
    nodeCount: 2,
    tags: ["最小骨架", "可立即运行", "适合打草稿"]
  },
  {
    id: "agent",
    name: "Agent Draft",
    description: "预留一个 LLM Agent 节点，方便继续补提示词、上下文授权和输出结构。",
    businessTrack: "编排节点能力",
    defaultWorkflowName: "Agent Workflow",
    nodeCount: 3,
    tags: ["LLM Agent", "多 Agent 起点", "便于继续扩节点"]
  },
  {
    id: "tooling",
    name: "Tool Pipeline",
    description: "预留一个 tool 节点，创建后即可在编辑器里绑定 catalog tool 或 compat tool。",
    businessTrack: "Dify 插件兼容",
    defaultWorkflowName: "Tool Workflow",
    nodeCount: 3,
    tags: ["工具节点", "插件目录", "compat 入口"]
  }
];

export function buildWorkflowStarterDefinition(
  starterId: WorkflowStarterId
): WorkflowDefinition {
  switch (starterId) {
    case "agent":
      return {
        nodes: [
          createNode("trigger", "trigger", "Trigger", { x: 100, y: 220 }),
          createNode("agent", "llm_agent", "Planner Agent", { x: 420, y: 220 }, {
            prompt: "Describe how this agent should respond.",
            role: "planner"
          }),
          createNode("output", "output", "Output", { x: 760, y: 220 }, {
            format: "text"
          })
        ],
        edges: [
          createEdge("edge_trigger_agent", "trigger", "agent"),
          createEdge("edge_agent_output", "agent", "output")
        ],
        variables: [],
        publish: []
      };
    case "tooling":
      return {
        nodes: [
          createNode("trigger", "trigger", "Trigger", { x: 100, y: 220 }),
          createNode("tool", "tool", "Tool Node", { x: 420, y: 220 }, {
            notes: "Bind a catalog tool from the inspector after creation."
          }),
          createNode("output", "output", "Output", { x: 760, y: 220 }, {
            format: "json"
          })
        ],
        edges: [
          createEdge("edge_trigger_tool", "trigger", "tool"),
          createEdge("edge_tool_output", "tool", "output")
        ],
        variables: [],
        publish: []
      };
    case "blank":
    default:
      return {
        nodes: [
          createNode("trigger", "trigger", "Trigger", { x: 140, y: 220 }),
          createNode("output", "output", "Output", { x: 520, y: 220 }, {
            format: "json"
          })
        ],
        edges: [createEdge("edge_trigger_output", "trigger", "output")],
        variables: [],
        publish: []
      };
  }
}

function createNode(
  id: string,
  type: string,
  name: string,
  position: { x: number; y: number },
  config: Record<string, unknown> = {}
) {
  return {
    id,
    type,
    name,
    config: {
      ...config,
      ui: {
        position
      }
    }
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
