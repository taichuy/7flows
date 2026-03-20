import type { RunSnapshot } from "@/app/actions/run-snapshot";
import type {
  PublishedEndpointInvocationFacetItem,
  PublishedEndpointInvocationCallbackTicketItem,
  PublishedEndpointInvocationItem,
  PublishedEndpointInvocationSummary,
  OperatorRunFollowUpSnapshot,
  RunExecutionFocusExplanation
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineFocusArtifactPreview
} from "@/lib/operator-inline-action-feedback";
import { formatRunSnapshotSummary } from "@/lib/operator-action-result-presenters";
import type { ExecutionFocusToolCallSummary } from "@/lib/run-execution-focus-presenters";
import { resolveSensitiveAccessTimelineEntryRunId } from "@/lib/sensitive-access";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";

type PublishedInvocationWaitingOverview = {
  activeWaitingCount: number;
  callbackWaitingCount: number;
  waitingInputCount: number;
  generalWaitingCount: number;
  syncWaitingRejectedCount: number;
  lastRunStatusLabel: string | null;
  headline: string;
  detail: string;
  chips: string[];
};

type PublishedInvocationSensitiveAccessSummary = NonNullable<
  NonNullable<PublishedEndpointInvocationItem["run_waiting_lifecycle"]>["sensitive_access_summary"]
>;

type PublishedInvocationRunFollowUpSummary = NonNullable<PublishedEndpointInvocationItem["run_follow_up"]>;
type PublishedInvocationRunFollowUpSample =
  PublishedInvocationRunFollowUpSummary["sampled_runs"][number];

export type PublishedInvocationRunFollowUpSampleView = {
  run_id: string;
  status: string | null;
  current_node_id: string | null;
  waiting_reason: string | null;
  run_snapshot: RunSnapshot;
  explanation_source: "callback_waiting" | "execution_focus" | null;
  explanation: RunExecutionFocusExplanation | null;
  snapshot_summary: string | null;
  has_callback_waiting_summary: boolean;
  execution_focus_artifact_count: number;
  execution_focus_artifact_ref_count: number;
  execution_focus_tool_call_count: number;
  execution_focus_raw_ref_count: number;
  skill_reference_count: number;
  skill_reference_phase_summary: string | null;
  skill_reference_source_summary: string | null;
  focus_artifact_summary: string | null;
  focus_tool_call_summaries: ExecutionFocusToolCallSummary[];
  focus_artifacts: OperatorInlineFocusArtifactPreview[];
  focus_skill_reference_loads: NonNullable<RunSnapshot["executionFocusSkillTrace"]>["loads"];
};

function buildPublishedInvocationRunFollowUpSampleSnapshot(
  sample?: PublishedInvocationRunFollowUpSample | null,
  explanationSource?: PublishedInvocationRunFollowUpSampleView["explanation_source"]
): RunSnapshot {
  return buildPublishedInvocationRunSnapshot(sample?.snapshot, explanationSource);
}

