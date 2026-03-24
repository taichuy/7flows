import type {
  RunCallbackTicketItem,
  RunExecutionFocusReason,
  RunExecutionNodeItem,
  ToolCallItem
} from "@/lib/get-run-views";
import {
  getEffectiveExecutionClassFact,
  getExecutionExecutorRefFact
} from "@/lib/execution-fact-honesty";

type ExecutionFocusExplainableNode = Pick<
  RunExecutionNodeItem,
  | "execution_blocking_reason"
  | "execution_fallback_reason"
  | "execution_fallback_count"
  | "execution_blocked_count"
  | "execution_unavailable_count"
  | "node_type"
  | "waiting_reason"
  | "scheduled_resume_delay_seconds"
  | "scheduled_resume_due_at"
  | "callback_tickets"
  | "sensitive_access_entries"
>;

type ExecutionBlockingInsight = {
  primarySignal: string;
  followUp: string;
};

type ExecutionFallbackInsight = {
  primarySignal: string;
  followUp: string;
};

export type ExecutionFocusArtifactLike = {
  artifact_kind: string;
  content_type?: string | null;
  summary?: string | null;
  uri?: string | null;
  [key: string]: unknown;
};

export type ExecutionFocusToolCallLike = {
  id: string;
  run_id?: string | null;
  node_run_id?: string | null;
  tool_id: string;
  tool_name: string;
  phase?: string | null;
  status: string;
  requested_execution_class?: string | null;
  requested_execution_source?: string | null;
  requested_execution_profile?: string | null;
  requested_execution_timeout_ms?: number | null;
  requested_execution_network_policy?: string | null;
  requested_execution_filesystem_policy?: string | null;
  requested_execution_dependency_mode?: string | null;
  requested_execution_builtin_package_set?: string | null;
  requested_execution_dependency_ref?: string | null;
  requested_execution_backend_extensions?: Record<string, unknown> | null;
  effective_execution_class?: string | null;
  execution_executor_ref?: string | null;
  execution_sandbox_backend_id?: string | null;
  execution_sandbox_backend_executor_ref?: string | null;
  execution_sandbox_runner_kind?: string | null;
  adapter_request_trace_id?: string | null;
  adapter_request_execution?: Record<string, unknown> | null;
  adapter_request_execution_class?: string | null;
  adapter_request_execution_source?: string | null;
  adapter_request_execution_contract?: Record<string, unknown> | null;
  execution_blocking_reason?: string | null;
  execution_fallback_reason?: string | null;
  request_summary?: string | null;
  response_summary?: string | null;
  response_content_type?: string | null;
  execution_trace?: Record<string, unknown> | null;
  response_meta?: Record<string, unknown> | null;
  raw_ref?: string | null;
  [key: string]: unknown;
};

type ExecutionFocusToolExplainableNode = {
  tool_calls: ExecutionFocusToolCallLike[];
  artifact_refs: string[];
  artifacts: ExecutionFocusArtifactLike[];
};

type ExecutionFocusRuntimeFactExplainableNode = {
  tool_calls: ExecutionFocusToolCallLike[];
  effective_execution_class?: string | null;
  execution_executor_ref?: string | null;
  execution_sandbox_backend_id?: string | null;
  execution_sandbox_runner_kind?: string | null;
};

export type ExecutionFocusArtifactPreview = {
  key: string;
  artifactKind: string;
  contentType: string | null;
  summary: string | null;
  uri: string | null;
};

export type ExecutionFocusToolCallSummary = {
  id: string;
  title: string;
  detail: string;
  badges: string[];
  rawRef: string | null;
  traceSummary?: string | null;
};

export type ExecutionFocusSurface = "diagnostics" | "overlay" | "publish_detail";

export type ExecutionFocusSectionSurfaceCopy = {
  sectionDescription: string;
  focusNodeDescription: string;
  focusedSkillTraceDescription: string;
};

export type ExecutionFocusDiagnosticsBlockerSurfaceCopy = {
  sectionTitle: string;
  sectionDescription: string;
  focusNodeDescription: string;
  focusedSkillTraceDescription: string;
};

export type ExecutionFocusDiagnosticsBlockerMetaCopy = {
  summary: string;
};

