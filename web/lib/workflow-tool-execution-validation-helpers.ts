import type { PluginAdapterRegistryItem } from "@/lib/get-plugin-registry";
import type {
  SandboxBackendCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";

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
  executionPayload,
  adapters,
  sandboxReadiness,
  sandboxBackends,
  path,
  field
}: WorkflowExecutionCapabilityIssueOptions): WorkflowToolExecutionValidationIssue | null {
  if (tool.ecosystem === "native") {
    const supportedExecutionClasses = tool.supported_execution_classes?.length
      ? tool.supported_execution_classes
      : ["inline"];
    if (supportedExecutionClasses.includes(requestedExecutionClass)) {
      const sandboxIssue = buildSandboxReadinessIssue({
        context,
        nodeId,
        nodeName,
        toolId,
        requestedExecutionClass,
        executionPayload,
        sandboxReadiness,
        sandboxBackends,
        path,
        field
      });
      if (sandboxIssue) {
        return sandboxIssue;
      }
      return buildNativeToolRunnerGapIssue({
        context,
        nodeId,
        nodeName,
        toolId,
        executionClass: requestedExecutionClass,
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
    executionPayload,
    sandboxReadiness,
    sandboxBackends,
    path,
    field
  });
  if (sandboxReadinessIssue) {
    return sandboxReadinessIssue;
  }

  return null;
}

export function buildDefaultExecutionCapabilityIssue({
  context,
  nodeId,
  nodeName,
  toolId,
  tool,
  ecosystem,
  adapterId,
  adapters,
  sandboxReadiness,
  sandboxBackends,
  path,
  field
}: Omit<
  WorkflowExecutionCapabilityIssueOptions,
  "requestedExecutionClass" | "executionPayload"
>): WorkflowToolExecutionValidationIssue | null {
  const defaultExecutionClass = normalizeStrongDefaultExecutionClass(tool.default_execution_class);
  if (!defaultExecutionClass) {
    return null;
  }
  const defaultReason = buildSensitivityReason(tool.sensitivity_level, defaultExecutionClass);

  if (tool.ecosystem === "native") {
    const supportedExecutionClasses = tool.supported_execution_classes?.length
      ? tool.supported_execution_classes
      : ["inline"];
    if (!supportedExecutionClasses.includes(defaultExecutionClass)) {
      return {
        nodeId,
        nodeName,
        message: `${context} 绑定的原生工具 ${toolId} 默认执行级别是 ${defaultExecutionClass}，但当前只支持 ${supportedExecutionClasses.join(
          ", "
        )}。${defaultReason}`,
        path,
        field
      };
    }

    const sandboxIssue = buildDefaultSandboxReadinessIssue({
      context,
      nodeId,
      nodeName,
      toolId,
      defaultExecutionClass,
      sandboxReadiness,
      sandboxBackends,
      path,
      field
    });
    if (sandboxIssue) {
      return sandboxIssue;
    }
    return buildNativeToolRunnerGapIssue({
      context,
      nodeId,
      nodeName,
      toolId,
      executionClass: defaultExecutionClass,
      path,
      field,
      isDefaultExecution: true
    });
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
      message: `${context} 依赖工具 ${toolId} 的默认执行级别 ${defaultExecutionClass}，但当前没有可用 adapter 能为 ${resolvedEcosystem} 提供执行入口。${defaultReason}`,
      path,
      field
    };
  }

  const supportedExecutionClasses = adapter.supported_execution_classes?.length
    ? adapter.supported_execution_classes
    : ["subprocess"];
  if (!supportedExecutionClasses.includes(defaultExecutionClass)) {
    return {
      nodeId,
      nodeName,
      message: `${context} 依赖工具 ${toolId} 的默认执行级别 ${defaultExecutionClass}，但 adapter ${adapter.id} 当前只支持 ${supportedExecutionClasses.join(
        ", "
      )}。${defaultReason}`,
      path,
      field
    };
  }

  return buildDefaultSandboxReadinessIssue({
    context,
    nodeId,
    nodeName,
    toolId,
    defaultExecutionClass,
    sandboxReadiness,
    sandboxBackends,
    path,
    field
  });
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
  executionPayload,
  sandboxReadiness,
  sandboxBackends,
  path,
  field
}: {
  context: string;
  nodeId: string;
  nodeName: string;
  toolId: string;
  requestedExecutionClass: string;
  executionPayload: Record<string, unknown> | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
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
  const compatibility = describeSandboxBackendCompatibility({
    requestedExecutionClass,
    executionPayload,
    sandboxReadiness,
    sandboxBackends,
    requireToolExecutionCapability: true
  });
  if (compatibility.available) {
    return null;
  }

  if (compatibility.reason) {
    return {
      nodeId,
      nodeName,
      message:
        `${context} 显式请求了 ${requestedExecutionClass}，但当前没有单个 sandbox backend 能同时满足工具 ${toolId} 的执行约束。` +
        ` ${compatibility.reason}`,
      path,
      field
    };
  }

  if (readiness?.available) {
    const profile = normalizeString(executionPayload?.profile);
    const supportedProfiles = readiness.supported_profiles ?? sandboxReadiness.supported_profiles;
    if (
      profile &&
      supportedProfiles.length > 0 &&
      !supportedProfiles.includes(profile)
    ) {
      return {
        nodeId,
        nodeName,
        message: `${context} 显式请求了 ${requestedExecutionClass} 并附带 profile = ${profile}，但当前 sandbox readiness 聚合视图还没有暴露该 profile，工具 ${toolId} 不能稳定落到兼容后端。`,
        path,
        field
      };
    }

    const dependencyMode = normalizeDependencyMode(executionPayload?.dependencyMode);
    const supportedDependencyModes =
      readiness.supported_dependency_modes ?? sandboxReadiness.supported_dependency_modes;
    if (
      dependencyMode &&
      !supportedDependencyModes.includes(dependencyMode)
    ) {
      return {
        nodeId,
        nodeName,
        message: `${context} 显式请求了 ${requestedExecutionClass}，但当前 sandbox readiness 聚合视图还不支持 dependencyMode = ${dependencyMode}，工具 ${toolId} 不能稳定落到对应强隔离后端。`,
        path,
        field
      };
    }

    if (
      dependencyMode === "builtin" &&
      normalizeString(executionPayload?.builtinPackageSet) &&
      !(readiness.supports_builtin_package_sets ?? sandboxReadiness.supports_builtin_package_sets)
    ) {
      return {
        nodeId,
        nodeName,
        message: `${context} 显式请求了 ${requestedExecutionClass} 并附带 builtinPackageSet，但当前 sandbox readiness 聚合视图还不支持 builtin package set hints，工具 ${toolId} 不能稳定落到兼容后端。`,
        path,
        field
      };
    }

    if (
      toRecord(executionPayload?.backendExtensions) &&
      !(readiness.supports_backend_extensions ?? sandboxReadiness.supports_backend_extensions)
    ) {
      return {
        nodeId,
        nodeName,
        message: `${context} 显式请求了 ${requestedExecutionClass} 并附带 backendExtensions，但当前 sandbox readiness 聚合视图还不支持 backendExtensions payload，工具 ${toolId} 不能稳定落到兼容后端。`,
        path,
        field
      };
    }

    const networkPolicy = normalizeString(executionPayload?.networkPolicy);
    if (
      networkPolicy &&
      !(readiness.supports_network_policy ?? sandboxReadiness.supports_network_policy)
    ) {
      return {
        nodeId,
        nodeName,
        message: `${context} 显式请求了 ${requestedExecutionClass} 并附带 networkPolicy = ${networkPolicy}，但当前 sandbox readiness 聚合视图还不支持 networkPolicy hints，工具 ${toolId} 不能稳定落到兼容后端。`,
        path,
        field
      };
    }

    const filesystemPolicy = normalizeString(executionPayload?.filesystemPolicy);
    if (
      filesystemPolicy &&
      !(
        readiness.supports_filesystem_policy ?? sandboxReadiness.supports_filesystem_policy
      )
    ) {
      return {
        nodeId,
        nodeName,
        message: `${context} 显式请求了 ${requestedExecutionClass} 并附带 filesystemPolicy = ${filesystemPolicy}，但当前 sandbox readiness 聚合视图还不支持 filesystemPolicy hints，工具 ${toolId} 不能稳定落到兼容后端。`,
        path,
        field
      };
    }

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

function buildDefaultSandboxReadinessIssue({
  context,
  nodeId,
  nodeName,
  toolId,
  defaultExecutionClass,
  sandboxReadiness,
  sandboxBackends,
  path,
  field
}: {
  context: string;
  nodeId: string;
  nodeName: string;
  toolId: string;
  defaultExecutionClass: string;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
  path: string;
  field: string;
}): WorkflowToolExecutionValidationIssue | null {
  if (defaultExecutionClass !== "sandbox" && defaultExecutionClass !== "microvm") {
    return null;
  }
  if (!sandboxReadiness) {
    return null;
  }

  const compatibility = describeSandboxBackendCompatibility({
    requestedExecutionClass: defaultExecutionClass,
    executionPayload: null,
    sandboxReadiness,
    sandboxBackends,
    requireToolExecutionCapability: true
  });
  if (compatibility.available) {
    return null;
  }

  const readiness = sandboxReadiness.execution_classes.find(
    (item) => item.execution_class === defaultExecutionClass
  );
  const reason = compatibility.reason ?? readiness?.reason?.trim();
  return {
    nodeId,
    nodeName,
    message: `${context} 依赖工具 ${toolId} 的默认执行级别 ${defaultExecutionClass}，但当前 sandbox readiness 还没有准备好对应执行链路。${reason ? ` ${reason}` : ""}`,
    path,
    field
  };
}

function buildNativeToolRunnerGapIssue({
  context,
  nodeId,
  nodeName,
  toolId,
  executionClass,
  path,
  field,
  isDefaultExecution = false
}: {
  context: string;
  nodeId: string;
  nodeName: string;
  toolId: string;
  executionClass: string;
  path: string;
  field: string;
  isDefaultExecution?: boolean;
}): WorkflowToolExecutionValidationIssue | null {
  if (executionClass !== "sandbox" && executionClass !== "microvm") {
    return null;
  }

  const executionSummary = isDefaultExecution
    ? `默认执行级别 ${executionClass}`
    : `显式请求了 ${executionClass}`;

  return {
    nodeId,
    nodeName,
    message:
      `${context} ${executionSummary}，但当前 runtime 只对 compat adapter 工具路径兑现了 sandbox-backed tool runner。` +
      ` 原生工具 ${toolId} 仍会沿 host 侧 fail-closed，直到 native tool 也接入同一条强隔离执行主链。`,
    path,
    field
  };
}

function normalizeStrongDefaultExecutionClass(value: unknown) {
  const normalized = normalizeString(value);
  if (normalized !== "sandbox" && normalized !== "microvm") {
    return null;
  }
  return normalized;
}

export function describeSandboxBackendCompatibility({
  requestedExecutionClass,
  executionPayload,
  sandboxReadiness,
  sandboxBackends,
  language,
  requireToolExecutionCapability = false
}: {
  requestedExecutionClass: string;
  executionPayload: Record<string, unknown> | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
  language?: string | null;
  requireToolExecutionCapability?: boolean;
}): { available: boolean; reason: string | null } {
  if (requestedExecutionClass !== "sandbox" && requestedExecutionClass !== "microvm") {
    return { available: true, reason: null };
  }

  const enabledBackends = (sandboxBackends ?? []).filter((backend) => backend.enabled);
  const readiness = sandboxReadiness?.execution_classes.find(
    (item) => item.execution_class === requestedExecutionClass
  );
  if (enabledBackends.length === 0) {
    if (
      requireToolExecutionCapability &&
      readiness?.available &&
      !(readiness.supports_tool_execution ?? sandboxReadiness?.supports_tool_execution)
    ) {
      return {
        available: false,
        reason:
          "当前 sandbox readiness 只说明该 execution class 对代码执行可用，但还没有 backend 宣告 sandbox-backed tool execution capability。"
      };
    }
    return {
      available: false,
      reason: readiness?.reason ?? null
    };
  }

  const reasons: string[] = [];
  const normalizedLanguage = normalizeString(language)?.toLowerCase() ?? null;
  const profile = normalizeString(executionPayload?.profile);
  const dependencyMode = normalizeDependencyMode(executionPayload?.dependencyMode);
  const builtinPackageSet = normalizeString(executionPayload?.builtinPackageSet);
  const backendExtensions = toRecord(executionPayload?.backendExtensions);
  const networkPolicy = normalizeString(executionPayload?.networkPolicy);
  const filesystemPolicy = normalizeString(executionPayload?.filesystemPolicy);

  for (const backend of enabledBackends) {
    if (backend.status !== "healthy" && backend.status !== "degraded") {
      reasons.push(`${backend.id}: ${backend.detail || "backend is offline"}`);
      continue;
    }

    const capability = backend.capability;
    if (!capability.supported_execution_classes.includes(requestedExecutionClass)) {
      reasons.push(
        `${backend.id}: does not support executionClass = ${requestedExecutionClass}`
      );
      continue;
    }
    if (requireToolExecutionCapability && !capability.supports_tool_execution) {
      reasons.push(`${backend.id}: does not support sandbox-backed tool execution`);
      continue;
    }
    if (
      normalizedLanguage &&
      capability.supported_languages.length > 0 &&
      !capability.supported_languages.includes(normalizedLanguage)
    ) {
      reasons.push(`${backend.id}: does not support language = ${normalizedLanguage}`);
      continue;
    }
    if (
      profile &&
      capability.supported_profiles.length > 0 &&
      !capability.supported_profiles.includes(profile)
    ) {
      reasons.push(`${backend.id}: does not expose profile = ${profile}`);
      continue;
    }
    if (dependencyMode) {
      if (!capability.supported_dependency_modes.includes(dependencyMode)) {
        reasons.push(`${backend.id}: does not support dependencyMode = ${dependencyMode}`);
        continue;
      }
      if (
        dependencyMode === "builtin" &&
        builtinPackageSet &&
        !capability.supports_builtin_package_sets
      ) {
        reasons.push(`${backend.id}: does not support builtinPackageSet hints`);
        continue;
      }
    }
    if (backendExtensions && !capability.supports_backend_extensions) {
      reasons.push(`${backend.id}: does not support backendExtensions payload`);
      continue;
    }
    if (networkPolicy && !capability.supports_network_policy) {
      reasons.push(`${backend.id}: does not support networkPolicy = ${networkPolicy}`);
      continue;
    }
    if (filesystemPolicy && !capability.supports_filesystem_policy) {
      reasons.push(`${backend.id}: does not support filesystemPolicy = ${filesystemPolicy}`);
      continue;
    }

    return { available: true, reason: null };
  }

  const readinessReason = readiness?.reason?.trim();
  const detail = reasons.length > 0 ? reasons.join("；") : readinessReason;
  return {
    available: false,
    reason: detail ? `兼容 backend 细节：${detail}` : readinessReason ?? null
  };
}

function buildSensitivityReason(
  sensitivityLevel: "L0" | "L1" | "L2" | "L3" | null | undefined,
  defaultExecutionClass: string
) {
  if (!sensitivityLevel || !["L2", "L3"].includes(sensitivityLevel)) {
    return "";
  }
  return ` 当前 tool sensitivity level 为 ${sensitivityLevel}，默认执行级别已按治理规则收口到 ${defaultExecutionClass}。`;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDependencyMode(value: unknown) {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized || !["builtin", "dependency_ref", "backend_managed"].includes(normalized)) {
    return null;
  }
  return normalized;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