function buildPublishedInvocationRunSnapshot(
  snapshot?: OperatorRunFollowUpSnapshot | null,
  explanationSource?: PublishedInvocationRunFollowUpSampleView["explanation_source"]
): RunSnapshot {
  return {
    status: snapshot?.status ?? null,
    currentNodeId: snapshot?.current_node_id ?? null,
    waitingReason: snapshot?.waiting_reason ?? null,
    executionFocusNodeId: snapshot?.execution_focus_node_id ?? null,
    executionFocusNodeRunId: snapshot?.execution_focus_node_run_id ?? null,
    executionFocusNodeName: snapshot?.execution_focus_node_name ?? null,
    executionFocusNodeType: snapshot?.execution_focus_node_type ?? null,
    executionFocusExplanation:
      explanationSource === "callback_waiting"
        ? null
        : normalizeExplanation(snapshot?.execution_focus_explanation),
    callbackWaitingExplanation:
      explanationSource === "execution_focus"
        ? null
        : normalizeExplanation(snapshot?.callback_waiting_explanation),
    callbackWaitingLifecycle: snapshot?.callback_waiting_lifecycle ?? null,
    scheduledResumeDelaySeconds:
      typeof snapshot?.scheduled_resume_delay_seconds === "number"
        ? snapshot.scheduled_resume_delay_seconds
        : null,
    scheduledResumeReason: snapshot?.scheduled_resume_reason ?? null,
    scheduledResumeSource: snapshot?.scheduled_resume_source ?? null,
    scheduledWaitingStatus: snapshot?.scheduled_waiting_status ?? null,
    scheduledResumeScheduledAt: snapshot?.scheduled_resume_scheduled_at ?? null,
    scheduledResumeDueAt: snapshot?.scheduled_resume_due_at ?? null,
    scheduledResumeRequeuedAt: snapshot?.scheduled_resume_requeued_at ?? null,
    scheduledResumeRequeueSource: snapshot?.scheduled_resume_requeue_source ?? null,
    executionFocusArtifactCount: snapshot?.execution_focus_artifact_count ?? 0,
    executionFocusArtifactRefCount: snapshot?.execution_focus_artifact_ref_count ?? 0,
    executionFocusToolCallCount: snapshot?.execution_focus_tool_call_count ?? 0,
    executionFocusRawRefCount: snapshot?.execution_focus_raw_ref_count ?? 0,
    executionFocusArtifactRefs: snapshot?.execution_focus_artifact_refs ?? [],
    executionFocusArtifacts:
      snapshot?.execution_focus_artifacts?.map((artifact) => ({
        artifact_kind: artifact.artifact_kind ?? null,
        content_type: artifact.content_type ?? null,
        summary: artifact.summary ?? null,
        uri: artifact.uri ?? null
      })) ?? [],
    executionFocusToolCalls:
      snapshot?.execution_focus_tool_calls?.map((toolCall) => ({
        id: toolCall.id ?? null,
        tool_id: toolCall.tool_id ?? null,
        tool_name: toolCall.tool_name ?? null,
        phase: toolCall.phase ?? null,
        status: toolCall.status ?? null,
        ...(toolCall.requested_execution_class != null
          ? { requested_execution_class: toolCall.requested_execution_class }
          : {}),
        ...(toolCall.requested_execution_source != null
          ? { requested_execution_source: toolCall.requested_execution_source }
          : {}),
        ...(toolCall.requested_execution_profile != null
          ? { requested_execution_profile: toolCall.requested_execution_profile }
          : {}),
        ...(typeof toolCall.requested_execution_timeout_ms === "number"
          ? { requested_execution_timeout_ms: toolCall.requested_execution_timeout_ms }
          : {}),
        ...(toolCall.requested_execution_network_policy != null
          ? { requested_execution_network_policy: toolCall.requested_execution_network_policy }
          : {}),
        ...(toolCall.requested_execution_filesystem_policy != null
          ? { requested_execution_filesystem_policy: toolCall.requested_execution_filesystem_policy }
          : {}),
        ...(toolCall.requested_execution_dependency_mode != null
          ? { requested_execution_dependency_mode: toolCall.requested_execution_dependency_mode }
          : {}),
        ...(toolCall.requested_execution_builtin_package_set != null
          ? {
              requested_execution_builtin_package_set:
                toolCall.requested_execution_builtin_package_set
            }
          : {}),
        ...(toolCall.requested_execution_dependency_ref != null
          ? { requested_execution_dependency_ref: toolCall.requested_execution_dependency_ref }
          : {}),
        ...(toolCall.requested_execution_backend_extensions != null
          ? {
              requested_execution_backend_extensions:
                toolCall.requested_execution_backend_extensions
            }
          : {}),
        effective_execution_class: toolCall.effective_execution_class ?? null,
        ...(toolCall.execution_executor_ref != null
          ? { execution_executor_ref: toolCall.execution_executor_ref }
          : {}),
        execution_sandbox_backend_id: toolCall.execution_sandbox_backend_id ?? null,
        ...(toolCall.execution_sandbox_backend_executor_ref != null
          ? {
              execution_sandbox_backend_executor_ref:
                toolCall.execution_sandbox_backend_executor_ref
            }
          : {}),
        execution_sandbox_runner_kind: toolCall.execution_sandbox_runner_kind ?? null,
        execution_blocking_reason: toolCall.execution_blocking_reason ?? null,
        execution_fallback_reason: toolCall.execution_fallback_reason ?? null,
        response_summary: toolCall.response_summary ?? null,
        response_content_type: toolCall.response_content_type ?? null,
        raw_ref: toolCall.raw_ref ?? null
      })) ?? [],
    executionFocusSkillTrace: snapshot?.execution_focus_skill_trace
      ? {
          reference_count: snapshot.execution_focus_skill_trace.reference_count ?? 0,
          phase_counts: snapshot.execution_focus_skill_trace.phase_counts ?? {},
          source_counts: snapshot.execution_focus_skill_trace.source_counts ?? {},
          loads: snapshot.execution_focus_skill_trace.loads ?? []
        }
      : null
  };
}

