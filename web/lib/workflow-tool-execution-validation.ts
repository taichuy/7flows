import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type { WorkflowDefinition } from "@/lib/workflow-editor";

export type WorkflowToolExecutionValidationIssue = {
  nodeId: string;
  nodeName: string;
  message: string;
};

export function buildWorkflowToolExecutionValidationIssues(
  definition: WorkflowDefinition,
  tools: PluginToolRegistryItem[],
  adapters: PluginAdapterRegistryItem[],
  workspaceId = "default"
): WorkflowToolExecutionValidationIssue[] {
  if (!Array.isArray(definition?.nodes) || tools.length === 0) {
    return [];
  }

  const toolIndex = new Map(tools.map((tool) => [tool.id, tool]));
  const visibleAdapters = adapters.filter((adapter) => isAdapterVisible(adapter, workspaceId));
  const issues: WorkflowToolExecutionValidationIssue[] = [];

  definition.nodes.forEach((node) => {
    const nodeId = typeof node?.id === "string" && node.id.trim() ? node.id.trim() : "unknown-node";
    const nodeName =
      typeof node?.name === "string" && node.name.trim() ? node.name.trim() : nodeId;
    const config = toRecord(node?.config);
    if (!config) {
      return;
    }

    if (node?.type === "tool") {
      issues.push(
        ...buildToolNodeExecutionIssues({
          node,
          nodeId,
          nodeName,
          config,
          toolIndex,
          adapters: visibleAdapters
        })
      );
      return;
    }

    if (node?.type === "llm_agent") {
      issues.push(
        ...buildAgentExecutionIssues({
          nodeId,
          nodeName,
          config,
          toolIndex,
          adapters: visibleAdapters
        })
      );
    }
  });

  const dedupedIssues: WorkflowToolExecutionValidationIssue[] = [];
  issues.forEach((issue) => {
    if (!dedupedIssues.some((candidate) => candidate.message === issue.message)) {
      dedupedIssues.push(issue);
    }
  });
  return dedupedIssues;
}

function buildToolNodeExecutionIssues({
  node,
  nodeId,
  nodeName,
  config,
  toolIndex,
  adapters
}: {
  node: { runtimePolicy?: unknown };
  nodeId: string;
  nodeName: string;
  config: Record<string, unknown>;
  toolIndex: Map<string, PluginToolRegistryItem>;
  adapters: PluginAdapterRegistryItem[];
}): WorkflowToolExecutionValidationIssue[] {
  const binding = toRecord(config.tool);
  const toolId = normalizeString(binding?.toolId ?? config.toolId);
  const ecosystem = normalizeString(binding?.ecosystem);
  const adapterId = normalizeString(binding?.adapterId);
  if (!toolId) {
    return [];
  }

  const tool = toolIndex.get(toolId);
  if (!tool) {
    return [];
  }

  const issues: WorkflowToolExecutionValidationIssue[] = [];
  if (adapterId) {
    const adapterIssue = validateExplicitAdapterBinding({
      context: `Tool 节点 ${nodeName} (${nodeId})`,
      toolId,
      ecosystem: ecosystem ?? tool.ecosystem,
      adapterId,
      adapters,
      nodeId,
      nodeName
    });
    if (adapterIssue) {
      issues.push(adapterIssue);
      return issues;
    }
  }

  const requestedExecutionClass = extractExplicitExecutionClass(
    toRecord(node?.runtimePolicy)?.execution
  );
  if (!requestedExecutionClass) {
    return issues;
  }

  const capabilityIssue = buildExecutionCapabilityIssue({
    context: `Tool 节点 ${nodeName} (${nodeId})`,
    nodeId,
    nodeName,
    toolId,
    tool,
    ecosystem,
    adapterId,
    requestedExecutionClass,
    adapters
  });
  if (capabilityIssue) {
    issues.push(capabilityIssue);
  }
  return issues;
}

function buildAgentExecutionIssues({
  nodeId,
  nodeName,
  config,
  toolIndex,
  adapters
}: {
  nodeId: string;
  nodeName: string;
  config: Record<string, unknown>;
  toolIndex: Map<string, PluginToolRegistryItem>;
  adapters: PluginAdapterRegistryItem[];
}): WorkflowToolExecutionValidationIssue[] {
  const issues: WorkflowToolExecutionValidationIssue[] = [];
  const toolPolicy = toRecord(config.toolPolicy);
  const mockPlan = toRecord(config.mockPlan);

  const policyExecutionClass = extractExplicitExecutionClass(toolPolicy?.execution);
  if (toolPolicy && Array.isArray(toolPolicy.allowedToolIds) && policyExecutionClass) {
    const seen = new Set<string>();
    toolPolicy.allowedToolIds.forEach((item) => {
      const toolId = normalizeString(item);
      if (!toolId || seen.has(toolId)) {
        return;
      }
      seen.add(toolId);

      const tool = toolIndex.get(toolId);
      if (!tool) {
        return;
      }

      const capabilityIssue = buildExecutionCapabilityIssue({
        context: `LLM Agent 节点 ${nodeName} (${nodeId}) 的 toolPolicy.allowedToolIds`,
        nodeId,
        nodeName,
        toolId,
        tool,
        ecosystem: tool.ecosystem,
        adapterId: null,
        requestedExecutionClass: policyExecutionClass,
        adapters
      });
      if (capabilityIssue) {
        issues.push(capabilityIssue);
      }
    });
  }

  if (mockPlan && Array.isArray(mockPlan.toolCalls)) {
    mockPlan.toolCalls.forEach((rawToolCall, index) => {
      const toolCall = toRecord(rawToolCall);
      if (!toolCall) {
        return;
      }

      const toolId = normalizeString(toolCall.toolId);
      if (!toolId) {
        return;
      }

      const tool = toolIndex.get(toolId);
      if (!tool) {
        return;
      }

      const ecosystem = normalizeString(toolCall.ecosystem);
      const adapterId = normalizeString(toolCall.adapterId);
      if (adapterId) {
        const adapterIssue = validateExplicitAdapterBinding({
          context: `LLM Agent 节点 ${nodeName} (${nodeId}) 的 mockPlan.toolCalls[${index + 1}]`,
          toolId,
          ecosystem: ecosystem ?? tool.ecosystem,
          adapterId,
          adapters,
          nodeId,
          nodeName
        });
        if (adapterIssue) {
          issues.push(adapterIssue);
          return;
        }
      }

      const requestedExecutionClass = extractExplicitExecutionClass(toolCall.execution);
      if (!requestedExecutionClass) {
        return;
      }

      const capabilityIssue = buildExecutionCapabilityIssue({
        context: `LLM Agent 节点 ${nodeName} (${nodeId}) 的 mockPlan.toolCalls[${index + 1}]`,
        nodeId,
        nodeName,
        toolId,
        tool,
        ecosystem,
        adapterId,
        requestedExecutionClass,
        adapters
      });
      if (capabilityIssue) {
        issues.push(capabilityIssue);
      }
    });
  }

  return issues;
}

