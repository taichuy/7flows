import type {
  RunArtifactItem,
  RunCallbackTicketItem,
  RunExecutionFocusReason,
  RunExecutionNodeItem,
  ToolCallItem
} from "@/lib/get-run-views";

type ExecutionFocusExplainableNode = Pick<
  RunExecutionNodeItem,
  | "execution_blocking_reason"
  | "execution_fallback_reason"
  | "execution_blocked_count"
  | "execution_unavailable_count"
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

type ExecutionFocusToolExplainableNode = Pick<
  RunExecutionNodeItem,
  "tool_calls" | "artifact_refs" | "artifacts"
>;

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
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function formatMetricSummary(metrics: Record<string, number>) {
  return Object.entries(metrics)
    .map(([key, count]) => `${key} ${count}`)
    .join(" · ");
}

function buildToolExecutionBadges(
  toolCall: Pick<
    ToolCallItem,
    | "phase"
    | "requested_execution_class"
    | "effective_execution_class"
    | "execution_sandbox_backend_id"
    | "execution_sandbox_runner_kind"
    | "execution_blocking_reason"
    | "execution_fallback_reason"
    | "response_content_type"
    | "raw_ref"
  >
) {
  const badges: string[] = [];
  const phase = trimOrNull(toolCall.phase);
  const requestedExecutionClass = trimOrNull(toolCall.requested_execution_class);
  const effectiveExecutionClass = trimOrNull(toolCall.effective_execution_class);
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

function buildToolExecutionDetail(
  toolCall: Pick<
    ToolCallItem,
    | "request_summary"
    | "response_summary"
    | "response_content_type"
    | "execution_blocking_reason"
    | "execution_fallback_reason"
    | "raw_ref"
  >
) {
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

function countArtifactsByKind(artifacts: RunArtifactItem[]) {
  return artifacts.reduce<Record<string, number>>((summary, artifact) => {
    const key = trimOrNull(artifact.artifact_kind) ?? "artifact";
    summary[key] = (summary[key] ?? 0) + 1;
    return summary;
  }, {});
}

export function listExecutionFocusToolCallSummaries(
  node: ExecutionFocusToolExplainableNode
): ExecutionFocusToolCallSummary[] {
  return node.tool_calls.map((toolCall) => ({
    id: toolCall.id,
    title: `${trimOrNull(toolCall.tool_name) ?? toolCall.tool_id} · ${toolCall.status}`,
    detail: buildToolExecutionDetail(toolCall),
    badges: buildToolExecutionBadges(toolCall),
    rawRef: trimOrNull(toolCall.raw_ref)
  }));
}

export function listExecutionFocusArtifactPreviews(
  node: Pick<RunExecutionNodeItem, "artifacts">,
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

    if (
      normalized.includes("no compatible sandbox backend") ||
      normalized.includes("strong-isolation paths must fail closed")
    ) {
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
      primarySignal: `执行阻断：${reason}`,
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
  if (blockingInsight) {
    return blockingInsight.primarySignal;
  }
  if (node.waiting_reason) {
    return `等待原因：${node.waiting_reason}`;
  }
  if (node.execution_fallback_reason) {
    return `执行降级：${node.execution_fallback_reason}`;
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

  if (node.execution_fallback_reason) {
    return "下一步：确认 fallback 是否可接受；若不可接受，再回到原始 execution backend / capability 做治理。";
  }

  return null;
}