export function normalizePublishedInvocationRunSnapshot(
  snapshot?: OperatorRunFollowUpSnapshot | null
): RunSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return buildPublishedInvocationRunSnapshot(snapshot);
}

export const PUBLISHED_INVOCATION_REASON_CODES = [
  "api_key_invalid",
  "api_key_required",
  "auth_mode_unsupported",
  "binding_inactive",
  "compiled_blueprint_missing",
  "protocol_mismatch",
  "rate_limit_exceeded",
  "rejected_other",
  "run_status_unsupported",
  "runtime_failed",
  "streaming_unsupported",
  "sync_waiting_unsupported",
  "target_version_missing",
  "unknown",
  "workflow_missing"
] as const;

export const PUBLISHED_INVOCATION_REQUEST_SURFACES = [
  "native.workflow",
  "native.workflow.async",
  "native.alias",
  "native.alias.async",
  "native.path",
  "native.path.async",
  "openai.chat.completions",
  "openai.chat.completions.async",
  "openai.responses",
  "openai.responses.async",
  "openai.unknown",
  "anthropic.messages",
  "anthropic.messages.async",
  "unknown"
] as const;
export const PUBLISHED_INVOCATION_CACHE_STATUSES = ["hit", "miss", "bypass"] as const;
export const PUBLISHED_RUN_STATUSES = [
  "queued",
  "running",
  "waiting",
  "waiting_input",
  "waiting_callback",
  "succeeded",
  "failed",
  "canceled",
  "timed_out"
] as const;

export type PublishedInvocationReasonCode =
  (typeof PUBLISHED_INVOCATION_REASON_CODES)[number];
export type PublishedInvocationRequestSurface =
  (typeof PUBLISHED_INVOCATION_REQUEST_SURFACES)[number];
export type PublishedInvocationCacheStatus =
  (typeof PUBLISHED_INVOCATION_CACHE_STATUSES)[number];
export type PublishedRunStatus = (typeof PUBLISHED_RUN_STATUSES)[number];

const REASON_LABELS: Record<string, string> = {
  api_key_invalid: "Invalid API key",
  api_key_required: "Missing API key",
  auth_mode_unsupported: "Unsupported auth mode",
  binding_inactive: "Inactive binding",
  compiled_blueprint_missing: "Missing blueprint",
  protocol_mismatch: "Protocol mismatch",
  rate_limit_exceeded: "Rate limit exceeded",
  rejected_other: "Rejected (other)",
  run_status_unsupported: "Unsupported run status",
  runtime_failed: "Runtime failed",
  streaming_unsupported: "Streaming not ready",
  sync_waiting_unsupported: "Sync waiting not supported",
  target_version_missing: "Missing workflow version",
  unknown: "Unknown issue",
  workflow_missing: "Workflow missing"
};

