import type { OperatorRunFollowUpSummary, RunSnapshot } from "@/app/actions/run-snapshot";
import {
  formatPrimaryGovernedResourceChineseDetail,
  formatSensitiveResourceGovernanceSummary
} from "@/lib/credential-governance";
import type { SensitiveResourceItem } from "@/lib/get-sensitive-access";
import type {
  RunArtifactItem,
  RunExecutionNodeItem,
  SkillReferenceLoadItem,
  ToolCallItem
} from "@/lib/get-run-views";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-types";
import {
  buildOperatorRunFollowUpSampleInboxContext,
  type OperatorRunFollowUpSampleInboxContext
} from "@/lib/operator-run-follow-up-samples";
import {
  formatExecutionFocusArtifactSummary,
  listExecutionFocusToolCallSummaries,
  type ExecutionFocusToolCallSummary
} from "@/lib/run-execution-focus-presenters";

import { formatRunSnapshotSummary } from "./operator-action-result-presenters";

export type SignalFollowUpExplanation = {
  primary_signal?: string | null;
  follow_up?: string | null;
};

export type OperatorInlineActionResultState = {
  outcomeExplanation?: SignalFollowUpExplanation | null;
  runFollowUpExplanation?: SignalFollowUpExplanation | null;
  runFollowUp?: OperatorRunFollowUpSummary | null;
  blockerDeltaSummary?: string | null;
  primaryResource?: SensitiveResourceItem | null;
  runSnapshot?: RunSnapshot | null;
  legacyAuthGovernance?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
};

export type OperatorInlineActionFeedbackModel = {
  hasStructuredContent: boolean;
  headline: string | null;
  outcomeFollowUp: string | null;
  primaryResourceSummary: string | null;
  primaryResourceDetail: string | null;
  runFollowUpPrimarySignal: string | null;
  runFollowUpFollowUp: string | null;
  blockerDeltaSummary: string | null;
  runSnapshotSummary: string | null;
  runStatus: string | null;
  currentNodeId: string | null;
  focusNodeLabel: string | null;
  waitingReason: string | null;
  artifactCount: number;
  artifactRefCount: number;
  toolCallCount: number;
  rawRefCount: number;
  skillReferenceCount: number;
  skillReferencePhaseSummary: string | null;
  skillReferenceSourceSummary: string | null;
  focusArtifactSummary: string | null;
  focusToolCallSummaries: ExecutionFocusToolCallSummary[];
  focusArtifacts: OperatorInlineFocusArtifactPreview[];
  focusSkillReferenceLoads: SkillReferenceLoadItem[];
};

export type OperatorInlineActionSampleInboxContext = OperatorRunFollowUpSampleInboxContext;

export type OperatorInlineFocusArtifactPreview = {
  key: string;
  artifactKind: string;
  contentType: string | null;
  summary: string | null;
  uri: string | null;
};

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export const buildOperatorInlineActionSampleInboxContext =
  buildOperatorRunFollowUpSampleInboxContext;

function buildExecutionFocusArtifactSamples(
  runSnapshot?: RunSnapshot | null
): OperatorInlineFocusArtifactPreview[] {
  return (runSnapshot?.executionFocusArtifacts ?? []).slice(0, 2).map((artifact, index) => ({
    key:
      normalizeText(artifact?.uri) ??
      normalizeText(artifact?.summary) ??
      `focus-artifact-${index}`,
    artifactKind: normalizeText(artifact?.artifact_kind) ?? "artifact",
    contentType: normalizeText(artifact?.content_type),
    summary: normalizeText(artifact?.summary),
    uri: normalizeText(artifact?.uri)
  }));
}

