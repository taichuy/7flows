import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowDefinition } from "@/lib/workflow-editor";

export type WorkflowToolReferenceValidationIssue = {
  nodeId: string;
  nodeName: string;
  message: string;
};

export function buildWorkflowToolReferenceValidationIssues(
  definition: WorkflowDefinition,
  tools: PluginToolRegistryItem[]
): WorkflowToolReferenceValidationIssue[] {
  if (!Array.isArray(definition?.nodes) || tools.length === 0) {
    return [];
  }

  const toolIndex = new Map(tools.map((tool) => [tool.id, tool]));
  const issues: WorkflowToolReferenceValidationIssue[] = [];

  definition.nodes.forEach((node) => {
    const nodeId = typeof node?.id === "string" && node.id.trim() ? node.id.trim() : "unknown-node";
    const nodeName =
      typeof node?.name === "string" && node.name.trim() ? node.name.trim() : nodeId;
    const config = toRecord(node?.config);
    if (!config) {
      return;
    }

    if (node?.type === "tool") {
      issues.push(...buildToolNodeIssues({ nodeId, nodeName, config, toolIndex }));
      return;
    }

    if (node?.type === "llm_agent") {
      issues.push(...buildAgentToolPolicyIssues({ nodeId, nodeName, config, toolIndex }));
    }
  });

  const dedupedIssues: WorkflowToolReferenceValidationIssue[] = [];
  issues.forEach((issue) => {
    if (!dedupedIssues.some((candidate) => candidate.message === issue.message)) {
      dedupedIssues.push(issue);
    }
  });
  return dedupedIssues;
}

function buildToolNodeIssues({
  nodeId,
  nodeName,
  config,
  toolIndex
}: {
  nodeId: string;
  nodeName: string;
  config: Record<string, unknown>;
  toolIndex: Map<string, PluginToolRegistryItem>;
}): WorkflowToolReferenceValidationIssue[] {
  const binding = toRecord(config.tool);
  const toolId = normalizeString(binding?.toolId ?? config.toolId);
  const ecosystem = normalizeString(binding?.ecosystem);
  if (!toolId) {
    return [];
  }

  const tool = toolIndex.get(toolId);
  if (!tool) {
    return [
      {
        nodeId,
        nodeName,
        message: `Tool 节点 ${nodeName} (${nodeId}) 引用了当前目录中不存在的工具 ${toolId}。`
      }
    ];
  }

  if (ecosystem && ecosystem !== tool.ecosystem) {
    return [
      {
        nodeId,
        nodeName,
        message: `Tool 节点 ${nodeName} (${nodeId}) 声明的 ecosystem ${ecosystem} 与目录工具 ${toolId} 的 ecosystem ${tool.ecosystem} 不一致。`
      }
    ];
  }

  return [];
}

function buildAgentToolPolicyIssues({
  nodeId,
  nodeName,
  config,
  toolIndex
}: {
  nodeId: string;
  nodeName: string;
  config: Record<string, unknown>;
  toolIndex: Map<string, PluginToolRegistryItem>;
}): WorkflowToolReferenceValidationIssue[] {
  const toolPolicy = toRecord(config.toolPolicy);
  if (!toolPolicy || !Array.isArray(toolPolicy.allowedToolIds)) {
    return [];
  }

  const missingToolIds = Array.from(
    new Set(
      toolPolicy.allowedToolIds
        .map((toolId) => normalizeString(toolId))
        .filter((toolId): toolId is string => toolId !== null)
        .filter((toolId) => !toolIndex.has(toolId))
    )
  ).sort();
  if (missingToolIds.length === 0) {
    return [];
  }

  return [
    {
      nodeId,
      nodeName,
      message: `LLM Agent 节点 ${nodeName} (${nodeId}) 的 toolPolicy.allowedToolIds 引用了当前目录中不存在的工具：${missingToolIds.join(
        ", "
      )}。`
    }
  ];
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