const REQUEST_SURFACE_LABELS: Record<string, string> = {
  "native.workflow": "Native workflow route",
  "native.workflow.async": "Native workflow async route",
  "native.alias": "Native alias route",
  "native.alias.async": "Native alias async route",
  "native.path": "Native path route",
  "native.path.async": "Native path async route",
  "openai.chat.completions": "OpenAI chat.completions",
  "openai.chat.completions.async": "OpenAI chat.completions async route",
  "openai.responses": "OpenAI responses",
  "openai.responses.async": "OpenAI responses async route",
  "openai.unknown": "OpenAI unknown surface",
  "anthropic.messages": "Anthropic messages",
  "anthropic.messages.async": "Anthropic messages async route",
  unknown: "Unknown surface"
};
const CACHE_STATUS_LABELS: Record<string, string> = {
  hit: "Cache hit",
  miss: "Cache miss",
  bypass: "Cache bypass"
};
const RUN_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  waiting_input: "Waiting input",
  waiting_callback: "Waiting callback",
  succeeded: "Run succeeded",
  failed: "Run failed",
  canceled: "Run canceled",
  timed_out: "Run timed out"
};

function getFacetCount(
  facets: PublishedEndpointInvocationFacetItem[] | null | undefined,
  value: string
) {
  return facets?.find((item) => item.value === value)?.count ?? 0;
}
function formatCountLabel(count: number, label: string) {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}
function joinFragments(fragments: string[]) {
  if (fragments.length === 0) {
    return null;
  }

  if (fragments.length === 1) {
    return fragments[0];
  }

  if (fragments.length === 2) {
    return `${fragments[0]} and ${fragments[1]}`;
  }

  return `${fragments.slice(0, -1).join(", ")}, and ${fragments[fragments.length - 1]}`;
}

function normalizeExplanation(
  explanation?: RunExecutionFocusExplanation | null
): RunExecutionFocusExplanation | null {
  const primarySignal = explanation?.primary_signal?.trim() || null;
  const followUp = explanation?.follow_up?.trim() || null;
  if (!primarySignal && !followUp) {
    return null;
  }

  return {
    primary_signal: primarySignal,
    follow_up: followUp
  };
}

function resolvePublishedInvocationSampleSnapshot(
  item: PublishedEndpointInvocationItem
) {
  const normalizedRunId = item.run_id?.trim() || null;
  const sampledRuns = item.run_follow_up?.sampled_runs ?? [];

  if (normalizedRunId) {
    const matchedSample = sampledRuns.find((sample) => sample.run_id === normalizedRunId);
    if (matchedSample?.snapshot) {
      return matchedSample.snapshot;
    }
  }

  return sampledRuns.find((sample) => sample.snapshot)?.snapshot ?? null;
}

export function resolvePublishedInvocationExecutionFocusExplanation(
  item: PublishedEndpointInvocationItem
): RunExecutionFocusExplanation | null {
  return (
    normalizeExplanation(item.execution_focus_explanation) ??
    normalizeExplanation(item.run_snapshot?.execution_focus_explanation) ??
    normalizeExplanation(resolvePublishedInvocationSampleSnapshot(item)?.execution_focus_explanation)
  );
}

export function resolvePublishedInvocationCallbackWaitingExplanation(
  item: PublishedEndpointInvocationItem
): RunExecutionFocusExplanation | null {
  return (
    normalizeExplanation(item.callback_waiting_explanation) ??
    normalizeExplanation(item.run_snapshot?.callback_waiting_explanation) ??
    normalizeExplanation(item.run_waiting_lifecycle?.callback_waiting_explanation) ??
    normalizeExplanation(resolvePublishedInvocationSampleSnapshot(item)?.callback_waiting_explanation)
  );
}

