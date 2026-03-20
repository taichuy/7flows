import type { RunDetail } from "@/lib/get-run-detail";
import type {
  RunArtifactItem,
  RunExecutionFocusReason,
  SkillReferenceLoadItem,
  ToolCallItem
} from "@/lib/get-run-views";
import {
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal
} from "@/lib/run-execution-focus-presenters";

type RunDetailFocusEvidence = {
  artifact_refs: string[];
  artifacts: RunArtifactItem[];
  tool_calls: ToolCallItem[];
};

type RunDetailFocusNode = NonNullable<RunDetail["execution_focus_node"]>;

export type RunDetailExecutionFocusViewModel = {
  nodeId: string;
  nodeName: string;
  nodeRunId: string;
  nodeType: string;
  reason: RunExecutionFocusReason | null;
  primarySignal: string | null;
  followUp: string | null;
  waitingReason: string | null;
  callbackWaitingExplanation: RunDetailFocusNode["callback_waiting_explanation"];
  callbackWaitingLifecycle: RunDetailFocusNode["callback_waiting_lifecycle"];
  scheduledResumeDelaySeconds: number | null;
  scheduledResumeReason: string | null;
  scheduledResumeSource: string | null;
  scheduledWaitingStatus: string | null;
  scheduledResumeScheduledAt: string | null;
  scheduledResumeDueAt: string | null;
  scheduledResumeRequeuedAt: string | null;
  scheduledResumeRequeueSource: string | null;
  artifactCount: number;
  artifactRefCount: number;
  toolCallCount: number;
  rawRefCount: number;
  evidence: RunDetailFocusEvidence;
  skillReferenceCount: number;
  skillReferencePhaseCounts: Record<string, number>;
  skillReferenceSourceCounts: Record<string, number>;
  skillReferenceLoads: SkillReferenceLoadItem[];
  hasCallbackSummary: boolean;
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeSkillReferenceLoads(
  loads?: SkillReferenceLoadItem[] | null
): SkillReferenceLoadItem[] {
  if (!Array.isArray(loads)) {
    return [];
  }

  return loads.filter(
    (load) =>
      typeof load?.phase === "string" &&
      load.phase.trim().length > 0 &&
      Array.isArray(load.references) &&
      load.references.length > 0
  );
}

export function buildRunDetailExecutionFocusViewModel(
  run: RunDetail | null
): RunDetailExecutionFocusViewModel | null {
  const focusNode = run?.execution_focus_node;
  if (!run || !focusNode) {
    return null;
  }

  const matchingNodeRun =
    run.node_runs.find((nodeRun) => nodeRun.id === focusNode.node_run_id) ?? null;
  const waitingReason = matchingNodeRun?.waiting_reason ?? null;
  const evidence: RunDetailFocusEvidence = {
    artifact_refs: focusNode.artifact_refs ?? [],
    artifacts: focusNode.artifacts ?? [],
    tool_calls: focusNode.tool_calls ?? []
  };
  const fallbackPrimarySignal = formatExecutionFocusPrimarySignal({
    execution_blocking_reason: focusNode.execution_blocking_reason ?? null,
    execution_fallback_reason: focusNode.execution_fallback_reason ?? null,
    execution_fallback_count: focusNode.execution_fallback_reason ? 1 : 0,
    execution_blocked_count: focusNode.execution_blocking_reason ? 1 : 0,
    execution_unavailable_count: 0,
    node_type: focusNode.node_type,
    waiting_reason: waitingReason,
    scheduled_resume_delay_seconds: focusNode.scheduled_resume_delay_seconds ?? null,
    scheduled_resume_due_at: focusNode.scheduled_resume_due_at ?? null,
    callback_tickets: [],
    sensitive_access_entries: []
  });
  const fallbackFollowUp = formatExecutionFocusFollowUp({
    execution_blocking_reason: focusNode.execution_blocking_reason ?? null,
    execution_fallback_reason: focusNode.execution_fallback_reason ?? null,
    execution_fallback_count: focusNode.execution_fallback_reason ? 1 : 0,
    execution_blocked_count: focusNode.execution_blocking_reason ? 1 : 0,
    execution_unavailable_count: 0,
    node_type: focusNode.node_type,
    waiting_reason: waitingReason,
    scheduled_resume_delay_seconds: focusNode.scheduled_resume_delay_seconds ?? null,
    scheduled_resume_due_at: focusNode.scheduled_resume_due_at ?? null,
    callback_tickets: [],
    sensitive_access_entries: []
  });
  const skillReferenceLoads = normalizeSkillReferenceLoads(
    run.execution_focus_skill_trace?.loads
  );

  return {
    nodeId: focusNode.node_id,
    nodeName: focusNode.node_name,
    nodeRunId: focusNode.node_run_id,
    nodeType: focusNode.node_type,
    reason: run.execution_focus_reason ?? null,
    primarySignal:
      trimOrNull(run.execution_focus_explanation?.primary_signal) ?? fallbackPrimarySignal,
    followUp: trimOrNull(run.execution_focus_explanation?.follow_up) ?? fallbackFollowUp,
    waitingReason,
    callbackWaitingExplanation: focusNode.callback_waiting_explanation ?? null,
    callbackWaitingLifecycle: focusNode.callback_waiting_lifecycle ?? null,
    scheduledResumeDelaySeconds:
      typeof focusNode.scheduled_resume_delay_seconds === "number"
        ? focusNode.scheduled_resume_delay_seconds
        : null,
    scheduledResumeReason: trimOrNull(focusNode.scheduled_resume_reason),
    scheduledResumeSource: trimOrNull(focusNode.scheduled_resume_source),
    scheduledWaitingStatus: trimOrNull(focusNode.scheduled_waiting_status),
    scheduledResumeScheduledAt: trimOrNull(focusNode.scheduled_resume_scheduled_at),
    scheduledResumeDueAt: trimOrNull(focusNode.scheduled_resume_due_at),
    scheduledResumeRequeuedAt: trimOrNull(focusNode.scheduled_resume_requeued_at),
    scheduledResumeRequeueSource: trimOrNull(
      focusNode.scheduled_resume_requeue_source
    ),
    artifactCount: evidence.artifacts.length,
    artifactRefCount: evidence.artifact_refs.length,
    toolCallCount: evidence.tool_calls.length,
    rawRefCount: evidence.tool_calls.filter((toolCall) => trimOrNull(toolCall.raw_ref)).length,
    evidence,
    skillReferenceCount: run.execution_focus_skill_trace?.reference_count ?? 0,
    skillReferencePhaseCounts: run.execution_focus_skill_trace?.phase_counts ?? {},
    skillReferenceSourceCounts: run.execution_focus_skill_trace?.source_counts ?? {},
    skillReferenceLoads,
    hasCallbackSummary: Boolean(
      focusNode.callback_waiting_explanation ||
        focusNode.callback_waiting_lifecycle ||
        waitingReason ||
        typeof focusNode.scheduled_resume_delay_seconds === "number" ||
        focusNode.scheduled_resume_due_at ||
        focusNode.scheduled_resume_requeued_at
    )
  };
}
