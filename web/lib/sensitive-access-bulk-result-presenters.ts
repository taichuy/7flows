import type {
  SensitiveAccessBulkActionResult,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";
import {
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineFocusArtifactPreview
} from "@/lib/operator-inline-action-feedback";
import type {
  ExecutionFocusToolCallSummary
} from "@/lib/run-execution-focus-presenters";
import type { SkillReferenceLoadItem } from "@/lib/get-run-views";

export type SensitiveAccessBulkNarrativeItem = {
  label: string;
  text: string;
};

export type SensitiveAccessBulkRunSampleCard = {
  runId: string;
  shortRunId: string;
  summary: string | null;
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
      const model = buildOperatorInlineActionFeedbackModel({
        runSnapshot: sample.snapshot ?? null
      });
      return {
        runId: sample.runId,
        shortRunId: sample.runId.slice(0, 8),
        summary: model.runSnapshotSummary ?? model.headline,
        runStatus: model.runStatus,
        currentNodeId: model.currentNodeId,
        focusNodeLabel: model.focusNodeLabel,
        waitingReason: model.waitingReason,
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
            item.focusSkillReferenceLoads.length > 0
        )
    );
}

function normalizeExplanationText(
  explanation: SignalFollowUpExplanation | null | undefined,
  key: keyof SignalFollowUpExplanation
) {
  const value = explanation?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