function validateExplicitAdapterBinding({
  context,
  toolId,
  ecosystem,
  adapterId,
  adapters,
  nodeId,
  nodeName
}: {
  context: string;
  toolId: string;
  ecosystem: string;
  adapterId: string;
  adapters: PluginAdapterRegistryItem[];
  nodeId: string;
  nodeName: string;
}): WorkflowToolExecutionValidationIssue | null {
  const adapter = adapters.find((item) => item.id === adapterId);
  if (!adapter) {
    return {
      nodeId,
      nodeName,
      message: `${context} 绑定了 adapter ${adapterId}，但当前 workspace 看不到这个 adapter，工具 ${toolId} 无法按该绑定执行。`
    };
  }
  if (adapter.ecosystem !== ecosystem) {
    return {
      nodeId,
      nodeName,
      message: `${context} 绑定的 adapter ${adapterId} 服务于 ${adapter.ecosystem}，与工具 ${toolId} 需要的 ${ecosystem} 不一致。`
    };
  }
  if (!adapter.enabled) {
    return {
      nodeId,
      nodeName,
      message: `${context} 绑定的 adapter ${adapterId} 当前已禁用，工具 ${toolId} 不能按该绑定执行。`
    };
  }
  return null;
}

function buildExecutionCapabilityIssue({
  context,
  nodeId,
  nodeName,
  toolId,
  tool,
  ecosystem,
  adapterId,
  requestedExecutionClass,
  adapters
}: {
  context: string;
  nodeId: string;
  nodeName: string;
  toolId: string;
  tool: PluginToolRegistryItem;
  ecosystem: string | null;
  adapterId: string | null;
  requestedExecutionClass: string;
  adapters: PluginAdapterRegistryItem[];
}): WorkflowToolExecutionValidationIssue | null {
  if (tool.ecosystem === "native") {
    if (requestedExecutionClass === "inline") {
      return null;
    }
    return {
      nodeId,
      nodeName,
      message: `${context} 显式请求了 ${requestedExecutionClass}，但原生工具 ${toolId} 当前只支持 inline。`
    };
  }

  const resolvedEcosystem = ecosystem ?? tool.ecosystem;
  if (resolvedEcosystem !== tool.ecosystem) {
    return null;
  }

  const adapter = resolveAdapterForExecution({
    ecosystem: resolvedEcosystem,
    adapterId,
    adapters
  });
  if (!adapter) {
    return {
      nodeId,
      nodeName,
      message: `${context} 显式请求了 ${requestedExecutionClass}，但当前没有可用 adapter 能为 ${toolId} 提供 ${resolvedEcosystem} 执行入口。`
    };
  }

  const supportedExecutionClasses = adapter.supported_execution_classes?.length
    ? adapter.supported_execution_classes
    : ["subprocess"];
  if (supportedExecutionClasses.includes(requestedExecutionClass)) {
    return null;
  }

  return {
    nodeId,
    nodeName,
    message: `${context} 显式请求了 ${requestedExecutionClass}，但 adapter ${adapter.id} 当前只支持 ${supportedExecutionClasses.join(
      ", "
    )}。`
  };
}

function resolveAdapterForExecution({
  ecosystem,
  adapterId,
  adapters
}: {
  ecosystem: string;
  adapterId: string | null;
  adapters: PluginAdapterRegistryItem[];
}) {
  if (adapterId) {
    return adapters.find(
      (adapter) => adapter.id === adapterId && adapter.enabled && adapter.ecosystem === ecosystem
    );
  }

  return adapters.find((adapter) => adapter.enabled && adapter.ecosystem === ecosystem) ?? null;
}

function extractExplicitExecutionClass(value: unknown) {
  const record = toRecord(value);
  return normalizeString(record?.class);
}

function isAdapterVisible(adapter: PluginAdapterRegistryItem, workspaceId: string) {
  if (!Array.isArray(adapter.workspace_ids) || adapter.workspace_ids.length === 0) {
    return true;
  }
  return adapter.workspace_ids.includes(workspaceId);
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
