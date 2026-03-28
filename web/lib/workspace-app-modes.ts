export type WorkspaceAppModeId = "all" | "chatflow" | "agent" | "tool_agent" | "sandbox";

export type WorkspaceDefinitionLike = {
  nodeTypes?: string[];
  nodes?: Array<{
    type?: string | null;
    [key: string]: unknown;
  }>;
};

function collectNodeTypes(definition: WorkspaceDefinitionLike) {
  if (Array.isArray(definition.nodeTypes) && definition.nodeTypes.length > 0) {
    return definition.nodeTypes.filter((nodeType): nodeType is string => typeof nodeType === "string" && nodeType.length > 0);
  }

  return (definition.nodes ?? [])
    .map((node) => (typeof node.type === "string" ? node.type : ""))
    .filter(Boolean);
}

export type WorkspaceAppModeMeta = {
  id: Exclude<WorkspaceAppModeId, "all">;
  label: string;
  shortLabel: string;
  description: string;
};

const WORKSPACE_APP_MODE_META: Record<WorkspaceAppModeMeta["id"], WorkspaceAppModeMeta> = {
  chatflow: {
    id: "chatflow",
    label: "ChatFlow",
    shortLabel: "ChatFlow",
    description: "保留最小 trigger -> output 入口，适合从应用骨架继续进入 xyflow。"
  },
  agent: {
    id: "agent",
    label: "Agent",
    shortLabel: "Agent",
    description: "优先把 LLM Agent 节点放上画布，再继续补 prompt、上下文授权和输出结构。"
  },
  tool_agent: {
    id: "tool_agent",
    label: "Tool Agent",
    shortLabel: "工具 Agent",
    description: "先把工具绑定与 Agent 调用链打通，再继续完善治理和失败处理。"
  },
  sandbox: {
    id: "sandbox",
    label: "Sandbox",
    shortLabel: "Sandbox",
    description: "适合先验证强隔离节点、沙盒执行与运行追踪链路。"
  }
};

const ORDERED_WORKSPACE_APP_MODE_IDS: WorkspaceAppModeMeta["id"][] = [
  "chatflow",
  "agent",
  "tool_agent",
  "sandbox"
];

export function listWorkspaceAppModes() {
  return ORDERED_WORKSPACE_APP_MODE_IDS.map((modeId) => WORKSPACE_APP_MODE_META[modeId]);
}

export function getWorkspaceAppModeMeta(modeId: WorkspaceAppModeMeta["id"]) {
  return WORKSPACE_APP_MODE_META[modeId];
}

export function isWorkspaceAppModeId(value: string): value is WorkspaceAppModeId {
  return value === "all" || ORDERED_WORKSPACE_APP_MODE_IDS.includes(value as WorkspaceAppModeMeta["id"]);
}

export function inferWorkspaceAppMode(definition: WorkspaceDefinitionLike): WorkspaceAppModeMeta["id"] {
  const nodeTypes = new Set(collectNodeTypes(definition));

  if (nodeTypes.has("sandbox_code")) {
    return "sandbox";
  }

  if (nodeTypes.has("tool")) {
    return "tool_agent";
  }

  if (nodeTypes.has("llm_agent")) {
    return "agent";
  }

  return "chatflow";
}
