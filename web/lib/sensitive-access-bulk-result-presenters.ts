import type {
  SensitiveAccessBulkActionResult,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  buildOperatorRecommendedActionCandidate,
  buildOperatorRecommendedNextStep,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import {
  buildOperatorRunSampleCards,
  type OperatorRunSampleCard
} from "@/lib/operator-run-sample-cards";

export type SensitiveAccessBulkNarrativeItem = {
  label: string;
  text: string;
};

export type SensitiveAccessBulkRunSampleCard = OperatorRunSampleCard;

export function buildSensitiveAccessBulkRecommendedNextStep(
  result: SensitiveAccessBulkActionResult
): OperatorRecommendedNextStep | null {
  const operatorFollowUp = normalizeExplanationText(result.runFollowUpExplanation, "follow_up");
  const candidate = buildOperatorRecommendedActionCandidate({
    action: result.runFollowUp?.recommendedAction ?? null,
    detail: operatorFollowUp,
    fallbackDetail:
      "本次批量治理已经回接 canonical run follow-up；优先按推荐入口继续查看受影响 run 或 inbox slice。"
  });

  if (!candidate) {
    return null;
  }

  return buildOperatorRecommendedNextStep({
    execution: candidate,
    operatorFollowUp,
    operatorLabel: "bulk follow-up"
  });
}

export function buildSensitiveAccessBulkResultNarrative(
  result: SensitiveAccessBulkActionResult
): SensitiveAccessBulkNarrativeItem[] {
  const items: SensitiveAccessBulkNarrativeItem[] = [];
  const seenTexts = new Set<string>();
  const sharedCallbackSummaryTexts = collectSharedCallbackSummaryTexts(result);
  const recommendedNextStep = buildSensitiveAccessBulkRecommendedNextStep(result);
  const deferredTexts = new Set(sharedCallbackSummaryTexts);
  const outcomePrimarySignal = normalizeExplanationText(result.outcomeExplanation, "primary_signal");
  const outcomeFollowUp = normalizeExplanationText(result.outcomeExplanation, "follow_up");
  const blockerDeltaSummary = result.blockerDeltaSummary?.trim() || null;
  const runFollowUpPrimarySignal = normalizeExplanationText(
    result.runFollowUpExplanation,
    "primary_signal"
  );
  const runFollowUpFollowUp = normalizeExplanationText(result.runFollowUpExplanation, "follow_up");

  if (recommendedNextStep?.detail) {
    deferredTexts.add(recommendedNextStep.detail);
  }

  pushNarrativeItem(items, seenTexts, deferredTexts, "Primary signal", outcomePrimarySignal);
  pushNarrativeItem(items, seenTexts, deferredTexts, "Follow-up", outcomeFollowUp);
  pushNarrativeItem(items, seenTexts, deferredTexts, "Blocker delta", blockerDeltaSummary);
  pushNarrativeItem(
    items,
    seenTexts,
    deferredTexts,
    "Run follow-up",
    runFollowUpPrimarySignal
  );
  if (!recommendedNextStep) {
    pushNarrativeItem(items, seenTexts, deferredTexts, "Next step", runFollowUpFollowUp);
  }

  return items;
}

export function buildSensitiveAccessBulkRunSampleCards(
  result: SensitiveAccessBulkActionResult
): SensitiveAccessBulkRunSampleCard[] {
  return buildOperatorRunSampleCards(result.sampledRuns ?? []);
}

function normalizeExplanationText(
  explanation: SignalFollowUpExplanation | null | undefined,
  key: keyof SignalFollowUpExplanation
) {
  const value = explanation?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pushNarrativeItem(
  items: SensitiveAccessBulkNarrativeItem[],
  seenTexts: Set<string>,
  sharedCallbackSummaryTexts: Set<string>,
  label: string,
  text: string | null
) {
  if (!text) {
    return;
  }

  if (seenTexts.has(text) || sharedCallbackSummaryTexts.has(text)) {
    return;
  }

  items.push({ label, text });
  seenTexts.add(text);
}

function collectSharedCallbackSummaryTexts(result: SensitiveAccessBulkActionResult) {
  const texts = new Set<string>();

  for (const sampledRun of result.sampledRuns ?? []) {
    const snapshot = sampledRun.snapshot;
    if (!hasCallbackWaitingSummaryFacts(snapshot)) {
      continue;
    }

    const primarySignal = normalizeExplanationText(snapshot?.callbackWaitingExplanation, "primary_signal");
    const followUp = normalizeExplanationText(snapshot?.callbackWaitingExplanation, "follow_up");

    if (primarySignal) {
      texts.add(primarySignal);
    }
    if (followUp) {
      texts.add(followUp);
    }
  }

  return texts;
}
