import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowDefinition } from "@/lib/workflow-editor";
import {
  buildDefaultExecutionCapabilityIssue,
  buildExecutionCapabilityIssue,
  extractExplicitExecutionClass,
  isAdapterVisible,
  validateExplicitAdapterBinding
} from "@/lib/workflow-tool-execution-validation-helpers";
import type {
  WorkflowToolExecutionValidationContext,
  WorkflowToolExecutionValidationIssue
} from "@/lib/workflow-tool-execution-validation-types";

export type { WorkflowToolExecutionValidationIssue } from "@/lib/workflow-tool-execution-validation-types";

export function buildWorkflowToolExecutionValidationIssues(
  definition: WorkflowDefinition,
  tools: PluginToolRegistryItem[],
  adapters: PluginAdapterRegistryItem[],
  sandboxReadiness?: SandboxReadinessCheck | null,
  workspaceId = "default"
): WorkflowToolExecutionValidationIssue[] {
  if (!Array.isArray(definition?.nodes) || tools.length === 0) {
    return [];
  }

  const toolIndex = new Map(tools.map((tool) => [tool.id, tool]));
  const visibleAdapters = adapters.filter((adapter) => isAdapterVisible(adapter, workspaceId));
  const issues: WorkflowToolExecutionValidationIssue[] = [];

  definition.nodes.forEach((node, nodeIndex) => {
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
          nodeIndex,
          config,
          toolIndex,
          adapters: visibleAdapters,
          sandboxReadiness
        })
      );
      return;
    }

    if (node?.type === "llm_agent") {
      issues.push(
        ...buildAgentExecutionIssues({
          nodeId,
          nodeName,
          nodeIndex,
          config,
          toolIndex,
          adapters: visibleAdapters,
          sandboxReadiness
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
  nodeIndex,
  config,
  toolIndex,
  adapters,
  sandboxReadiness
}: WorkflowToolExecutionValidationContext & {
  node: { runtimePolicy?: unknown };
  sandboxReadiness?: SandboxReadinessCheck | null;
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
      path: `nodes.${nodeIndex}.config.tool.adapterId`,
      field: "adapterId",
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
    const defaultIssue = buildDefaultExecutionCapabilityIssue({
      context: `Tool 节点 ${nodeName} (${nodeId})`,
      nodeId,
      nodeName,
      toolId,
      tool,
      ecosystem,
      adapterId,
      adapters,
      sandboxReadiness,
      path: `nodes.${nodeIndex}.config.tool.toolId`,
      field: "toolId"
    });
    if (defaultIssue) {
      issues.push(defaultIssue);
    }
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
    executionPayload: toRecord(toRecord(node?.runtimePolicy)?.execution),
    adapters,
    sandboxReadiness,
    path: `nodes.${nodeIndex}.runtimePolicy.execution`,
    field: "execution"
  });
  if (capabilityIssue) {
    issues.push(capabilityIssue);
  }
  return issues;
}

function buildAgentExecutionIssues({
  nodeId,
  nodeName,
  nodeIndex,
  config,
  toolIndex,
  adapters,
  sandboxReadiness
}: WorkflowToolExecutionValidationContext): WorkflowToolExecutionValidationIssue[] {
  const issues: WorkflowToolExecutionValidationIssue[] = [];
  const toolPolicy = toRecord(config.toolPolicy);
  const mockPlan = toRecord(config.mockPlan);

  const policyExecutionClass = extractExplicitExecutionClass(toolPolicy?.execution);
  const normalizedAllowedToolIds = normalizeToolIdList(toolPolicy?.allowedToolIds);
  if (toolPolicy && policyExecutionClass && normalizedAllowedToolIds.length === 0) {
    const incompatibleToolIds = Array.from(toolIndex.entries())
      .sort(([leftToolId], [rightToolId]) => leftToolId.localeCompare(rightToolId))
      .filter(([, tool]) => tool.callable)
      .flatMap(([toolId, tool]) => {
        const capabilityIssue = buildExecutionCapabilityIssue({
          context: `LLM Agent 节点 ${nodeName} (${nodeId}) 的 toolPolicy.execution`,
          nodeId,
          nodeName,
          toolId,
          tool,
          ecosystem: tool.ecosystem,
          adapterId: null,
          requestedExecutionClass: policyExecutionClass,
          executionPayload: toRecord(toolPolicy?.execution),
          adapters,
          sandboxReadiness,
          path: `nodes.${nodeIndex}.config.toolPolicy.execution`,
          field: "execution"
        });
        return capabilityIssue ? [toolId] : [];
      });
    if (incompatibleToolIds.length > 0) {
      issues.push({
        nodeId,
        nodeName,
        message: `LLM Agent 节点 ${nodeName} (${nodeId}) 显式声明了 toolPolicy.execution = ${policyExecutionClass}，但没有通过 toolPolicy.allowedToolIds 收口工具范围；当前 workspace 里仍有与该执行目标不兼容的工具：${incompatibleToolIds.join(
          ", "
        )}。请先限定 allowedToolIds，或移除显式 execution target。`,
        path: `nodes.${nodeIndex}.config.toolPolicy.execution`,
        field: "execution"
      });
    }
  }

  if (toolPolicy && policyExecutionClass && normalizedAllowedToolIds.length > 0) {
    const seen = new Set<string>();
    normalizedAllowedToolIds.forEach((toolId) => {
      if (seen.has(toolId)) {
        return;
      }
      seen.add(toolId);

      const tool = toolIndex.get(toolId);
      if (!tool) {
        return;
      }

      if (!policyExecutionClass) {
        const defaultIssue = buildDefaultExecutionCapabilityIssue({
          context: `LLM Agent 节点 ${nodeName} (${nodeId}) 的 toolPolicy.allowedToolIds`,
          nodeId,
          nodeName,
          toolId,
          tool,
          ecosystem: tool.ecosystem,
          adapterId: null,
          adapters,
          sandboxReadiness,
          path: `nodes.${nodeIndex}.config.toolPolicy.allowedToolIds`,
          field: "allowedToolIds"
        });
        if (defaultIssue) {
          issues.push(defaultIssue);
        }
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
        executionPayload: toRecord(toolPolicy?.execution),
        adapters,
        sandboxReadiness,
        path: `nodes.${nodeIndex}.config.toolPolicy.execution`,
        field: "execution"
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
          path: `nodes.${nodeIndex}.config.mockPlan.toolCalls.${index}.adapterId`,
          field: "adapterId",
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
        const defaultIssue = buildDefaultExecutionCapabilityIssue({
          context: `LLM Agent 节点 ${nodeName} (${nodeId}) 的 mockPlan.toolCalls[${index + 1}]`,
          nodeId,
          nodeName,
          toolId,
          tool,
          ecosystem,
          adapterId,
          adapters,
          sandboxReadiness,
          path: `nodes.${nodeIndex}.config.mockPlan.toolCalls.${index}.toolId`,
          field: "toolId"
        });
        if (defaultIssue) {
          issues.push(defaultIssue);
        }
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
        executionPayload: toRecord(toolCall.execution),
        adapters,
        sandboxReadiness,
        path: `nodes.${nodeIndex}.config.mockPlan.toolCalls.${index}.execution`,
        field: "execution"
      });
      if (capabilityIssue) {
        issues.push(capabilityIssue);
      }
    });
  }

  return issues;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeToolIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  value.forEach((item) => {
    const toolId = normalizeString(item);
    if (!toolId || seen.has(toolId)) {
      return;
    }
    seen.add(toolId);
    normalized.push(toolId);
  });
  return normalized;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