export function buildExecutionFocusExplainableNode(
  runSnapshot?: RunSnapshot | null
): Pick<RunExecutionNodeItem, "tool_calls" | "artifact_refs" | "artifacts"> | null {
  if (!runSnapshot) {
    return null;
  }

  const toolCalls: ToolCallItem[] = (runSnapshot.executionFocusToolCalls ?? []).map((toolCall, index) => ({
    id: normalizeText(toolCall?.id) ?? `focus-tool-call-${index}`,
    run_id: "snapshot-run",
    node_run_id: normalizeText(runSnapshot.executionFocusNodeRunId) ?? "snapshot-node-run",
    tool_id: normalizeText(toolCall?.tool_id) ?? normalizeText(toolCall?.tool_name) ?? `tool-${index}`,
    tool_name: normalizeText(toolCall?.tool_name) ?? normalizeText(toolCall?.tool_id) ?? `tool-${index}`,
    phase: normalizeText(toolCall?.phase) ?? "n/a",
    status: normalizeText(toolCall?.status) ?? "unknown",
    request_summary: "",
    latency_ms: 0,
    retry_count: 0,
    created_at: "",
    requested_execution_class: normalizeText(toolCall?.requested_execution_class),
    requested_execution_source: normalizeText(toolCall?.requested_execution_source),
    requested_execution_profile: normalizeText(toolCall?.requested_execution_profile),
    requested_execution_timeout_ms:
      typeof toolCall?.requested_execution_timeout_ms === "number"
        ? toolCall.requested_execution_timeout_ms
        : null,
    requested_execution_network_policy: normalizeText(
      toolCall?.requested_execution_network_policy
    ),
    requested_execution_filesystem_policy: normalizeText(
      toolCall?.requested_execution_filesystem_policy
    ),
    requested_execution_dependency_mode: normalizeText(
      toolCall?.requested_execution_dependency_mode
    ),
    requested_execution_builtin_package_set: normalizeText(
      toolCall?.requested_execution_builtin_package_set
    ),
    requested_execution_dependency_ref: normalizeText(
      toolCall?.requested_execution_dependency_ref
    ),
    requested_execution_backend_extensions:
      toolCall?.requested_execution_backend_extensions ?? null,
    effective_execution_class: normalizeText(toolCall?.effective_execution_class),
    execution_executor_ref: normalizeText(toolCall?.execution_executor_ref),
    execution_sandbox_backend_id: normalizeText(toolCall?.execution_sandbox_backend_id),
    execution_sandbox_backend_executor_ref: normalizeText(
      toolCall?.execution_sandbox_backend_executor_ref
    ),
    execution_sandbox_runner_kind: normalizeText(toolCall?.execution_sandbox_runner_kind),
    adapter_request_trace_id: normalizeText(toolCall?.adapter_request_trace_id),
    adapter_request_execution: toolCall?.adapter_request_execution ?? null,
    adapter_request_execution_class: normalizeText(toolCall?.adapter_request_execution_class),
    adapter_request_execution_source: normalizeText(toolCall?.adapter_request_execution_source),
    adapter_request_execution_contract: toolCall?.adapter_request_execution_contract ?? null,
    execution_blocking_reason: normalizeText(toolCall?.execution_blocking_reason),
    execution_fallback_reason: normalizeText(toolCall?.execution_fallback_reason),
    response_summary: normalizeText(toolCall?.response_summary),
    response_content_type: normalizeText(toolCall?.response_content_type),
    response_meta: undefined,
    raw_ref: normalizeText(toolCall?.raw_ref),
    error_message: null,
    finished_at: null
  }));
  const artifacts: RunArtifactItem[] = (runSnapshot.executionFocusArtifacts ?? []).map(
    (artifact, index) => ({
      id: `focus-artifact-${index}`,
      run_id: "snapshot-run",
      node_run_id: normalizeText(runSnapshot.executionFocusNodeRunId),
      artifact_kind: normalizeText(artifact?.artifact_kind) ?? "artifact",
      content_type: normalizeText(artifact?.content_type) ?? "unknown",
      summary: normalizeText(artifact?.summary) ?? "",
      uri: normalizeText(artifact?.uri) ?? "",
      metadata_payload: {},
      created_at: ""
    })
  );

  if (
    toolCalls.length === 0 &&
    artifacts.length === 0 &&
    (runSnapshot.executionFocusArtifactRefs?.length ?? 0) === 0
  ) {
    return null;
  }

  return {
    tool_calls: toolCalls,
    artifact_refs: runSnapshot.executionFocusArtifactRefs ?? [],
    artifacts
  };
}