export type ExecutionNodeDiagnosticsSurfaceCopy = {
  backendExtensionsDescriptionPrefix: string;
  requestedExecutionDescriptionPrefix: string;
  requestedBackendExtensionsDescriptionPrefix: string;
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTrimmedRecordString(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function readRecordNumber(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function resolveCompatAdapterRequestMeta(toolCall: ExecutionFocusToolCallLike) {
  const executionTrace = asRecord(toolCall.execution_trace);
  const responseMeta = asRecord(toolCall.response_meta);
  const responseRequestMeta = asRecord(responseMeta?.request_meta ?? responseMeta?.requestMeta);
  const adapterRequestExecution =
    asRecord(toolCall.adapter_request_execution) ??
    asRecord(executionTrace?.adapter_request_execution) ??
    asRecord(responseRequestMeta?.execution);
  const adapterRequestExecutionContract =
    asRecord(toolCall.adapter_request_execution_contract) ??
    asRecord(executionTrace?.adapter_request_execution_contract) ??
    asRecord(responseRequestMeta?.execution_contract ?? responseRequestMeta?.executionContract);

  return {
    traceId:
      trimOrNull(toolCall.adapter_request_trace_id) ??
      readTrimmedRecordString(executionTrace, ["adapter_request_trace_id"]) ??
      readTrimmedRecordString(responseRequestMeta, ["trace_id", "traceId"]),
    execution: adapterRequestExecution,
    executionClass:
      trimOrNull(toolCall.adapter_request_execution_class) ??
      readTrimmedRecordString(executionTrace, ["adapter_request_execution_class"]) ??
      readTrimmedRecordString(adapterRequestExecution, ["class"]),
    executionSource:
      trimOrNull(toolCall.adapter_request_execution_source) ??
      readTrimmedRecordString(executionTrace, ["adapter_request_execution_source"]) ??
      readTrimmedRecordString(adapterRequestExecution, ["source"]),
    executionContract: adapterRequestExecutionContract
  };
}

export function buildExecutionFocusSectionSurfaceCopy(
  surface: ExecutionFocusSurface
): ExecutionFocusSectionSurfaceCopy {
  if (surface === "overlay") {
    return {
      sectionDescription:
        "这里直接复用 canonical run snapshot 的 execution focus，作者在画布里也能先看当前最相关的 blocker / waiting 节点，而不是立刻跳出到完整 diagnostics。",
      focusNodeDescription:
        "当前节点直接来自后端选出的 canonical execution focus，方便画布 overlay 与 diagnostics / runtime 事实链继续对齐。",
      focusedSkillTraceDescription:
        "overlay 里的 execution focus 也会继续复用 canonical focus skill trace，方便作者留在当前 run 视角确认 agent 实际加载了哪些参考资料。"
    };
  }

  if (surface === "publish_detail") {
    return {
      sectionDescription:
        "当前 publish invocation detail 直接复用 run diagnostics 的 execution 事实，优先聚焦当前最相关的 node run。",
      focusNodeDescription:
        "当前节点直接来自后端选出的 canonical execution focus，方便 publish detail、diagnostics 与 runtime 事实链继续对齐到同一条恢复路径。",
      focusedSkillTraceDescription:
        "publish invocation detail 里的 execution focus 也会直接复用 canonical focus skill trace，避免还要跳回 run diagnostics 才能确认当前 node run 实际加载了哪些参考资料。"
    };
  }

  return {
    sectionDescription:
      "run detail 已直接带回后端选择的 canonical execution focus，这里优先展示当前最该看的 blocker / fallback / waiting 节点，再决定是否继续展开 execution view。",
    focusNodeDescription:
      "当前节点直接来自后端选出的 canonical execution focus，方便 diagnostics、publish detail 与 runtime 事实链对齐到同一条恢复路径。",
    focusedSkillTraceDescription:
      "Priority blocker 卡片现在也会直接复用 canonical focus skill trace，方便在 run diagnostics 主入口确认当前阻断节点实际加载了哪些参考资料。"
  };
}

export function buildExecutionFocusSurfaceDescription(surface: ExecutionFocusSurface) {
  return buildExecutionFocusSectionSurfaceCopy(surface).sectionDescription;
}

export function buildExecutionFocusDiagnosticsBlockerSurfaceCopy(): ExecutionFocusDiagnosticsBlockerSurfaceCopy {
  const surfaceCopy = buildExecutionFocusSectionSurfaceCopy("diagnostics");
  return {
    sectionTitle: "Priority blockers",
    sectionDescription: surfaceCopy.sectionDescription,
    focusNodeDescription: surfaceCopy.focusNodeDescription,
    focusedSkillTraceDescription: surfaceCopy.focusedSkillTraceDescription
  };
}

export function buildExecutionFocusDiagnosticsBlockerMetaCopy(
  node: ExecutionFocusExplainableNode
): ExecutionFocusDiagnosticsBlockerMetaCopy {
  const pendingApprovalCount = countPendingApprovalTickets(node);
  const pendingCallbackTicketCount = countPendingCallbackTickets(node.callback_tickets);
  const fragments = [
    `approvals ${pendingApprovalCount}`,
    `callback tickets ${node.callback_tickets.length}`,
    pendingCallbackTicketCount > 0 ? `pending tickets ${pendingCallbackTicketCount}` : null,
    typeof node.scheduled_resume_delay_seconds === "number"
      ? `last resume ${node.scheduled_resume_delay_seconds}s`
      : null
  ].filter((value): value is string => Boolean(value));

  return {
    summary: fragments.join(" · ")
  };
}

export function buildExecutionNodeDiagnosticsSurfaceCopy(): ExecutionNodeDiagnosticsSurfaceCopy {
  return {
    backendExtensionsDescriptionPrefix: "Backend extensions",
    requestedExecutionDescriptionPrefix: "Dispatch request",
    requestedBackendExtensionsDescriptionPrefix: "Dispatch backend extensions"
  };
}

export function formatExecutionBlockingReasonCopy(reason?: string | null): string | null {
  const normalized = trimOrNull(reason);
  return normalized ? `执行阻断：${normalized}` : null;
}

export function formatExecutionFallbackReasonCopy(reason?: string | null): string | null {
  const normalized = trimOrNull(reason);
  return normalized ? `执行降级：${normalized}` : null;
}

export function formatMetricSummary(metrics: Record<string, number>) {
  return Object.entries(metrics)
    .map(([key, count]) => `${key} ${count}`)
    .join(" · ");
}

function buildToolExecutionBadges(toolCall: ExecutionFocusToolCallLike) {
  const badges: string[] = [];
  const phase = trimOrNull(toolCall.phase);
  const requestedExecutionClass = trimOrNull(toolCall.requested_execution_class);
  const requestedExecutionProfile = trimOrNull(toolCall.requested_execution_profile);
  const requestedExecutionDependencyMode = trimOrNull(
    toolCall.requested_execution_dependency_mode
  );
  const effectiveExecutionClass = getEffectiveExecutionClassFact(toolCall);
  const sandboxBackendId = trimOrNull(toolCall.execution_sandbox_backend_id);
  const sandboxRunnerKind = trimOrNull(toolCall.execution_sandbox_runner_kind);
  const responseContentType = trimOrNull(toolCall.response_content_type);

  if (phase) {
    badges.push(`phase ${phase}`);
  }
  if (requestedExecutionClass) {
    badges.push(`requested ${requestedExecutionClass}`);
  }
  if (effectiveExecutionClass) {
    badges.push(`effective ${effectiveExecutionClass}`);
  }
  if (requestedExecutionProfile) {
    badges.push(`profile ${requestedExecutionProfile}`);
  }
  if (requestedExecutionDependencyMode) {
    badges.push(`deps ${requestedExecutionDependencyMode}`);
  }
  if (sandboxBackendId) {
    badges.push(`backend ${sandboxBackendId}`);
  }
  if (sandboxRunnerKind) {
    badges.push(`runner ${sandboxRunnerKind}`);
  }
  if (responseContentType) {
    badges.push(`content ${responseContentType}`);
  }
  if (trimOrNull(toolCall.execution_blocking_reason)) {
    badges.push("blocked");
  }
  if (trimOrNull(toolCall.execution_fallback_reason)) {
    badges.push("fallback");
  }
  if (trimOrNull(toolCall.raw_ref)) {
    badges.push("raw payload");
  }

  return badges;
}

function buildBackendExtensionsSummary(value?: Record<string, unknown> | null) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const keys = Object.keys(value).filter((key) => key.trim());
  if (keys.length === 0) {
    return null;
  }

  if (keys.length <= 2) {
    return `extensions ${keys.join(", ")}`;
  }

  return `extensions ${keys.slice(0, 2).join(", ")} +${keys.length - 2}`;
}

function buildCompatAdapterExecutionSummary(toolCall: ExecutionFocusToolCallLike) {
  const meta = resolveCompatAdapterRequestMeta(toolCall);
  const execution = meta.execution;
  const parts = [
    meta.executionClass ? `class ${meta.executionClass}` : null,
    meta.executionSource ? `source ${meta.executionSource}` : null,
    readTrimmedRecordString(execution, ["profile"])
      ? `profile ${readTrimmedRecordString(execution, ["profile"])}`
      : null,
    typeof readRecordNumber(execution, ["timeoutMs", "timeout_ms"]) === "number"
      ? `timeout ${readRecordNumber(execution, ["timeoutMs", "timeout_ms"])}ms`
      : null,
    readTrimmedRecordString(execution, ["networkPolicy", "network_policy"])
      ? `network ${readTrimmedRecordString(execution, ["networkPolicy", "network_policy"])}`
      : null,
    readTrimmedRecordString(execution, ["filesystemPolicy", "filesystem_policy"])
      ? `filesystem ${readTrimmedRecordString(execution, ["filesystemPolicy", "filesystem_policy"])}`
      : null,
    readTrimmedRecordString(execution, ["dependencyMode", "dependency_mode"])
      ? `deps ${readTrimmedRecordString(execution, ["dependencyMode", "dependency_mode"])}`
      : null,
    readTrimmedRecordString(execution, ["dependencyRef", "dependency_ref"])
      ? `dependency ref ${readTrimmedRecordString(execution, ["dependencyRef", "dependency_ref"])}`
      : null,
    readTrimmedRecordString(execution, ["builtinPackageSet", "builtin_package_set"])
      ? `builtin ${readTrimmedRecordString(execution, ["builtinPackageSet", "builtin_package_set"])}`
      : null,
    buildBackendExtensionsSummary(
      asRecord(execution?.backendExtensions ?? execution?.backend_extensions)
    )
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildCompatAdapterExecutionCompactSummary(toolCall: ExecutionFocusToolCallLike) {
  const summary = buildCompatAdapterExecutionSummary(toolCall);
  return summary ? summary.replaceAll(" · ", " / ") : null;
}

function buildCompatAdapterExecutionContractSummary(toolCall: ExecutionFocusToolCallLike) {
  const contract = resolveCompatAdapterRequestMeta(toolCall).executionContract;
  const parts = [
    readTrimmedRecordString(contract, ["kind"]),
    readTrimmedRecordString(contract, ["toolId", "tool_id"])
      ? `tool ${readTrimmedRecordString(contract, ["toolId", "tool_id"])}`
      : null,
    readTrimmedRecordString(contract, ["irVersion", "ir_version"])
      ? `ir ${readTrimmedRecordString(contract, ["irVersion", "ir_version"])}`
      : null
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join(" · ") : null;
}

function buildCompatAdapterExecutionContractCompactSummary(toolCall: ExecutionFocusToolCallLike) {
  const summary = buildCompatAdapterExecutionContractSummary(toolCall);
  return summary ? summary.replaceAll(" · ", " / ") : null;
}

function listCompatAdapterRequestCompactFacts(toolCall: ExecutionFocusToolCallLike) {
  const meta = resolveCompatAdapterRequestMeta(toolCall);
  const executionSummary = buildCompatAdapterExecutionCompactSummary(toolCall);
  const executionContractSummary = buildCompatAdapterExecutionContractCompactSummary(toolCall);

  return [
    meta.traceId ? `compat trace ${meta.traceId}` : null,
    executionSummary ? `compat exec (${executionSummary})` : null,
    executionContractSummary ? `compat contract (${executionContractSummary})` : null
  ].filter((item): item is string => Boolean(item));
}

export function listCompatAdapterRequestSummaryLines(toolCall: ExecutionFocusToolCallLike) {
  const meta = resolveCompatAdapterRequestMeta(toolCall);
  const executionSummary = buildCompatAdapterExecutionSummary(toolCall);
  const executionContractSummary = buildCompatAdapterExecutionContractSummary(toolCall);

  return [
    meta.traceId ? `Compat request traceId：${meta.traceId}` : null,
    executionSummary ? `Compat request execution：${executionSummary}` : null,
    executionContractSummary ? `Compat request contract：${executionContractSummary}` : null
  ].filter((item): item is string => Boolean(item));
}

function buildToolExecutionTraceSummary(toolCall: ExecutionFocusToolCallLike) {
  const traceFacts = [
    trimOrNull(toolCall.requested_execution_source)
      ? `source ${trimOrNull(toolCall.requested_execution_source)}`
      : null,
    typeof toolCall.requested_execution_timeout_ms === "number"
      ? `timeout ${toolCall.requested_execution_timeout_ms}ms`
      : null,
    trimOrNull(toolCall.requested_execution_network_policy)
      ? `network ${trimOrNull(toolCall.requested_execution_network_policy)}`
      : null,
    trimOrNull(toolCall.requested_execution_filesystem_policy)
      ? `filesystem ${trimOrNull(toolCall.requested_execution_filesystem_policy)}`
      : null,
    trimOrNull(toolCall.requested_execution_dependency_mode)
      ? `deps ${trimOrNull(toolCall.requested_execution_dependency_mode)}`
      : null,
    trimOrNull(toolCall.requested_execution_builtin_package_set)
      ? `builtin ${trimOrNull(toolCall.requested_execution_builtin_package_set)}`
      : null,
    trimOrNull(toolCall.requested_execution_dependency_ref)
      ? `dependency ref ${trimOrNull(toolCall.requested_execution_dependency_ref)}`
      : null,
    buildBackendExtensionsSummary(toolCall.requested_execution_backend_extensions),
    getExecutionExecutorRefFact(toolCall)
      ? `executor ${getExecutionExecutorRefFact(toolCall)}`
      : null,
    trimOrNull(toolCall.execution_sandbox_backend_executor_ref)
      ? `backend ref ${trimOrNull(toolCall.execution_sandbox_backend_executor_ref)}`
      : null
  ].filter((item): item is string => Boolean(item));

  traceFacts.push(...listCompatAdapterRequestCompactFacts(toolCall));

  return traceFacts.length > 0 ? `执行链：${traceFacts.join(" · ")}。` : null;
}

function buildToolExecutionDetail(toolCall: ExecutionFocusToolCallLike) {
  const blockingReason = trimOrNull(toolCall.execution_blocking_reason);
  if (blockingReason) {
    return `执行阻断：${blockingReason}`;
  }

  const fallbackReason = trimOrNull(toolCall.execution_fallback_reason);
  if (fallbackReason) {
    return `执行降级：${fallbackReason}`;
  }

  const responseSummary = trimOrNull(toolCall.response_summary);
  if (responseSummary) {
    return responseSummary;
  }

  const responseContentType = trimOrNull(toolCall.response_content_type);
  if (responseContentType) {
    return `响应类型：${responseContentType}`;
  }

  const requestSummary = trimOrNull(toolCall.request_summary);
  if (requestSummary) {
    return `请求摘要：${requestSummary}`;
  }

  const rawRef = trimOrNull(toolCall.raw_ref);
  if (rawRef) {
    return `原始结果已落到 ${rawRef}。`;
  }

  return "当前 tool call 已进入统一 execution 事实链。";
}

function countArtifactsByKind(artifacts: ExecutionFocusArtifactLike[]) {
  return artifacts.reduce<Record<string, number>>((summary, artifact) => {
    const key = trimOrNull(artifact.artifact_kind) ?? "artifact";
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
}

export function listExecutionFocusToolCallSummaries(
  node: ExecutionFocusToolExplainableNode
): ExecutionFocusToolCallSummary[] {
  return node.tool_calls.map((toolCall) => {
    const traceSummary = buildToolExecutionTraceSummary(toolCall);

    return {
      id: toolCall.id,
      title: `${trimOrNull(toolCall.tool_name) ?? toolCall.tool_id} · ${toolCall.status}`,
      detail: buildToolExecutionDetail(toolCall),
      badges: buildToolExecutionBadges(toolCall),
      rawRef: trimOrNull(toolCall.raw_ref),
      ...(traceSummary ? { traceSummary } : {})
    };
  });
}

function summarizeExecutionRuntimeFacts(
  toolCalls: ExecutionFocusToolCallLike[],
  label: string,
  resolveValue: (toolCall: ExecutionFocusToolCallLike) => string | null
) {
  const counts = toolCalls.reduce<Record<string, number>>((summary, toolCall) => {
    const value = resolveValue(toolCall);
    if (!value) {
      return summary;
    }
    summary[value] = (summary[value] ?? 0) + 1;
    return summary;
  }, {});
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return null;
  }

  const summary = entries
    .slice(0, 2)
    .map(([value, count]) => (count > 1 ? `${value}×${count}` : value))
    .join(", ");

  return `${label} ${summary}${entries.length > 2 ? ` +${entries.length - 2}` : ""}`;
}

export function listExecutionFocusRuntimeFactBadges(
  node: ExecutionFocusRuntimeFactExplainableNode | null | undefined
) {
  if (!node) {
    return [];
  }

  return [
    summarizeExecutionRuntimeFacts(node.tool_calls, "effective", (toolCall) =>
      getEffectiveExecutionClassFact(toolCall)
    ) ??
      (getEffectiveExecutionClassFact(node)
        ? `effective ${getEffectiveExecutionClassFact(node)}`
        : null),
    summarizeExecutionRuntimeFacts(node.tool_calls, "executor", (toolCall) =>
      getExecutionExecutorRefFact(toolCall)
    ) ??
      (getExecutionExecutorRefFact(node)
        ? `executor ${getExecutionExecutorRefFact(node)}`
        : null),
    summarizeExecutionRuntimeFacts(node.tool_calls, "backend", (toolCall) =>
      trimOrNull(toolCall.execution_sandbox_backend_id)
    ) ??
      (trimOrNull(node.execution_sandbox_backend_id)
        ? `backend ${trimOrNull(node.execution_sandbox_backend_id)}`
        : null),
    summarizeExecutionRuntimeFacts(node.tool_calls, "runner", (toolCall) =>
      trimOrNull(toolCall.execution_sandbox_runner_kind)
    ) ??
      (trimOrNull(node.execution_sandbox_runner_kind)
        ? `runner ${trimOrNull(node.execution_sandbox_runner_kind)}`
        : null)
  ].filter((item): item is string => Boolean(item));
}

export function listExecutionFocusArtifactPreviews(
  node: Pick<ExecutionFocusToolExplainableNode, "artifacts">,
  limit = 2
): ExecutionFocusArtifactPreview[] {
  return node.artifacts.slice(0, limit).map((artifact, index) => ({
    key:
      trimOrNull(artifact.uri) ??
      trimOrNull(artifact.summary) ??
      `focus-artifact-${index}`,
    artifactKind: trimOrNull(artifact.artifact_kind) ?? "artifact",
    contentType: trimOrNull(artifact.content_type),
    summary: trimOrNull(artifact.summary),
    uri: trimOrNull(artifact.uri)
  }));
}

export function formatExecutionFocusArtifactSummary(
  node: ExecutionFocusToolExplainableNode
): string | null {
  const artifactCount = node.artifacts.length;
  const artifactRefCount = node.artifact_refs.length;
  const rawRefCount = node.tool_calls.filter((toolCall) => trimOrNull(toolCall.raw_ref)).length;

  if (artifactCount === 0 && artifactRefCount === 0 && rawRefCount === 0) {
    return null;
  }

  const parts: string[] = [];
  if (artifactCount > 0) {
    const kindSummary = formatMetricSummary(countArtifactsByKind(node.artifacts));
    parts.push(
      kindSummary
        ? `聚焦节点已沉淀 ${artifactCount} 个 artifact（${kindSummary}）。`
        : `聚焦节点已沉淀 ${artifactCount} 个 artifact。`
    );
  }
  if (artifactRefCount > 0) {
    parts.push(`run artifact refs ${artifactRefCount} 条。`);
  }
  if (rawRefCount > 0) {
    parts.push(
      rawRefCount === 1
        ? "至少 1 条 tool call 已把原始结果落到 raw_ref，可直接回看 sandbox / tool 输出。"
        : `已有 ${rawRefCount} 条 tool call 把原始结果落到 raw_ref，可直接回看 sandbox / tool 输出。`
    );
  }
  return parts.join(" ");
}

function splitCompatibilityDetails(reason: string): string[] {
  const prefix = "兼容 backend 细节：";
  const detail = reason.startsWith(prefix) ? reason.slice(prefix.length).trim() : reason;
  return detail
    .split(/[;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveExecutionBlockingInsight(
  node: ExecutionFocusExplainableNode
): ExecutionBlockingInsight | null {
  const reason = node.execution_blocking_reason?.trim();
  const normalized = reason?.toLowerCase() ?? "";

  if (reason) {
    if (normalized.includes("cannot run with execution class 'inline'")) {
      return {
        primarySignal: "执行阻断：当前节点要求受控执行，但 execution class 仍是 inline。",
        followUp:
          "下一步：把 execution class 调整为 subprocess，或为 sandbox / microvm 注册兼容 backend；强隔离路径不要静默退回 inline。"
      };
    }

    if (normalized.includes("sandbox-backed tool execution")) {
      return {
        primarySignal: "执行阻断：当前 tool 路径还不能真实兑现请求的强隔离 execution class。",
        followUp:
          "下一步：先把 tool execution class 调回当前宿主执行支持范围，或后续补齐 sandbox tool runner；在此之前继续保持 fail-closed。"
      };
    }

    if (normalized.includes("does not implement requested execution class 'subprocess'")) {
      return {
        primarySignal: `执行阻断：当前 ${node.node_type} 节点尚未实现请求的 subprocess execution class。`,
        followUp:
          "下一步：先把 execution class 调回 inline，或补齐对应 execution adapter；显式 execution-class 请求不要静默降级。"
      };
    }

    if (
      normalized.includes("no compatible sandbox backend") ||
      normalized.includes("strong-isolation paths must fail closed")
    ) {
      if (normalized.includes("does not implement requested strong-isolation execution class")) {
        return {
          primarySignal: `执行阻断：当前 ${node.node_type} 节点尚未实现请求的强隔离 execution class。`,
          followUp:
            "下一步：先把 execution class 调回当前实现支持范围，或补齐对应 execution adapter；在此之前继续保持 fail-closed。"
        };
      }

      return {
        primarySignal: "执行阻断：当前节点要求强隔离执行，但没有兼容的 sandbox backend 可用。",
        followUp:
          "下一步：先恢复或注册兼容的 sandbox backend，再重试当前节点；在此之前继续保持 fail-closed。"
      };
    }

    if (
      normalized.includes("compatibility adapter") &&
      normalized.includes("does not support requested execution class")
    ) {
      return {
        primarySignal: "执行阻断：当前 compat adapter 不支持请求的 execution class。",
        followUp:
          "下一步：先把节点执行级别调回 adapter 支持范围，或补齐支持该 execution class 的 compat adapter。"
      };
    }

    if (
      normalized.includes("native tool") &&
      normalized.includes("does not support requested execution class")
    ) {
      return {
        primarySignal: "执行阻断：当前 tool 默认执行边界不支持请求的 execution class。",
        followUp:
          "下一步：先核对 tool 的默认 execution class 和治理配置，不支持时不要强推到更重的隔离级别。"
      };
    }

    const compatibilityDetails = splitCompatibilityDetails(reason);
    if (
      reason.startsWith("兼容 backend 细节：") ||
      compatibilityDetails.some((item) => item.toLowerCase().includes("does not support"))
    ) {
      return {
        primarySignal:
          compatibilityDetails.length > 0
            ? `执行阻断：sandbox backend 能力与当前节点配置不兼容（${compatibilityDetails.length} 项）。`
            : "执行阻断：sandbox backend 能力与当前节点配置不兼容。",
        followUp:
          "下一步：优先核对 profile、language、dependency mode、network/filesystem policy 与 backend capability 是否一致。"
      };
    }

    return {
      primarySignal: formatExecutionBlockingReasonCopy(reason) ?? `执行阻断：${reason}`,
      followUp:
        "下一步：优先核对 execution class、sandbox backend readiness 和 tool governance 是否匹配。"
    };
  }

  if (node.execution_unavailable_count > 0) {
    return {
      primarySignal: `执行阻断：当前节点记录了 ${node.execution_unavailable_count} 次 execution unavailable。`,
      followUp:
        "下一步：优先核对 execution class、sandbox backend readiness 和 tool governance 是否匹配。"
    };
  }

  if (node.execution_blocked_count > 0) {
    return {
      primarySignal: `执行阻断：当前节点记录了 ${node.execution_blocked_count} 次 execution blocked。`,
      followUp:
        "下一步：优先回到 execution policy 和 tool governance 事实链确认是谁阻断了执行。"
    };
  }

  return null;
}

function resolveExecutionFallbackInsight(
  node: ExecutionFocusExplainableNode
): ExecutionFallbackInsight | null {
  const reason = node.execution_fallback_reason?.trim();
  const normalized = reason?.toLowerCase() ?? "";

  if (reason) {
    if (normalized === "execution_class_not_implemented_for_node_type") {
      return {
        primarySignal: "执行降级：当前节点尚未实现请求的 execution class，已临时回退到 inline。",
        followUp:
          "下一步：如果这条节点需要受控执行或强隔离，应补齐对应 execution adapter；不要把当前 fallback 当成长期默认。"
      };
    }

    if (normalized === "native_tool_execution_class_not_supported") {
      return {
        primarySignal: "执行降级：当前 native tool 不支持请求的 execution class，已回退到 tool 默认执行边界。",
        followUp:
          "下一步：核对 tool governance 与 supported execution classes；如果确实需要更重隔离，应先补齐该 tool 的执行能力。"
      };
    }

    if (normalized === "compat_adapter_execution_class_not_supported") {
      return {
        primarySignal: "执行降级：当前 compat adapter 不支持请求的 execution class，已回退到 adapter 支持范围。",
        followUp:
          "下一步：核对 compat adapter 的 capability 声明；如果仍要求该 execution class，应先补齐 adapter 支持。"
      };
    }

    const fallbackCountCopy =
      node.execution_fallback_count > 0
        ? `，累计记录 ${node.execution_fallback_count} 次`
        : "";

    return {
      primarySignal:
        `执行降级：当前节点因 ${reason} 发生 execution fallback${fallbackCountCopy}。`,
      followUp:
        "下一步：确认该 fallback 是否符合当前 execution policy；若不符合，应回到 execution capability 与 runtime adapter 事实链继续治理。"
    };
  }

  if (node.execution_fallback_count > 0) {
    return {
      primarySignal: `执行降级：当前节点记录了 ${node.execution_fallback_count} 次 execution fallback。`,
      followUp:
        "下一步：确认 fallback 是否仍可接受；若不可接受，应回到 execution capability 与 runtime adapter 事实链继续治理。"
    };
  }

  return null;
}

export function formatExecutionFocusReasonLabel(
  reason: RunExecutionFocusReason | null | undefined
) {
  switch (reason) {
    case "blocking_node_run":
      return "blocking node run";
    case "blocked_execution":
      return "blocked execution";
    case "current_node":
      return "current node";
    case "fallback_node":
      return "execution fallback";
    default:
      return "execution focus";
  }
}

function countPendingCallbackTickets(callbackTickets: RunCallbackTicketItem[]) {
  return callbackTickets.filter((ticket) => ticket.status === "pending").length;
}

function countPendingApprovalTickets(node: ExecutionFocusExplainableNode) {
  return node.sensitive_access_entries.filter((entry) => entry.approval_ticket?.status === "pending")
    .length;
}

export function formatExecutionFocusPrimarySignal(node: ExecutionFocusExplainableNode): string | null {
  const blockingInsight = resolveExecutionBlockingInsight(node);
  const fallbackInsight = resolveExecutionFallbackInsight(node);
  if (blockingInsight) {
    return blockingInsight.primarySignal;
  }
  if (node.waiting_reason) {
    return `等待原因：${node.waiting_reason}`;
  }
  if (fallbackInsight) {
    return fallbackInsight.primarySignal;
  }
  if (node.execution_unavailable_count > 0) {
    return `当前节点记录了 ${node.execution_unavailable_count} 次 execution unavailable。`;
  }
  if (node.execution_blocked_count > 0) {
    return `当前节点记录了 ${node.execution_blocked_count} 次 execution blocked。`;
  }
  return null;
}

export function formatExecutionFocusFollowUp(node: ExecutionFocusExplainableNode): string | null {
  const pendingApprovalCount = countPendingApprovalTickets(node);
  if (pendingApprovalCount > 0) {
    return pendingApprovalCount === 1
      ? "下一步：优先处理这条 sensitive access 审批票据，再观察 waiting 节点是否恢复。"
      : `下一步：当前有 ${pendingApprovalCount} 条 sensitive access 审批仍待处理，优先清掉审批阻塞。`;
  }

  const pendingCallbackTicketCount = countPendingCallbackTickets(node.callback_tickets);
  if (pendingCallbackTicketCount > 0) {
    return pendingCallbackTicketCount === 1
      ? "下一步：优先确认 callback ticket 是否已回调；若尚未回调，继续沿 ticket / inbox 事实链跟进。"
      : `下一步：当前有 ${pendingCallbackTicketCount} 条 callback ticket 仍待回调，优先沿 ticket / inbox 事实链排查。`;
  }

  if (typeof node.scheduled_resume_delay_seconds === "number") {
    const dueCopy = node.scheduled_resume_due_at
      ? `，预计在 ${node.scheduled_resume_due_at} 左右触发`
      : "";
    return `下一步：当前节点已安排自动 resume（${node.scheduled_resume_delay_seconds}s）${dueCopy}，优先观察调度补偿是否恢复。`;
  }

  const blockingInsight = resolveExecutionBlockingInsight(node);
  if (blockingInsight) {
    return blockingInsight.followUp;
  }

  if (node.waiting_reason) {
    return "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。";
  }

  const fallbackInsight = resolveExecutionFallbackInsight(node);
  if (fallbackInsight) {
    return fallbackInsight.followUp;
  }

  return null;
}
