import type { WorkflowDetail, WorkflowNodeItem } from "@/lib/get-workflows";

export type WorkflowDefinition = WorkflowDetail["definition"];
export type WorkflowNodeType =
  | "trigger"
  | "llm_agent"
  | "tool"
  | "sandbox_code"
  | "mcp_query"
  | "condition"
  | "router"
  | "loop"
  | "output";

export type WorkflowBusinessTrack =
  | "应用新建编排"
  | "编排节点能力"
  | "Dify 插件兼容"
  | "API 调用开放";

export type WorkflowNodeCatalogItem = {
  type: WorkflowNodeType;
  label: string;
  description: string;
  ecosystem: "native";
  capabilityGroup: "entry" | "agent" | "integration" | "logic" | "output";
  businessTrack: WorkflowBusinessTrack;
  tags: string[];
  palette: {
    enabled: boolean;
    order: number;
    defaultPosition: { x: number; y: number };
  };
  defaults: {
    name: string;
    config: Record<string, unknown>;
  };
};

type WorkflowCatalogNodeBlueprint = {
  id: string;
  type: WorkflowNodeType;
  name?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
};

const WORKFLOW_NODE_CATALOG: WorkflowNodeCatalogItem[] = [
  {
    type: "trigger",
    label: "Trigger",
    description: "工作流入口节点，负责接收用户请求、表单输入或 API 调用。",
    ecosystem: "native",
    capabilityGroup: "entry",
    businessTrack: "应用新建编排",
    tags: ["入口", "native", "workflow"],
    palette: {
      enabled: false,
      order: 0,
      defaultPosition: { x: 80, y: 200 }
    },
    defaults: {
      name: "Trigger",
      config: {}
    }
  },
  {
    type: "llm_agent",
    label: "LLM Agent",
    description: "承载模型推理、角色设定和上下文授权的核心编排节点。",
    ecosystem: "native",
    capabilityGroup: "agent",
    businessTrack: "编排节点能力",
    tags: ["agent", "llm", "native"],
    palette: {
      enabled: true,
      order: 10,
      defaultPosition: { x: 340, y: 120 }
    },
    defaults: {
      name: "LLM Agent",
      config: {}
    }
  },
  {
    type: "tool",
    label: "Tool",
    description: "绑定 native 或 compat tool catalog 的工具能力入口。",
    ecosystem: "native",
    capabilityGroup: "integration",
    businessTrack: "Dify 插件兼容",
    tags: ["tool", "catalog", "compat-ready"],
    palette: {
      enabled: true,
      order: 20,
      defaultPosition: { x: 340, y: 280 }
    },
    defaults: {
      name: "Tool",
      config: {}
    }
  },
  {
    type: "mcp_query",
    label: "MCP Query",
    description: "按授权读取上游上下文，为 Agent 或工具提供受控查询入口。",
    ecosystem: "native",
    capabilityGroup: "integration",
    businessTrack: "编排节点能力",
    tags: ["mcp", "context", "authorized"],
    palette: {
      enabled: true,
      order: 30,
      defaultPosition: { x: 620, y: 120 }
    },
    defaults: {
      name: "MCP Query",
      config: {
        query: {
          type: "authorized_context"
        }
      }
    }
  },
  {
    type: "condition",
    label: "Condition",
    description: "基于 selector 或安全表达式进行条件分支。",
    ecosystem: "native",
    capabilityGroup: "logic",
    businessTrack: "编排节点能力",
    tags: ["branch", "logic", "safe-expression"],
    palette: {
      enabled: true,
      order: 40,
      defaultPosition: { x: 620, y: 280 }
    },
    defaults: {
      name: "Condition",
      config: {}
    }
  },
  {
    type: "router",
    label: "Router",
    description: "根据意图或规则把请求路由到不同分支和节点链路。",
    ecosystem: "native",
    capabilityGroup: "logic",
    businessTrack: "编排节点能力",
    tags: ["router", "branch", "decision"],
    palette: {
      enabled: true,
      order: 50,
      defaultPosition: { x: 620, y: 420 }
    },
    defaults: {
      name: "Router",
      config: {}
    }
  },
  {
    type: "output",
    label: "Output",
    description: "聚合并整形最终结果，为后续发布映射和响应输出做准备。",
    ecosystem: "native",
    capabilityGroup: "output",
    businessTrack: "API 调用开放",
    tags: ["output", "response", "publish-ready"],
    palette: {
      enabled: true,
      order: 60,
      defaultPosition: { x: 900, y: 200 }
    },
    defaults: {
      name: "Output",
      config: {
        format: "json"
      }
    }
  }
];

const WORKFLOW_NODE_CATALOG_BY_TYPE = new Map(
  WORKFLOW_NODE_CATALOG.map((item) => [item.type, item])
);

export const WORKFLOW_NODE_PALETTE = WORKFLOW_NODE_CATALOG.filter(
  (item) => item.palette.enabled
).sort((left, right) => left.palette.order - right.palette.order);

export function getWorkflowNodeCatalogItem(type: string) {
  return WORKFLOW_NODE_CATALOG_BY_TYPE.get(type as WorkflowNodeType) ?? null;
}

export function getPaletteNodeCatalog() {
  return WORKFLOW_NODE_PALETTE;
}

export function getWorkflowNodeDefaultPosition(type: string) {
  const item = getWorkflowNodeCatalogItem(type);
  return item?.palette.defaultPosition ?? { x: 240, y: 120 };
}

export function buildCatalogNodeDefinition(
  blueprint: WorkflowCatalogNodeBlueprint
): WorkflowNodeItem {
  const item = getWorkflowNodeCatalogItem(blueprint.type);
  const baseConfig = item ? structuredClone(item.defaults.config) : {};

  return {
    id: blueprint.id,
    type: blueprint.type,
    name: blueprint.name ?? item?.defaults.name ?? blueprint.type,
    config: withCanvasPosition(
      {
        ...baseConfig,
        ...(blueprint.config ?? {})
      },
      blueprint.position ?? getWorkflowNodeDefaultPosition(blueprint.type)
    )
  };
}

function withCanvasPosition(
  config: Record<string, unknown>,
  position: { x: number; y: number }
) {
  const nextConfig = structuredClone(config);
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

function toOptionalRecord(value: unknown) {
  return isRecord(value) ? { ...value } : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