export function resolvePublishedInvocationRunFollowUpSampleExplanation(
  sample?: PublishedInvocationRunFollowUpSample | null
): PublishedInvocationRunFollowUpSampleView["explanation"] {
  return (
    normalizeExplanation(sample?.snapshot?.callback_waiting_explanation) ??
    normalizeExplanation(sample?.snapshot?.execution_focus_explanation)
  );
}

export function resolvePublishedInvocationRunFollowUpSampleExplanationSource(
  sample?: PublishedInvocationRunFollowUpSample | null
): PublishedInvocationRunFollowUpSampleView["explanation_source"] {
  if (normalizeExplanation(sample?.snapshot?.callback_waiting_explanation)) {
    return "callback_waiting";
  }
  if (normalizeExplanation(sample?.snapshot?.execution_focus_explanation)) {
    return "execution_focus";
  }
  return null;
}

export function listPublishedInvocationRunFollowUpSampleViews(
  runFollowUp?: PublishedInvocationRunFollowUpSummary | null
): PublishedInvocationRunFollowUpSampleView[] {
  return (runFollowUp?.sampled_runs ?? []).map((sample) => {
    const explanationSource = resolvePublishedInvocationRunFollowUpSampleExplanationSource(sample);
    const explanation = resolvePublishedInvocationRunFollowUpSampleExplanation(sample);
    const runSnapshot = buildPublishedInvocationRunFollowUpSampleSnapshot(sample, explanationSource);
    const snapshotSummary = formatRunSnapshotSummary(runSnapshot);
    const focusEvidenceModel = buildOperatorInlineActionFeedbackModel({ runSnapshot });

    return {
      run_id: sample.run_id,
      status: sample.snapshot?.status?.trim() || null,
      current_node_id: sample.snapshot?.current_node_id?.trim() || null,
      waiting_reason: sample.snapshot?.waiting_reason?.trim() || null,
      run_snapshot: runSnapshot,
      explanation_source: explanationSource,
      explanation,
      snapshot_summary: snapshotSummary,
      has_callback_waiting_summary: hasCallbackWaitingSummaryFacts(runSnapshot),
      execution_focus_artifact_count: sample.snapshot?.execution_focus_artifact_count ?? 0,
      execution_focus_artifact_ref_count: sample.snapshot?.execution_focus_artifact_ref_count ?? 0,
      execution_focus_tool_call_count: sample.snapshot?.execution_focus_tool_call_count ?? 0,
      execution_focus_raw_ref_count: sample.snapshot?.execution_focus_raw_ref_count ?? 0,
      skill_reference_count: focusEvidenceModel.skillReferenceCount,
      skill_reference_phase_summary: focusEvidenceModel.skillReferencePhaseSummary,
      skill_reference_source_summary: focusEvidenceModel.skillReferenceSourceSummary,
      focus_artifact_summary: focusEvidenceModel.focusArtifactSummary,
      focus_tool_call_summaries: focusEvidenceModel.focusToolCallSummaries,
      focus_artifacts: focusEvidenceModel.focusArtifacts,
      focus_skill_reference_loads: focusEvidenceModel.focusSkillReferenceLoads
    };
  });
}

export function listPublishedInvocationRunFollowUpSampleSummaries(
  runFollowUp?: PublishedInvocationRunFollowUpSummary | null
): string[] {
  return listPublishedInvocationRunFollowUpSampleViews(runFollowUp).map((sample) => {
    const shortRunId = sample.run_id.slice(0, 8);
    return sample.snapshot_summary
      ? `run ${shortRunId}：${sample.snapshot_summary}`
      : `run ${shortRunId}：暂未读取到最新快照。`;
  });
}
export function listPublishedInvocationSensitiveAccessChips(
  summary?: PublishedInvocationSensitiveAccessSummary | null
) {
  if (!summary) {
    return [];
  }

  const chips: string[] = [];
  if (summary.pending_approval_count > 0) {
    chips.push(`${formatCountLabel(summary.pending_approval_count, "approval pending")}`);
  }
  if (summary.rejected_approval_count > 0) {
    chips.push(`${formatCountLabel(summary.rejected_approval_count, "approval rejected")}`);
  }
  if (summary.expired_approval_count > 0) {
    chips.push(`${formatCountLabel(summary.expired_approval_count, "approval expired")}`);
  }
  if (summary.failed_notification_count > 0) {
    chips.push(`${formatCountLabel(summary.failed_notification_count, "notification retry")}`);
  }
  if (summary.pending_notification_count > 0) {
    chips.push(`${formatCountLabel(summary.pending_notification_count, "notification pending")}`);
  }
  return chips;
}

