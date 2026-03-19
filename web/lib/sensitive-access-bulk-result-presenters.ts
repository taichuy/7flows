import type {
  SensitiveAccessBulkActionResult,
  SensitiveAccessBulkRunSample,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  buildExecutionFocusExplainableNode,
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineFocusArtifactPreview
} from "@/lib/operator-inline-action-feedback";
import type {
  ExecutionFocusToolCallSummary
} from "@/lib/run-execution-focus-presenters";
import type { SkillReferenceLoadItem } from "@/lib/get-run-views";

type SensitiveAccessBulkRunSnapshot = NonNullable<SensitiveAccessBulkRunSample["snapshot"]>;

export type SensitiveAccessBulkNarrativeItem = {
  label: string;
  text: string;
};

export type SensitiveAccessBulkRunSampleCard = {
  runId: string;
  shortRunId: string;
  hasCallbackWaitingSummary: boolean;
  summary: string | null;
  runStatus: string | null;
  currentNodeId: string | null;
  focusNodeId: string | null;
  focusNodeLabel: string | null;
  focusNodeRunId: string | null;
  waitingReason: string | null;
  callbackWaitingExplanation: SensitiveAccessBulkRunSnapshot["callbackWaitingExplanation"] | null;
  callbackWaitingLifecycle: SensitiveAccessBulkRunSnapshot["callbackWaitingLifecycle"] | null;
  callbackWaitingFocusNodeEvidence: ReturnType<typeof buildExecutionFocusExplainableNode>;
  scheduledResumeDelaySeconds: number | null;
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
  skillReferenceCount: number;
  skillReferencePhaseSummary: string | null;
  skillReferenceSourceSummary: string | null;
  focusArtifactSummary: string | null;
  focusToolCallSummaries: ExecutionFocusToolCallSummary[];
  focusArtifacts: OperatorInlineFocusArtifactPreview[];
  focusSkillReferenceLoads: SkillReferenceLoadItem[];
};

export function buildSensitiveAccessBulkResultNarrative(
  result: SensitiveAccessBulkActionResult
): SensitiveAccessBulkNarrativeItem[] {
  const items: SensitiveAccessBulkNarrativeItem[] = [];
  const outcomePrimarySignal = normalizeExplanationText(result.outcomeExplanation, "primary_signal");
  const outcomeFollowUp = normalizeExplanationText(result.outcomeExplanation, "follow_up");
  const blockerDeltaSummary = result.blockerDeltaSummary?.trim() || null;
  const runFollowUpPrimarySignal = normalizeExplanationText(
    result.runFollowUpExplanation,
    "primary_signal"
  );
  const runFollowUpFollowUp = normalizeExplanationText(result.runFollowUpExplanation, "follow_up");

  if (outcomePrimarySignal) {
    items.push({ label: "Primary signal", text: outcomePrimarySignal });
  }
  if (outcomeFollowUp) {
    items.push({ label: "Follow-up", text: outcomeFollowUp });
  }
  if (blockerDeltaSummary) {
    items.push({ label: "Blocker delta", text: blockerDeltaSummary });
  }
  if (runFollowUpPrimarySignal) {
    items.push({ label: "Run follow-up", text: runFollowUpPrimarySignal });
  }
  if (runFollowUpFollowUp) {
    items.push({ label: "Next step", text: runFollowUpFollowUp });
  }

  return items;
}

export function buildSensitiveAccessBulkRunSampleCards(
  result: SensitiveAccessBulkActionResult
): SensitiveAccessBulkRunSampleCard[] {
  return (result.sampledRuns ?? [])
    .map((sample) => {
      const snapshot = sample.snapshot ?? null;
      const model = buildOperatorInlineActionFeedbackModel({
        runSnapshot: snapshot
      });

      const callbackWaitingExplanation = snapshot?.callbackWaitingExplanation ?? null;
      const callbackWaitingLifecycle = snapshot?.callbackWaitingLifecycle ?? null;
      const scheduledResumeDelaySeconds =
        typeof snapshot?.scheduledResumeDelaySeconds === "number"
          ? snapshot.scheduledResumeDelaySeconds
          : null;
      const scheduledResumeSource = normalizeText(snapshot?.scheduledResumeSource);
      const scheduledWaitingStatus = normalizeText(snapshot?.scheduledWaitingStatus);
      const scheduledResumeScheduledAt = normalizeText(snapshot?.scheduledResumeScheduledAt);
      const scheduledResumeDueAt = normalizeText(snapshot?.scheduledResumeDueAt);
      const scheduledResumeRequeuedAt = normalizeText(snapshot?.scheduledResumeRequeuedAt);
      const scheduledResumeRequeueSource = normalizeText(snapshot?.scheduledResumeRequeueSource);

      return {
        runId: sample.runId,
        shortRunId: sample.runId.slice(0, 8),
        hasCallbackWaitingSummary: hasCallbackWaitingSummaryFacts({
          callbackWaitingExplanation,
          callbackWaitingLifecycle,
          waitingReason: model.waitingReason,
          scheduledResumeDelaySeconds,
          scheduledResumeSource,
          scheduledWaitingStatus,
          scheduledResumeScheduledAt,
          scheduledResumeDueAt,
          scheduledResumeRequeuedAt,
          scheduledResumeRequeueSource
        }),
        summary: model.runSnapshotSummary ?? model.headline,
        runStatus: model.runStatus,
        currentNodeId: model.currentNodeId,
        focusNodeId: normalizeText(snapshot?.executionFocusNodeId),
        focusNodeLabel: model.focusNodeLabel,
        focusNodeRunId: normalizeText(snapshot?.executionFocusNodeRunId),
        waitingReason: model.waitingReason,
        callbackWaitingExplanation,
        callbackWaitingLifecycle,
        callbackWaitingFocusNodeEvidence: buildExecutionFocusExplainableNode(snapshot),
        scheduledResumeDelaySeconds,
        scheduledResumeSource,
        scheduledWaitingStatus,
        scheduledResumeScheduledAt,
        scheduledResumeDueAt,
        scheduledResumeRequeuedAt,
        scheduledResumeRequeueSource,
        artifactCount: model.artifactCount,
        artifactRefCount: model.artifactRefCount,
        toolCallCount: model.toolCallCount,
        rawRefCount: model.rawRefCount,
        skillReferenceCount: model.skillReferenceCount,
        skillReferencePhaseSummary: model.skillReferencePhaseSummary,
        skillReferenceSourceSummary: model.skillReferenceSourceSummary,
        focusArtifactSummary: model.focusArtifactSummary,
        focusToolCallSummaries: model.focusToolCallSummaries,
        focusArtifacts: model.focusArtifacts,
        focusSkillReferenceLoads: model.focusSkillReferenceLoads
      };
    })
    .filter(
      (item) =>
        Boolean(
          item.summary ||
            item.runStatus ||
            item.currentNodeId ||
            item.focusNodeLabel ||
            item.waitingReason ||
            item.artifactCount > 0 ||
            item.artifactRefCount > 0 ||
            item.toolCallCount > 0 ||
            item.rawRefCount > 0 ||
            item.skillReferenceCount > 0 ||
            item.hasCallbackWaitingSummary ||
            item.focusSkillReferenceLoads.length > 0
        )
    );
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeExplanationText(
  explanation: SignalFollowUpExplanation | null | undefined,
  key: keyof SignalFollowUpExplanation
) {
  const value = explanation?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
