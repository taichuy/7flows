import type { RunDetail } from "@/lib/get-run-detail";
import type {
  RunCallbackTicketItem,
  RunArtifactItem,
  RunExecutionFocusReason,
  SkillReferenceLoadItem,
  ToolCallItem
} from "@/lib/get-run-views";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { buildCallbackTicketInboxHref } from "@/lib/callback-ticket-links";
import { hasExecutionNodeCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import type { LegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import { buildSensitiveAccessTimelineInboxHref } from "@/lib/sensitive-access-links";
import {
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal
} from "@/lib/run-execution-focus-presenters";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";

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
  callbackTickets: RunCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
  callbackSummaryInboxHref: string | null;
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
  workflowCatalogGapHref: string | null;
  workflowGovernanceHref: string | null;
  workflowCatalogGapSummary: string | null;
  workflowCatalogGapDetail: string | null;
  legacyAuthHandoff: LegacyPublishAuthWorkflowHandoff | null;
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

function matchesSensitiveAccessEntryNodeRun(
  entry: SensitiveAccessTimelineEntry,
  nodeRunId: string
) {
  return Boolean(
    trimOrNull(entry.approval_ticket?.node_run_id) === nodeRunId ||
      trimOrNull(entry.request?.node_run_id) === nodeRunId
  );
}

function resolveCallbackSummarySample(run: RunDetail, focusNode: RunDetailFocusNode) {
  const normalizedRunId = trimOrNull(run.id);
  const normalizedNodeRunId = trimOrNull(focusNode.node_run_id);
  const samples = run.run_follow_up?.sampled_runs ?? [];

  if (normalizedRunId) {
    const matchedRunSample = samples.find((sample) => trimOrNull(sample.run_id) === normalizedRunId) ?? null;
    if (matchedRunSample) {
      return matchedRunSample;
    }
  }

  if (!normalizedNodeRunId) {
    return null;
  }

  return (
    samples.find(
      (sample) => trimOrNull(sample.snapshot?.execution_focus_node_run_id) === normalizedNodeRunId
    ) ??
    samples.find((sample) =>
      (sample.callback_tickets ?? []).some(
        (ticket) => trimOrNull(ticket.node_run_id) === normalizedNodeRunId
      )
    ) ??
    samples.find((sample) =>
      (sample.sensitive_access_entries ?? []).some((entry) =>
        matchesSensitiveAccessEntryNodeRun(entry, normalizedNodeRunId)
      )
    ) ??
    null
  );
}

function buildCallbackSummaryInboxHref({
  run,
  focusNode,
  callbackTickets,
  sensitiveAccessEntries
}: {
  run: RunDetail;
  focusNode: RunDetailFocusNode;
  callbackTickets: RunCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
}) {
  const latestApprovalEntry = sensitiveAccessEntries.find((entry) => entry.approval_ticket != null) ?? null;
  if (latestApprovalEntry) {
    return buildSensitiveAccessTimelineInboxHref(latestApprovalEntry, run.id);
  }

  const firstCallbackTicket = callbackTickets[0] ?? null;
  if (!firstCallbackTicket) {
    return null;
  }

  return buildCallbackTicketInboxHref(firstCallbackTicket, {
    runId: run.id,
    nodeRunId: trimOrNull(firstCallbackTicket.node_run_id) ?? trimOrNull(focusNode.node_run_id)
  });
}

export function buildRunDetailExecutionFocusViewModel(
  run: RunDetail | null,
  { workflowDetailHref = null }: { workflowDetailHref?: string | null } = {}
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
  const callbackSummarySample = resolveCallbackSummarySample(run, focusNode);
  const callbackTickets = callbackSummarySample?.callback_tickets ?? [];
  const sensitiveAccessEntries = callbackSummarySample?.sensitive_access_entries ?? [];
  const toolGovernance = callbackSummarySample?.tool_governance ?? run.tool_governance ?? null;
  const legacyAuthGovernance =
    callbackSummarySample?.legacy_auth_governance ?? run.legacy_auth_governance ?? null;
  const workflowId =
    trimOrNull(callbackSummarySample?.snapshot?.workflow_id) ?? trimOrNull(run.workflow_id);
  const workflowCatalogGapDetail = buildWorkflowCatalogGapDetail({
    toolGovernance,
    subjectLabel: "callback summary",
    returnDetail:
      "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照 callback summary、execution focus 与 trace。"
  });
  const workflowGovernanceHandoff = buildWorkflowGovernanceHandoff({
    workflowId,
    workflowDetailHref,
    toolGovernance,
    legacyAuthGovernance,
    workflowCatalogGapDetail
  });

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
    callbackTickets,
    sensitiveAccessEntries,
    callbackSummaryInboxHref: buildCallbackSummaryInboxHref({
      run,
      focusNode,
      callbackTickets,
      sensitiveAccessEntries
    }),
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
    workflowCatalogGapHref: workflowGovernanceHandoff.workflowCatalogGapHref,
    workflowGovernanceHref: workflowGovernanceHandoff.workflowGovernanceHref,
    workflowCatalogGapSummary: workflowGovernanceHandoff.workflowCatalogGapSummary,
    workflowCatalogGapDetail: workflowGovernanceHandoff.workflowCatalogGapDetail,
    legacyAuthHandoff: workflowGovernanceHandoff.legacyAuthHandoff,
    hasCallbackSummary: hasExecutionNodeCallbackWaitingSummaryFacts({
      callback_waiting_explanation: focusNode.callback_waiting_explanation ?? null,
      callback_waiting_lifecycle: focusNode.callback_waiting_lifecycle ?? null,
      waiting_reason: waitingReason,
      scheduled_resume_delay_seconds: focusNode.scheduled_resume_delay_seconds ?? null,
      scheduled_resume_source: trimOrNull(focusNode.scheduled_resume_source),
      scheduled_waiting_status: trimOrNull(focusNode.scheduled_waiting_status),
      scheduled_resume_scheduled_at: trimOrNull(focusNode.scheduled_resume_scheduled_at),
      scheduled_resume_due_at: trimOrNull(focusNode.scheduled_resume_due_at),
      scheduled_resume_requeued_at: trimOrNull(focusNode.scheduled_resume_requeued_at),
      scheduled_resume_requeue_source: trimOrNull(focusNode.scheduled_resume_requeue_source)
    })
  };
}