export function listPublishedInvocationSensitiveAccessRows(
  summary?: PublishedInvocationSensitiveAccessSummary | null
) {
  if (!summary || summary.request_count <= 0) {
    return [];
  }

  const approvalParts = [
    summary.pending_approval_count > 0
      ? `${formatCountLabel(summary.pending_approval_count, "pending")}`
      : null,
    summary.approved_approval_count > 0
      ? `${formatCountLabel(summary.approved_approval_count, "approved")}`
      : null,
    summary.rejected_approval_count > 0
      ? `${formatCountLabel(summary.rejected_approval_count, "rejected")}`
      : null,
    summary.expired_approval_count > 0
      ? `${formatCountLabel(summary.expired_approval_count, "expired")}`
      : null
  ].filter((value): value is string => Boolean(value));
  const notificationParts = [
    summary.pending_notification_count > 0
      ? `${formatCountLabel(summary.pending_notification_count, "pending")}`
      : null,
    summary.delivered_notification_count > 0
      ? `${formatCountLabel(summary.delivered_notification_count, "delivered")}`
      : null,
    summary.failed_notification_count > 0
      ? `${formatCountLabel(summary.failed_notification_count, "failed")}`
      : null
  ].filter((value): value is string => Boolean(value));

  return [
    {
      label: "Sensitive access",
      value:
        `${formatCountLabel(summary.request_count, "request")} · ` +
        `${formatCountLabel(summary.approval_ticket_count, "approval ticket")}`
    },
    ...(approvalParts.length
      ? [
          {
            label: "Approval blockers",
            value: approvalParts.join(" · ")
          }
        ]
      : []),
    ...(notificationParts.length
      ? [
          {
            label: "Notification delivery",
            value: notificationParts.join(" · ")
          }
        ]
      : [])
  ];
}

export function formatPublishedInvocationWaitingHeadline({
  explanation,
  fallbackHeadline,
  nodeRunId,
  nodeStatus
}: {
  explanation?: RunExecutionFocusExplanation | null;
  fallbackHeadline?: string | null;
  nodeRunId?: string | null;
  nodeStatus?: string | null;
}) {
  const primarySignal = explanation?.primary_signal?.trim();
  if (primarySignal) {
    return primarySignal;
  }
  if (fallbackHeadline) {
    return fallbackHeadline;
  }
  if (nodeRunId && nodeStatus) {
    return `node run ${nodeRunId} is still ${nodeStatus}.`;
  }
  return null;
}

export function formatPublishedInvocationWaitingFollowUp(
  explanation?: RunExecutionFocusExplanation | null
) {
  const followUp = explanation?.follow_up?.trim();
  return followUp || null;
}

export function formatPublishedInvocationReasonLabel(
  reasonCode: string | null | undefined
) {
  if (!reasonCode) {
    return "No issue";
  }

  return REASON_LABELS[reasonCode] ?? reasonCode.replaceAll("_", " ");
}

export function formatPublishedInvocationSurfaceLabel(
  requestSurface: string | null | undefined
) {
  if (!requestSurface) {
    return "Unknown surface";
  }

  return REQUEST_SURFACE_LABELS[requestSurface] ?? requestSurface;
}

export function formatPublishedInvocationCacheStatusLabel(
  cacheStatus: string | null | undefined
) {
  if (!cacheStatus) {
    return "Unknown cache state";
  }

  return CACHE_STATUS_LABELS[cacheStatus] ?? cacheStatus;
}

