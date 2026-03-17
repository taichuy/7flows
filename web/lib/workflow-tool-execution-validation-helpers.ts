import type { PluginAdapterRegistryItem } from "@/lib/get-plugin-registry";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

import type {
  WorkflowExecutionCapabilityIssueOptions,
  WorkflowExplicitAdapterBindingValidationOptions,
  WorkflowToolExecutionValidationIssue
} from "@/lib/workflow-tool-execution-validation-types";

export function validateExplicitAdapterBinding({
  context,
  toolId,
  ecosystem,
  adapterId,
  adapters,
  path,
  field,
  nodeId,
  nodeName
}: WorkflowExplicitAdapterBindingValidationOptions): WorkflowToolExecutionValidationIssue | null {
  const adapter = adapters.find((item) => item.id === adapterId);
  if (!adapter) {
    return {
      nodeId,
      nodeName,
      message: `${context} 绑定了 adapter ${adapterId}，但当前 workspace 看不到这个 adapter，工具 ${toolId} 无法按该绑定执行。`,
      path,
      field
    };
  }
  if (adapter.ecosystem !== ecosystem) {
    return {
      nodeId,
      nodeName,
      message: `${context} 绑定的 adapter ${adapterId} 服务于 ${adapter.ecosystem}，与工具 ${toolId} 需要的 ${ecosystem} 不一致。`,
      path,
      field
    };
  }
  if (!adapter.enabled) {
    return {
      nodeId,
      nodeName,
      message: `${context} 绑定的 adapter ${adapterId} 当前已禁用，工具 ${toolId} 不能按该绑定执行。`,
      path,
      field
    };
  }
  return null;
}

export function buildExecutionCapabilityIssue({
  context,
  nodeId,
  nodeName,
  toolId,
  tool,
  ecosystem,
  adapterId,
  requestedExecutionClass,
  adapters,
  sandboxReadiness,
  path,
  field
}: WorkflowExecutionCapabilityIssueOptions): WorkflowToolExecutionValidationIssue | null {
  if (tool.ecosystem === "native") {
    const supportedExecutionClasses = tool.supported_execution_classes?.length
      ? tool.supported_execution_classes
      : ["inline"];
    if (supportedExecutionClasses.includes(requestedExecutionClass)) {
      return buildSandboxReadinessIssue({
        context,
        nodeId,
        nodeName,
        toolId,
        requestedExecutionClass,
        sandboxReadiness,
        path,
        field
      });
    }
    return {
      nodeId,
      nodeName,
      message: `${context} 显式请求了 ${requestedExecutionClass}，但原生工具 ${toolId} 当前只支持 ${supportedExecutionClasses.join(
        ", "
      )}。`,
      path,
      field
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
      message: `${context} 显式请求了 ${requestedExecutionClass}，但当前没有可用 adapter 能为 ${toolId} 提供 ${resolvedEcosystem} 执行入口。`,
      path,
      field
    };
  }

  const supportedExecutionClasses = adapter.supported_execution_classes?.length
    ? adapter.supported_execution_classes
    : ["subprocess"];
  if (!supportedExecutionClasses.includes(requestedExecutionClass)) {
    return {
      nodeId,
      nodeName,
      message: `${context} 显式请求了 ${requestedExecutionClass}，但 adapter ${adapter.id} 当前只支持 ${supportedExecutionClasses.join(
        ", "
      )}。`,
      path,
      field
    };
  }

  const sandboxReadinessIssue = buildSandboxReadinessIssue({
    context,
    nodeId,
    nodeName,
    toolId,
    requestedExecutionClass,
    sandboxReadiness,
    path,
    field
  });
  if (sandboxReadinessIssue) {
    return sandboxReadinessIssue;
  }

  return null;
}

export function extractExplicitExecutionClass(value: unknown) {
  const record = toRecord(value);
  return normalizeString(record?.class);
}

export function isAdapterVisible(adapter: PluginAdapterRegistryItem, workspaceId: string) {
  if (!Array.isArray(adapter.workspace_ids) || adapter.workspace_ids.length === 0) {
    return true;
  }
  return adapter.workspace_ids.includes(workspaceId);
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

function buildSandboxReadinessIssue({
  context,
  nodeId,
  nodeName,
  toolId,
  requestedExecutionClass,
  sandboxReadiness,
  path,
  field
}: {
  context: string;
  nodeId: string;
  nodeName: string;
  toolId: string;
  requestedExecutionClass: string;
  sandboxReadiness?: SandboxReadinessCheck | null;
  path: string;
  field: string;
}): WorkflowToolExecutionValidationIssue | null {
  if (requestedExecutionClass !== "sandbox" && requestedExecutionClass !== "microvm") {
    return null;
  }
  if (!sandboxReadiness) {
    return null;
  }

  const readiness = sandboxReadiness.execution_classes.find(
    (item) => item.execution_class === requestedExecutionClass
  );
  if (readiness?.available) {
    return null;
  }

  const reason = readiness?.reason?.trim();
  return {
    nodeId,
    nodeName,
    message: `${context} 显式请求了 ${requestedExecutionClass}，但当前 sandbox readiness 还没有为工具 ${toolId} 准备好对应执行链路。${reason ? ` ${reason}` : ""}`,
    path,
    field
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
