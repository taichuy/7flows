import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

export type WorkflowValidationRemediation = {
  title: string;
  issue: string;
  suggestion: string;
  followUp?: string | null;
};

export function buildWorkflowValidationRemediation(
  item: WorkflowValidationNavigatorItem,
  sandboxReadiness?: SandboxReadinessCheck | null
): WorkflowValidationRemediation {
  const fieldPath = item.target.fieldPath ?? null;
  const fieldLabel = resolveFieldLabel(item);

  return {
    title: fieldLabel ? `${item.target.label} · ${fieldLabel}` : item.target.label,
    issue: item.message,
    suggestion: resolveSuggestion(item, fieldPath),
    followUp: shouldIncludeSandboxFollowUp(item, fieldPath)
      ? formatSandboxReadinessPreflightHint(sandboxReadiness)
      : null
  };
}

function resolveFieldLabel(item: WorkflowValidationNavigatorItem) {
  const fieldPath = item.target.fieldPath ?? "";

  if (item.target.scope === "publish") {
    return resolvePublishFieldLabel(fieldPath);
  }
  if (item.target.scope === "variables") {
    return resolveVariableFieldLabel(fieldPath);
  }

  return resolveNodeFieldLabel(fieldPath);
}

function resolvePublishFieldLabel(fieldPath: string) {
  switch (fieldPath) {
    case "workflowVersion":
      return "Workflow version";
    case "name":
      return "Endpoint name";
    case "id":
      return "Endpoint id";
    case "alias":
      return "Alias";
    case "path":
      return "Path";
    case "protocol":
      return "Protocol";
    case "authMode":
      return "Auth mode";
    case "inputSchema":
      return "Input schema";
    case "outputSchema":
      return "Output schema";
    case "cache.varyBy":
      return "Cache varyBy";
    case "cache.ttl":
      return "Cache TTL";
    case "cache.maxEntries":
      return "Cache max entries";
    default:
      return fieldPath || "Draft field";
  }
}

function resolveVariableFieldLabel(fieldPath: string) {
  switch (fieldPath) {
    case "name":
      return "Variable name";
    case "type":
      return "Variable type";
    case "description":
      return "Variable description";
    default:
      return fieldPath || "Variable field";
  }
}

function resolveNodeFieldLabel(fieldPath: string) {
  switch (fieldPath) {
    case "runtimePolicy.execution":
      return "Execution policy";
    case "runtimePolicy.execution.class":
      return "Execution class";
    case "runtimePolicy.execution.profile":
      return "Execution profile";
    case "runtimePolicy.execution.timeoutMs":
      return "Execution timeout";
    case "runtimePolicy.execution.networkPolicy":
      return "Network policy";
    case "runtimePolicy.execution.filesystemPolicy":
      return "Filesystem policy";
    case "config.toolPolicy.allowedToolIds":
      return "Allowed tools";
    case "config.toolPolicy.execution":
      return "Tool execution override";
    case "config.toolPolicy.execution.class":
      return "Tool execution class";
    case "config.toolPolicy.execution.profile":
      return "Tool execution profile";
    case "config.toolPolicy.execution.timeoutMs":
      return "Tool execution timeout";
    case "config.toolPolicy.execution.networkPolicy":
      return "Tool network policy";
    case "config.toolPolicy.execution.filesystemPolicy":
      return "Tool filesystem policy";
    case "config.tool.adapterId":
      return "Tool adapter";
    case "config.tool.toolId":
      return "Tool id";
    case "inputSchema":
      return "Input schema";
    case "outputSchema":
      return "Output schema";
    default:
      return fieldPath || "Node field";
  }
}

function resolveSuggestion(item: WorkflowValidationNavigatorItem, fieldPath: string | null) {
  if (item.target.scope === "publish") {
    return resolvePublishSuggestion(item, fieldPath);
  }
  if (item.target.scope === "variables") {
    return resolveVariableSuggestion(fieldPath);
  }

  return resolveNodeSuggestion(item, fieldPath);
}