export function formatPublishedRunStatusLabel(runStatus: string | null | undefined) {
  if (!runStatus) {
    return "Unknown run state";
  }

  return RUN_STATUS_LABELS[runStatus] ?? runStatus.replaceAll("_", " ");
}

export function buildPublishedInvocationWaitingOverview({
  summary,
  runStatusCounts,
  reasonCounts
}: {
  summary?: PublishedEndpointInvocationSummary | null;
  runStatusCounts?: PublishedEndpointInvocationFacetItem[] | null;
  reasonCounts?: PublishedEndpointInvocationFacetItem[] | null;
}): PublishedInvocationWaitingOverview {
  const generalWaitingCount = getFacetCount(runStatusCounts, "waiting");
  const waitingInputCount = getFacetCount(runStatusCounts, "waiting_input");
  const callbackWaitingCount = getFacetCount(runStatusCounts, "waiting_callback");
  const activeWaitingCount = generalWaitingCount + waitingInputCount + callbackWaitingCount;
  const syncWaitingRejectedCount = getFacetCount(reasonCounts, "sync_waiting_unsupported");
  const lastRunStatusLabel = summary?.last_run_status
    ? formatPublishedRunStatusLabel(summary.last_run_status)
    : null;

  const chips: string[] = [];
  if (activeWaitingCount > 0) {
    chips.push(`${formatCountLabel(activeWaitingCount, "active waiting run")}`);
  }
  if (callbackWaitingCount > 0) {
    chips.push(`${formatCountLabel(callbackWaitingCount, "callback wait")}`);
  }
  if (waitingInputCount > 0) {
    chips.push(`${formatCountLabel(waitingInputCount, "approval/input wait")}`);
  }
  if (syncWaitingRejectedCount > 0) {
    chips.push(`${formatCountLabel(syncWaitingRejectedCount, "sync waiting rejection")}`);
  }
  if (lastRunStatusLabel) {
    chips.push(`latest ${lastRunStatusLabel}`);
  }

  if (activeWaitingCount > 0) {
    const blockers = joinFragments(
      [
        callbackWaitingCount > 0
          ? `${formatCountLabel(callbackWaitingCount, "run")} are still waiting on callback tickets or external tool responses`
          : null,
        waitingInputCount > 0
          ? `${formatCountLabel(waitingInputCount, "run")} are paused on approval or operator input`
          : null,
        generalWaitingCount > 0
          ? `${formatCountLabel(generalWaitingCount, "run")} are marked as generic waiting and should be checked in the latest invocation detail`
          : null
      ].filter((value): value is string => Boolean(value))
    );
    const detailParts = [
      blockers,
      syncWaitingRejectedCount > 0
        ? `${formatCountLabel(syncWaitingRejectedCount, "sync invocation")} were rejected because synchronous publish surfaces cannot stay in waiting.`
        : null,
      lastRunStatusLabel ? `Latest run status: ${lastRunStatusLabel}.` : null
    ].filter((value): value is string => Boolean(value));
    return {
      activeWaitingCount,
      callbackWaitingCount,
      waitingInputCount,
      generalWaitingCount,
      syncWaitingRejectedCount,
      lastRunStatusLabel,
      headline: `${formatCountLabel(activeWaitingCount, "publish invocation")} are still attached to the durable runtime waiting path.`,
      detail: detailParts.join(" "),
      chips
    };
  }

  if (syncWaitingRejectedCount > 0) {
    return {
      activeWaitingCount,
      callbackWaitingCount,
      waitingInputCount,
      generalWaitingCount,
      syncWaitingRejectedCount,
      lastRunStatusLabel,
      headline: `No active waiting runs remain, but ${formatCountLabel(syncWaitingRejectedCount, "sync publish invocation")} hit the waiting boundary.`,
      detail:
        "These requests reached a workflow that wanted to pause, but the synchronous publish surface could only reject the call. Prefer async routes or open a recent invocation detail to inspect the waiting lifecycle.",
      chips
    };
  }

  return {
    activeWaitingCount,
    callbackWaitingCount,
    waitingInputCount,
    generalWaitingCount,
    syncWaitingRejectedCount,
    lastRunStatusLabel,
    headline: "Current publish traffic does not show active waiting pressure.",
    detail: lastRunStatusLabel
      ? `The latest filtered run status is ${lastRunStatusLabel}, and no synchronous waiting boundary was hit in this slice.`
      : "The current audit slice has no waiting runs or synchronous waiting rejections to triage.",
    chips
  };
}

