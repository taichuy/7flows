import type {
  SensitiveAccessBulkActionResult,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";
import { formatRunSnapshotSummary } from "@/lib/operator-action-result-presenters";

export type SensitiveAccessBulkNarrativeItem = {
  label: string;
  text: string;
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

  for (const sample of result.sampledRuns ?? []) {
    const summary = formatRunSnapshotSummary(sample.snapshot ?? {});
    if (!summary) {
      continue;
    }
    items.push({ label: `Run ${sample.runId.slice(0, 8)}`, text: summary });
  }

  return items;
}

function normalizeExplanationText(
  explanation: SignalFollowUpExplanation | null | undefined,
  key: keyof SignalFollowUpExplanation
) {
  const value = explanation?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