function resolvePublishSuggestion(item: WorkflowValidationNavigatorItem, fieldPath: string | null) {
  switch (fieldPath) {
    case "workflowVersion":
      return "如果这个 endpoint 要跟随本次保存生成的新版本，请把 `Workflow version` 留空；只有需要固定到既有版本时才填写语义版本号。";
    case "alias":
      return "把 alias 改成当前 workflow 内唯一、稳定且适合对外暴露的标识；如果只是想沿用 endpoint id，可直接留空。";
    case "path":
      return "把 path 改成以 `/` 开头的稳定路由，并避免与其他 publish endpoint 冲突。";
    case "inputSchema":
    case "outputSchema":
      return "把 schema 修成合法 contract object；如果当前还不需要输出约束，可先清空 `outputSchema`，但不要留下无效 schema。";
    case "cache.varyBy":
      return "去掉重复或无意义的缓存维度，只保留真正决定缓存隔离边界的字段，避免同一请求被拆成多份缓存。";
    case "name":
    case "id":
      return "把名称和标识收敛成当前 workflow 内唯一且可读的一组入口，避免作者和 operator 在 publish 页面看到重复 binding。";
    default:
      return item.category === "publish_version"
        ? "先把版本绑定和这次保存的目标理顺：需要跟随当前版本就留空，确实要 pin 历史版本再显式填写。"
        : "先在当前 draft 表单修正高亮字段，再继续保存；publish draft 和正式 publish 页面共用同一组契约与治理事实。";
  }
}

function resolveVariableSuggestion(fieldPath: string | null) {
  if (fieldPath === "name") {
    return "把变量名改成当前 workflow 内唯一、稳定的标识，避免后续在 prompt、publish schema 和运行时上下文里同时漂移。";
  }

  return "先修正高亮变量字段，再继续保存，避免 definition 和后续 publish / runtime 契约继续分叉。";
}

function resolveNodeSuggestion(item: WorkflowValidationNavigatorItem, fieldPath: string | null) {
  if (!fieldPath) {
    return "先处理当前高亮 section，再继续保存，避免把节点配置问题拖到 runtime 才暴露。";
  }

  if (fieldPath.startsWith("runtimePolicy.execution")) {
    if (
      fieldPath.endsWith("profile") ||
      fieldPath.endsWith("networkPolicy") ||
      fieldPath.endsWith("filesystemPolicy")
    ) {
      return "把这个 override 改回当前 backend 已暴露的 capability，或清空 override 回退到默认值；不要把 capability 尚未兑现的字段继续写进 definition。";
    }

    return "先把 execution override 调回当前实现支持范围；如果要保留 `sandbox / microvm`，必须先确认 live sandbox readiness 已 ready，且 capability 覆盖当前 profile / network / filesystem 需求。";
  }

  if (fieldPath === "config.toolPolicy.allowedToolIds") {
    return "把 allow list 收口到与当前 execution override 兼容的工具；如果不想收窄范围，就清空 override，让每个工具沿用自己的默认 execution class。";
  }

  if (fieldPath.startsWith("config.toolPolicy.execution")) {
    return "先把 toolPolicy execution override 收回到所选工具的共享支持范围；如果当前没有共同支持的强隔离 class，就清空 override，避免 Agent 在保存后继续 fail-closed。";
  }

  if (fieldPath.endsWith("adapterId")) {
    return "把 adapter 绑定改回当前生态里已启用且声明支持该工具的 adapter，避免 definition 指向不存在或未启用的后端。";
  }

  if (fieldPath.endsWith("toolId")) {
    return "把 tool id 改成当前 catalog 里仍存在、可调用且满足治理要求的工具；如果这个工具已经下线，应同步收敛 allow list / mock plan。";
  }

  return item.category === "tool_execution"
    ? "先对齐 tool binding、execution class 和当前 capability，再继续保存；execution capability 不能靠 runtime 静默兜底。"
    : "先修正当前高亮字段，再继续保存，避免节点配置和运行时事实继续漂移。";
}

function shouldIncludeSandboxFollowUp(
  item: WorkflowValidationNavigatorItem,
  fieldPath: string | null
) {
  return (
    item.category === "tool_execution" ||
    item.category === "node_execution" ||
    fieldPath?.startsWith("runtimePolicy.execution") ||
    fieldPath?.startsWith("config.toolPolicy.execution")
  );
}