export function formatRateLimitPressure(
  requests: number,
  used: number
) {
  if (requests <= 0) {
    return {
      percentage: 0,
      label: "0%"
    };
  }

  const percentage = Math.min(Math.round((used / requests) * 100), 100);
  return {
    percentage,
    label: `${percentage}%`
  };
}

function findLatestApprovalEntry(entries: SensitiveAccessTimelineEntry[]) {
  return entries.find((entry) => entry.approval_ticket) ?? null;
}

export function buildPublishedInvocationInboxHref({
  invocation,
  callbackTickets,
  sensitiveAccessEntries
}: {
  invocation: PublishedEndpointInvocationItem;
  callbackTickets: PublishedEndpointInvocationCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
}) {
  const latestApprovalEntry = findLatestApprovalEntry(sensitiveAccessEntries);
  if (
    callbackTickets.length === 0 &&
    sensitiveAccessEntries.length === 0 &&
    !invocation.run_waiting_lifecycle?.node_run_id
  ) {
    return null;
  }

  const resolvedRunId = latestApprovalEntry
    ? resolveSensitiveAccessTimelineEntryRunId(latestApprovalEntry, invocation.run_id ?? null)
    : invocation.run_id ?? null;

  return buildSensitiveAccessInboxHref({
    runId: resolvedRunId,
    nodeRunId:
      invocation.run_waiting_lifecycle?.node_run_id ??
      latestApprovalEntry?.request.node_run_id ??
      latestApprovalEntry?.approval_ticket?.node_run_id ??
      callbackTickets[0]?.node_run_id ??
      null,
    status: latestApprovalEntry?.approval_ticket?.status ?? null,
    waitingStatus: latestApprovalEntry?.approval_ticket?.waiting_status ?? null,
    accessRequestId: latestApprovalEntry?.request.id ?? null,
    approvalTicketId: latestApprovalEntry?.approval_ticket?.id ?? null
  });
}
export function buildBlockingPublishedInvocationInboxHref({
  runId,
  blockingNodeRunId,
  blockingSensitiveAccessEntries
}: {
  runId?: string | null;
  blockingNodeRunId?: string | null;
  blockingSensitiveAccessEntries: SensitiveAccessTimelineEntry[];
}) {
  const latestBlockingEntry = findLatestApprovalEntry(blockingSensitiveAccessEntries);
  if (!blockingNodeRunId && latestBlockingEntry === null) {
    return null;
  }

  const resolvedRunId = latestBlockingEntry
    ? resolveSensitiveAccessTimelineEntryRunId(latestBlockingEntry, runId ?? null)
    : runId ?? null;

  return buildSensitiveAccessInboxHref({
    runId: resolvedRunId,
    nodeRunId:
      blockingNodeRunId ??
      latestBlockingEntry?.request.node_run_id ??
      latestBlockingEntry?.approval_ticket?.node_run_id ??
      null,
    status: latestBlockingEntry?.approval_ticket?.status ?? null,
    waitingStatus: latestBlockingEntry?.approval_ticket?.waiting_status ?? null,
    accessRequestId: latestBlockingEntry?.request.id ?? null,
    approvalTicketId: latestBlockingEntry?.approval_ticket?.id ?? null
  });
}
