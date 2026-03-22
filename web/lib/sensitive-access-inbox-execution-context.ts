import type { RunSnapshot } from "@/app/actions/run-snapshot";
import type {
  RunArtifactItem,
  RunExecutionFocusReason,
  ToolCallItem
} from "@/lib/get-run-views";
import type {
  SensitiveAccessInboxEntry,
  SensitiveAccessTimelineEntry
} from "@/lib/get-sensitive-access";

type FocusSkillTrace = NonNullable<RunSnapshot["executionFocusSkillTrace"]>;

export type SensitiveAccessInboxExecutionFocusNode = {
  node_run_id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  waiting_reason?: string | null;
  scheduled_resume_delay_seconds?: number | null;
  scheduled_resume_due_at?: string | null;
  callback_tickets: [];
  sensitive_access_entries: SensitiveAccessTimelineEntry[];
  execution_fallback_count: number;
  execution_blocked_count: number;
  execution_unavailable_count: number;
  execution_blocking_reason?: string | null;
  execution_fallback_reason?: string | null;
  artifact_refs: string[];
  artifacts: RunArtifactItem[];
  tool_calls: ToolCallItem[];
};

export type SensitiveAccessInboxExecutionContext = {
  runId: string;
  focusNode: SensitiveAccessInboxExecutionFocusNode;
  focusReason?: RunExecutionFocusReason | null;
  focusExplanation?: RunSnapshot["executionFocusExplanation"] | null;
  focusMatchesEntry: boolean;
  entryNodeRunId: string | null;
  skillTrace: FocusSkillTrace | null;
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildInlineSensitiveAccessEntries(
  entry: SensitiveAccessInboxEntry
): SensitiveAccessTimelineEntry[] {
  if (!entry.request || !entry.resource) {
    return [];
  }

  return [
    {
      request: entry.request,
      resource: entry.resource,
      approval_ticket: entry.ticket,
      notifications: entry.notifications
    }
  ];
}

function buildFocusArtifacts(
  runId: string,
  focusNodeRunId: string,
  runSnapshot: RunSnapshot
): RunArtifactItem[] {
  return (runSnapshot.executionFocusArtifacts ?? []).map((artifact, index) => ({
    id: `inbox-focus-artifact-${index}`,
    run_id: runId,
    node_run_id: focusNodeRunId,
    artifact_kind: artifact.artifact_kind ?? "artifact",
    content_type: artifact.content_type ?? "application/octet-stream",
    summary: artifact.summary ?? "",
    uri: artifact.uri ?? `inbox://focus-artifact/${index}`,
    metadata_payload: {},
    created_at: ""
  }));
}

function buildFocusToolCalls(
  runId: string,
  focusNodeRunId: string,
  runSnapshot: RunSnapshot
): ToolCallItem[] {
  return (runSnapshot.executionFocusToolCalls ?? []).map((toolCall, index) => ({
    id: toolCall.id ?? `inbox-focus-tool-call-${index}`,
    run_id: runId,
    node_run_id: focusNodeRunId,
    tool_id: toolCall.tool_id ?? "unknown-tool",
    tool_name: toolCall.tool_name ?? toolCall.tool_id ?? "Unknown Tool",
    phase: toolCall.phase ?? "tool",
    status: toolCall.status ?? "unknown",
    request_summary: "",
    requested_execution_class: toolCall.requested_execution_class ?? null,
    requested_execution_source: toolCall.requested_execution_source ?? null,
    requested_execution_profile: toolCall.requested_execution_profile ?? null,
    requested_execution_timeout_ms: toolCall.requested_execution_timeout_ms ?? null,
    requested_execution_network_policy: toolCall.requested_execution_network_policy ?? null,
    requested_execution_filesystem_policy:
      toolCall.requested_execution_filesystem_policy ?? null,
    requested_execution_dependency_mode:
      toolCall.requested_execution_dependency_mode ?? null,
    requested_execution_builtin_package_set:
      toolCall.requested_execution_builtin_package_set ?? null,
    requested_execution_dependency_ref: toolCall.requested_execution_dependency_ref ?? null,
    requested_execution_backend_extensions:
      toolCall.requested_execution_backend_extensions ?? null,
    effective_execution_class: toolCall.effective_execution_class ?? null,
    execution_executor_ref: toolCall.execution_executor_ref ?? null,
    execution_sandbox_backend_id: toolCall.execution_sandbox_backend_id ?? null,
    execution_sandbox_backend_executor_ref:
      toolCall.execution_sandbox_backend_executor_ref ?? null,
    execution_sandbox_runner_kind: toolCall.execution_sandbox_runner_kind ?? null,
    execution_blocking_reason: toolCall.execution_blocking_reason ?? null,
    execution_fallback_reason: toolCall.execution_fallback_reason ?? null,
    response_summary: toolCall.response_summary ?? null,
    response_content_type: toolCall.response_content_type ?? null,
    raw_ref: toolCall.raw_ref ?? null,
    latency_ms: 0,
    retry_count: 0,
    created_at: ""
  }));
}

function buildFocusNode(
  entry: SensitiveAccessInboxEntry,
  runId: string,
  runSnapshot: RunSnapshot
): SensitiveAccessInboxExecutionFocusNode | null {
  const nodeRunId =
    trimOrNull(runSnapshot.executionFocusNodeRunId) ??
    trimOrNull(entry.ticket.node_run_id) ??
    trimOrNull(entry.request?.node_run_id);
  const nodeId = trimOrNull(runSnapshot.executionFocusNodeId);
  const nodeName = trimOrNull(runSnapshot.executionFocusNodeName);
  const nodeType = trimOrNull(runSnapshot.executionFocusNodeType);

  if (!nodeRunId || !nodeId || !nodeName || !nodeType) {
    return null;
  }

  const toolCalls = buildFocusToolCalls(runId, nodeRunId, runSnapshot);
  const blockingToolCall =
    toolCalls.find((toolCall) => trimOrNull(toolCall.execution_blocking_reason)) ?? null;
  const fallbackToolCall =
    toolCalls.find((toolCall) => trimOrNull(toolCall.execution_fallback_reason)) ?? null;
  const executionBlockedCount = toolCalls.filter((toolCall) =>
    trimOrNull(toolCall.execution_blocking_reason)
  ).length;
  const executionFallbackCount = toolCalls.filter((toolCall) =>
    trimOrNull(toolCall.execution_fallback_reason)
  ).length;

  return {
    node_run_id: nodeRunId,
    node_id: nodeId,
    node_name: nodeName,
    node_type: nodeType,
    waiting_reason: runSnapshot.waitingReason ?? null,
    scheduled_resume_delay_seconds: runSnapshot.scheduledResumeDelaySeconds ?? null,
    scheduled_resume_due_at: runSnapshot.scheduledResumeDueAt ?? null,
    callback_tickets: [],
    sensitive_access_entries: buildInlineSensitiveAccessEntries(entry),
    execution_fallback_count: executionFallbackCount,
    execution_blocked_count: executionBlockedCount,
    execution_unavailable_count: 0,
    execution_blocking_reason: blockingToolCall?.execution_blocking_reason ?? null,
    execution_fallback_reason: fallbackToolCall?.execution_fallback_reason ?? null,
    artifact_refs: runSnapshot.executionFocusArtifactRefs ?? [],
    artifacts: buildFocusArtifacts(runId, nodeRunId, runSnapshot),
    tool_calls: toolCalls
  };
}

export function buildSensitiveAccessInboxEntryExecutionContext(
  entry: SensitiveAccessInboxEntry,
  runSnapshot?: RunSnapshot | null,
  canonicalRunId?: string | null
): SensitiveAccessInboxExecutionContext | null {
  const runId =
    trimOrNull(canonicalRunId) ??
    trimOrNull(entry.ticket.run_id) ??
    trimOrNull(entry.request?.run_id) ??
    trimOrNull(entry.runFollowUp?.sampledRuns[0]?.runId);
  const focusNode = runSnapshot && runId ? buildFocusNode(entry, runId, runSnapshot) : null;
  if (!runId || !runSnapshot || !focusNode) {
    return null;
  }

  const entryNodeRunId =
    trimOrNull(entry.ticket.node_run_id) ?? trimOrNull(entry.request?.node_run_id);

  return {
    runId,
    focusNode,
    focusReason: (runSnapshot.executionFocusReason as RunExecutionFocusReason | null) ?? null,
    focusExplanation: runSnapshot.executionFocusExplanation ?? null,
    focusMatchesEntry:
      entryNodeRunId !== null ? entryNodeRunId === focusNode.node_run_id : false,
    entryNodeRunId,
    skillTrace: runSnapshot.executionFocusSkillTrace ?? null
  };
}