function formatMetricSummary(metrics?: Record<string, number> | null) {
  if (!metrics || typeof metrics !== "object") {
    return null;
  }

  const parts = Object.entries(metrics)
    .filter(([key, value]) => key.trim() && Number.isFinite(value) && value > 0)
    .map(([key, value]) => `${key} ${value}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function hasStructuredOperatorInlineActionResult(input: OperatorInlineActionResultState) {
  return Boolean(buildOperatorInlineActionFeedbackModel(input).hasStructuredContent);
}

export function buildOperatorInlineActionFeedbackModel(
  input: OperatorInlineActionResultState & {
    message?: string | null;
  }
): OperatorInlineActionFeedbackModel {
  const outcomePrimarySignal = normalizeText(input.outcomeExplanation?.primary_signal);
  const outcomeFollowUp = normalizeText(input.outcomeExplanation?.follow_up);
  const runFollowUpPrimarySignal = normalizeText(input.runFollowUpExplanation?.primary_signal);
  const runFollowUpFollowUp = normalizeText(input.runFollowUpExplanation?.follow_up);
  const blockerDeltaSummary = normalizeText(input.blockerDeltaSummary);
  const primaryResourceSummary = formatSensitiveResourceGovernanceSummary(
    input.primaryResource ?? null
  );
  const primaryResourceDetail = formatPrimaryGovernedResourceChineseDetail(
    input.primaryResource ?? null
  );
  const runSnapshotSummary = normalizeText(formatRunSnapshotSummary(input.runSnapshot ?? {}));
  const runStatus = normalizeText(input.runSnapshot?.status);
  const currentNodeId = normalizeText(input.runSnapshot?.currentNodeId);
  const focusNodeLabel =
    normalizeText(input.runSnapshot?.executionFocusNodeName) ??
    normalizeText(input.runSnapshot?.executionFocusNodeId);
  const waitingReason = normalizeText(input.runSnapshot?.waitingReason);
  const artifactCount =
    input.runSnapshot?.executionFocusArtifactCount ??
    input.runSnapshot?.executionFocusArtifacts?.length ??
    0;
  const artifactRefCount = input.runSnapshot?.executionFocusArtifactRefCount ?? 0;
  const toolCallCount =
    input.runSnapshot?.executionFocusToolCallCount ??
    input.runSnapshot?.executionFocusToolCalls?.length ??
    0;
  const rawRefCount =
    input.runSnapshot?.executionFocusRawRefCount ??
    input.runSnapshot?.executionFocusToolCalls?.filter((item) => normalizeText(item?.raw_ref)).length ??
    0;
  const skillReferenceCount = input.runSnapshot?.executionFocusSkillTrace?.reference_count ?? 0;
  const skillReferencePhaseSummary = formatMetricSummary(
    input.runSnapshot?.executionFocusSkillTrace?.phase_counts
  );
  const skillReferenceSourceSummary = formatMetricSummary(
    input.runSnapshot?.executionFocusSkillTrace?.source_counts
  );
  const focusExplainableNode = buildExecutionFocusExplainableNode(input.runSnapshot);
  const focusArtifactSummary = focusExplainableNode
    ? formatExecutionFocusArtifactSummary(focusExplainableNode)
    : null;
  const focusToolCallSummaries = focusExplainableNode
    ? listExecutionFocusToolCallSummaries(focusExplainableNode)
    : [];
  const focusArtifacts = buildExecutionFocusArtifactSamples(input.runSnapshot);
  const focusSkillReferenceLoads = input.runSnapshot?.executionFocusSkillTrace?.loads ?? [];
  const sampledRunCount = input.runFollowUp?.sampledRuns.length ?? 0;
  const legacyAuthBindingCount = input.legacyAuthGovernance?.binding_count ?? 0;
  const headline =
    outcomePrimarySignal ??
    runFollowUpPrimarySignal ??
    runSnapshotSummary ??
    normalizeText(input.message) ??
    null;

  return {
    hasStructuredContent: Boolean(
        outcomePrimarySignal ||
        outcomeFollowUp ||
        primaryResourceSummary ||
        runFollowUpPrimarySignal ||
        runFollowUpFollowUp ||
        blockerDeltaSummary ||
        runSnapshotSummary ||
        runStatus ||
        currentNodeId ||
        focusNodeLabel ||
        waitingReason ||
        artifactCount > 0 ||
        artifactRefCount > 0 ||
        toolCallCount > 0 ||
        rawRefCount > 0 ||
        skillReferenceCount > 0 ||
        sampledRunCount > 0 ||
        legacyAuthBindingCount > 0 ||
        focusArtifactSummary ||
        focusToolCallSummaries.length > 0 ||
        focusArtifacts.length > 0 ||
        focusSkillReferenceLoads.length > 0
    ),
    headline,
    outcomeFollowUp,
    primaryResourceSummary,
    primaryResourceDetail,
    runFollowUpPrimarySignal:
      runFollowUpPrimarySignal && runFollowUpPrimarySignal !== headline
        ? runFollowUpPrimarySignal
        : null,
    runFollowUpFollowUp,
    blockerDeltaSummary,
    runSnapshotSummary:
      runSnapshotSummary &&
      runSnapshotSummary !== headline &&
      runSnapshotSummary !== runFollowUpPrimarySignal
        ? runSnapshotSummary
        : null,
    runStatus,
    currentNodeId,
    focusNodeLabel,
    waitingReason,
    artifactCount,
    artifactRefCount,
    toolCallCount,
    rawRefCount,
    skillReferenceCount,
    skillReferencePhaseSummary,
    skillReferenceSourceSummary,
    focusArtifactSummary,
    focusToolCallSummaries,
    focusArtifacts,
    focusSkillReferenceLoads
  };
}
