import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

export type WorkflowValidationRemediation = {
  title: string;
  issue: string;
  suggestion: string;
  followUp?: string | null;
};

const DEFAULT_REMEDIATION_CATEGORY_PRIORITY = [
  "tool_execution",
  "node_execution",
  "tool_reference",
  "publish_version",
  "publish_draft",
  "variables",
  "schema",
  "starter_portability"
] as const;

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

export function pickWorkflowValidationRemediationItem(
  items: WorkflowValidationNavigatorItem[]
): WorkflowValidationNavigatorItem | null {
  if (items.length === 0) {
    return null;
  }

  let bestItem: WorkflowValidationNavigatorItem | null = null;
  let bestScore: [number, number, number] | null = null;

  items.forEach((item, index) => {
    const priorityIndex = DEFAULT_REMEDIATION_CATEGORY_PRIORITY.indexOf(
      item.category as (typeof DEFAULT_REMEDIATION_CATEGORY_PRIORITY)[number]
    );
    const score: [number, number, number] = [
      priorityIndex === -1 ? DEFAULT_REMEDIATION_CATEGORY_PRIORITY.length : priorityIndex,
      item.target.fieldPath ? 0 : 1,
      index
    ];

    if (
      !bestScore ||
      score[0] < bestScore[0] ||
      (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
      (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])
    ) {
      bestItem = item;
      bestScore = score;
    }
  });

  return bestItem;
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
  if (fieldPath === "inputSchema" || fieldPath.startsWith("inputSchema.")) {
    return "Input schema";
  }

  if (fieldPath === "outputSchema" || fieldPath.startsWith("outputSchema.")) {
    return "Output schema";
  }

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
  if (fieldPath === "default" || fieldPath.startsWith("default.")) {
    return "Default value";
  }

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
  if (fieldPath.startsWith("config.skillBinding.references")) {
    return "Skill references";
  }
  if (fieldPath.startsWith("config.skillIds")) {
    return "Skill IDs";
  }
  if (fieldPath.startsWith("config.contextAccess.readableNodeIds")) {
    return "Readable upstream nodes";
  }
  if (fieldPath.startsWith("config.contextAccess.readableArtifacts")) {
    return "Readable node artifacts";
  }

  if (fieldPath === "inputSchema" || fieldPath.startsWith("inputSchema.")) {
    return "Input schema";
  }

  if (fieldPath === "outputSchema" || fieldPath.startsWith("outputSchema.")) {
    return "Output schema";
  }

  switch (fieldPath) {
    case "runtimePolicy.retry":
      return "Retry policy";
    case "runtimePolicy.retry.maxAttempts":
      return "Max attempts";
    case "runtimePolicy.retry.backoffSeconds":
      return "Backoff seconds";
    case "runtimePolicy.retry.backoffMultiplier":
      return "Backoff multiplier";
    case "runtimePolicy.join":
      return "Join policy";
    case "runtimePolicy.join.mode":
      return "Join mode";
    case "runtimePolicy.join.requiredNodeIds":
      return "Required upstream nodes";
    case "runtimePolicy.join.onUnmet":
      return "Join on unmet";
    case "runtimePolicy.join.mergeStrategy":
      return "Join merge strategy";
    case "runtimePolicy.execution":
      return "Execution policy";
    case "runtimePolicy.execution.class":
      return "Execution class";
    case "runtimePolicy.execution.profile":
      return "Execution profile";
    case "runtimePolicy.execution.dependencyMode":
      return "Dependency mode";
    case "runtimePolicy.execution.builtinPackageSet":
      return "Builtin package set";
    case "runtimePolicy.execution.dependencyRef":
      return "Dependency ref";
    case "runtimePolicy.execution.backendExtensions":
      return "Backend extensions JSON";
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
    case "config.toolPolicy.execution.dependencyMode":
      return "Tool dependency mode";
    case "config.toolPolicy.execution.builtinPackageSet":
      return "Tool builtin package set";
    case "config.toolPolicy.execution.dependencyRef":
      return "Tool dependency ref";
    case "config.toolPolicy.execution.backendExtensions":
      return "Tool backend extensions JSON";
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
    case "config.language":
      return "Sandbox language";
    case "config.code":
      return "Sandbox code";
    case "config.dependencyMode":
      return "Sandbox dependency mode";
    case "config.builtinPackageSet":
      return "Sandbox builtin package set";
    case "config.dependencyRef":
      return "Sandbox dependency ref";
    case "config.skillIds":
      return "Skill IDs";
    case "config.skillBinding":
      return "Skill binding";
    case "config.skillBinding.enabledPhases":
      return "Skill binding phases";
    case "config.skillBinding.promptBudgetChars":
      return "Skill binding prompt budget";
    case "config.skillBinding.references":
      return "Skill references";
    case "config.contextAccess":
      return "Readable upstream nodes";
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
  if (fieldPath?.startsWith("inputSchema") || fieldPath?.startsWith("outputSchema")) {
    return "把 schema 修成合法 contract object；如果当前还不需要输出约束，可先清空 `outputSchema`，但不要留下无效 schema。";
  }

  switch (fieldPath) {
    case "workflowVersion":
      return "如果这个 endpoint 要跟随本次保存生成的新版本，请把 `Workflow version` 留空；只有需要固定到既有版本时才填写语义版本号。";
    case "authMode":
      return "当前 publish gateway 只支持 `internal` / `api_key`。先切回已落地鉴权模式，避免把尚未兑现的 token auth 写进 definition、publish 页面和调用入口。";
    case "alias":
      return "把 alias 改成当前 workflow 内唯一、稳定且适合对外暴露的标识；如果只是想沿用 endpoint id，可直接留空。";
    case "path":
      return "把 path 改成以 `/` 开头的稳定路由，并避免与其他 publish endpoint 冲突。";
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

  if (fieldPath.startsWith("inputSchema") || fieldPath.startsWith("outputSchema")) {
    return "把 schema 修成合法 contract object；如果当前先不需要严格约束，可先清空对应 schema，但不要把无效 contract 留在 definition 里。";
  }

  if (fieldPath.startsWith("runtimePolicy.execution")) {
    if (
      fieldPath.endsWith("profile") ||
      fieldPath.endsWith("dependencyMode") ||
      fieldPath.endsWith("builtinPackageSet") ||
      fieldPath.endsWith("dependencyRef") ||
      fieldPath.endsWith("backendExtensions") ||
      fieldPath.endsWith("networkPolicy") ||
      fieldPath.endsWith("filesystemPolicy")
    ) {
      return "把这个 override 改回当前 backend 已暴露的 capability，或清空 override 回退到默认值；不要把 capability 尚未兑现的字段继续写进 definition。";
    }

    return "先把 execution override 调回当前实现支持范围；如果要保留 `sandbox / microvm`，必须先确认 live sandbox readiness 已 ready，且 capability 覆盖当前 profile / network / filesystem 需求。";
  }

  if (fieldPath.startsWith("runtimePolicy.retry")) {
    if (fieldPath.endsWith("maxAttempts")) {
      return "把重试次数改回 `>= 1` 的合法值；如果当前节点不需要额外重试，可清空 override，回退到默认 retry policy。";
    }

    if (fieldPath.endsWith("backoffSeconds")) {
      return "把 backoff seconds 调回 `>= 0` 的合法值，避免 runtime 进入负等待或与默认回退策略分叉。";
    }

    if (fieldPath.endsWith("backoffMultiplier")) {
      return "把 backoff multiplier 调回 `>= 1` 的合法值，避免失败后的等待时间反向缩短或放大失控。";
    }

    return "先把 retry policy 改回运行时支持的合法范围；如果当前节点没有特殊重试需求，可直接清空 override，沿用默认值。";
  }

  if (fieldPath.startsWith("runtimePolicy.join")) {
    if (fieldPath.endsWith("requiredNodeIds")) {
      return "把 required upstream nodes 收口到当前真实入边来源；如果本来就要等待全部入边，可直接清空自定义列表。";
    }

    if (fieldPath.endsWith("mode") || fieldPath.endsWith("onUnmet") || fieldPath.endsWith("mergeStrategy")) {
      return "把 join 策略改回当前运行时支持的组合；如果节点并不需要等待上游汇合，就清空 join override，避免 definition 和实际调度语义继续漂移。";
    }

    return "先确认当前节点确实存在上游入边，再决定是否保留 join policy；如果不需要 join gate，就清空这段 override。";
  }

  if (fieldPath === "config.code") {
    return "补一段非空代码，并显式写出 `result = {...}` 这类稳定输出，避免节点保存后直到 runtime 才暴露空执行体。";
  }

  if (fieldPath === "config.language") {
    return "优先使用当前 sandbox readiness 已声明支持的语言；如果当前只打算走 host-controlled MVP 路径，也请保持语言声明和代码内容一致。";
  }

  if (fieldPath === "config.dependencyMode") {
    return "先把 sandbox_code 的依赖声明收口到 `builtin / dependency_ref / backend_managed` 之一；如果当前没有额外依赖，直接清空这个字段更稳妥。";
  }

  if (fieldPath === "config.builtinPackageSet") {
    return "只有在 `config.dependencyMode = builtin` 时才保留 builtin package set；否则请清空它，避免 definition 和实际依赖契约继续漂移。";
  }

  if (fieldPath === "config.dependencyRef") {
    return "只有在 `config.dependencyMode = dependency_ref` 时才保留 dependency ref；否则请清空它，避免保存后继续被后端 fail-closed。";
  }

  if (fieldPath === "config.toolPolicy.allowedToolIds") {
    return "把 allow list 收口到与当前 execution override 兼容的工具；如果不想收窄范围，就清空 override，让每个工具沿用自己的默认 execution class。";
  }

  if (fieldPath.startsWith("config.toolPolicy.execution")) {
    if (
      fieldPath.endsWith("profile") ||
      fieldPath.endsWith("dependencyMode") ||
      fieldPath.endsWith("builtinPackageSet") ||
      fieldPath.endsWith("dependencyRef") ||
      fieldPath.endsWith("backendExtensions") ||
      fieldPath.endsWith("networkPolicy") ||
      fieldPath.endsWith("filesystemPolicy")
    ) {
      return "把这组 toolPolicy execution override 改回当前工具共同支持的 capability，或清空 override 回退到默认值；不要把 capability 尚未兑现的字段继续写进 definition。";
    }

    return "先把 toolPolicy execution override 收回到所选工具的共享支持范围；如果当前没有共同支持的强隔离 class，就清空 override，避免 Agent 在保存后继续 fail-closed。";
  }

  if (fieldPath.endsWith("adapterId")) {
    return "把 adapter 绑定改回当前生态里已启用且声明支持该工具的 adapter，避免 definition 指向不存在或未启用的后端。";
  }

  if (fieldPath.endsWith("toolId")) {
    return "把 tool id 改成当前 catalog 里仍存在、可调用且满足治理要求的工具；如果这个工具已经下线，应同步收敛 allow list / mock plan。";
  }

  if (fieldPath.startsWith("config.skillIds")) {
    return "把 skillIds 对齐到当前可用的 SkillDoc；如需清理失效 id，可以直接删掉旧行再重新保存。";
  }

  if (fieldPath.startsWith("config.skillBinding.references")) {
    return "请用 skillId:referenceId @ phase1,phase2 的格式列出引用，并确保 skillId 已在 skillIds 中、referenceId 仍存在；不需要 phase 时可以省略 @。";
  }

  if (fieldPath.startsWith("config.skillBinding.enabledPhases")) {
    return "仅保留 main_plan / assistant_distill / main_finalize 这些有效 phase，其他文本都会被视为无效配置。";
  }

  if (fieldPath.startsWith("config.skillBinding.promptBudgetChars")) {
    return "将 prompt budget 调整为正整数，或留空回退到默认预算。";
  }

  if (fieldPath === "config.skillBinding") {
    return "先修正 phase、prompt budget 与引用列表，再继续保存，避免 skill binding 主链继续漂移。";
  }

  if (fieldPath.startsWith("config.contextAccess.readableNodeIds")) {
    return "只勾选仍存在的上游节点，并同步清理被删除节点的可见性；需要新增可见源时再显式打开。";
  }

  if (fieldPath.startsWith("config.contextAccess.readableArtifacts")) {
    return "仅在确实需要读取 text/json/file/tool_result/message 等额外产物时才勾选对应类型，避免无谓的上下文扩散。";
  }

  if (fieldPath === "config.contextAccess") {
    return "对 readable nodes 和 artifact grants 逐一核对，确认全部来源都已显式授权后再继续保存。";
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
