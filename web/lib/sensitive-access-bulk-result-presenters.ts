import type {
  SensitiveAccessBulkActionResult,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import { formatSensitiveResourceGovernanceSummary } from "@/lib/credential-governance";
import type { LegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import {
  buildOperatorRecommendedActionCandidate,
  buildOperatorRecommendedNextStep,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import {
  buildOperatorRunSampleCards,
  type OperatorRunSampleCard
} from "@/lib/operator-run-sample-cards";
import { buildWorkflowGovernanceHandoff } from "@/lib/workflow-governance-handoff";

export type SensitiveAccessBulkNarrativeItem = {
  label: string;
  text: string;
};

export type SensitiveAccessBulkRunSampleCard = OperatorRunSampleCard;

export type SensitiveAccessBulkWorkflowGovernanceSummary = {
  narrativeText: string | null;
  workflowCatalogGapSummary: string | null;
  workflowCatalogGapDetail: string | null;
  workflowCatalogGapHref: string | null;
  workflowGovernanceHref: string | null;
  legacyAuthHandoff: LegacyPublishAuthWorkflowHandoff | null;
};

type BuildSensitiveAccessBulkRunSampleCardsOptions = {
  resolveWorkflowDetailHref?: ((workflowId: string) => string | null) | null;
};

type BuildSensitiveAccessBulkWorkflowGovernanceSummaryOptions =
  BuildSensitiveAccessBulkRunSampleCardsOptions & {
    sampledRunCards?: SensitiveAccessBulkRunSampleCard[];
  };

export function buildSensitiveAccessBulkRecommendedNextStep(
  result: SensitiveAccessBulkActionResult,
  options: { currentHref?: string | null } = {}
): OperatorRecommendedNextStep | null {
  const { currentHref = null } = options;
  const operatorFollowUp = normalizeExplanationText(result.runFollowUpExplanation, "follow_up");
  const primaryResourceSummary = formatSensitiveResourceGovernanceSummary(result.primaryResource ?? null);
  const candidate = buildOperatorRecommendedActionCandidate({
    action: result.runFollowUp?.recommendedAction ?? null,
    detail: operatorFollowUp,
    fallbackDetail:
      "本次批量治理已经回接 canonical run follow-up；优先按推荐入口继续查看受影响 run 或 inbox slice。",
    primaryResourceSummary
  });

  if (!candidate) {
    return null;
  }

  return buildOperatorRecommendedNextStep({
    execution: candidate,
    currentHref,
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
  const primaryResourceSummary = formatSensitiveResourceGovernanceSummary(
    result.primaryResource ?? null
  );
  const runFollowUpPrimarySignal = normalizeExplanationText(
    result.runFollowUpExplanation,
    "primary_signal"
  );
  const runFollowUpFollowUp = normalizeExplanationText(result.runFollowUpExplanation, "follow_up");
  const workflowGovernance = buildSensitiveAccessBulkWorkflowGovernanceSummary(result);

  if (recommendedNextStep?.detail) {
    deferredTexts.add(recommendedNextStep.detail);
  }
  if (recommendedNextStep?.primaryResourceSummary) {
    deferredTexts.add(recommendedNextStep.primaryResourceSummary);
  }

  pushNarrativeItem(items, seenTexts, deferredTexts, "Primary signal", outcomePrimarySignal);
  pushNarrativeItem(items, seenTexts, deferredTexts, "Follow-up", outcomeFollowUp);
  pushNarrativeItem(
    items,
    seenTexts,
    deferredTexts,
    "Primary governed resource",
    primaryResourceSummary
  );
  pushNarrativeItem(items, seenTexts, deferredTexts, "Blocker delta", blockerDeltaSummary);
  pushNarrativeItem(
    items,
    seenTexts,
    deferredTexts,
    "Run follow-up",
    runFollowUpPrimarySignal
  );
  pushNarrativeItem(
    items,
    seenTexts,
    deferredTexts,
    "Workflow governance",
    workflowGovernance?.narrativeText ?? null
  );
  if (!recommendedNextStep) {
    pushNarrativeItem(items, seenTexts, deferredTexts, "Next step", runFollowUpFollowUp);
  }

  return items;
}

export function buildSensitiveAccessBulkRunSampleCards(
  result: SensitiveAccessBulkActionResult,
  { resolveWorkflowDetailHref = null }: BuildSensitiveAccessBulkRunSampleCardsOptions = {}
): SensitiveAccessBulkRunSampleCard[] {
  return buildOperatorRunSampleCards(result.sampledRuns ?? [], {
    resolveWorkflowDetailHref
  });
}

export function buildSensitiveAccessBulkWorkflowGovernanceSummary(
  result: SensitiveAccessBulkActionResult,
  options: BuildSensitiveAccessBulkWorkflowGovernanceSummaryOptions = {}
): SensitiveAccessBulkWorkflowGovernanceSummary | null {
  const { resolveWorkflowDetailHref = null } = options;
  const sampledRunCards =
    options.sampledRunCards ?? buildSensitiveAccessBulkRunSampleCards(result, options);
  const sampledRunCount = sampledRunCards.length;
  const catalogGapCount = sampledRunCards.filter((card) => card.workflowCatalogGapSummary).length;
  const legacyAuthCount = sampledRunCards.filter((card) => card.legacyAuthHandoff).length;
  const sharedCatalogGap = resolveSharedWorkflowGovernanceCard(sampledRunCards, (card) =>
    card.workflowCatalogGapSummary
      ? `${card.workflowCatalogGapHref ?? card.workflowGovernanceHref ?? ""}::${card.workflowCatalogGapSummary}`
      : null
  );
  const sharedSampleLegacyAuth = resolveSharedWorkflowGovernanceCard(sampledRunCards, (card) =>
    card.legacyAuthHandoff
      ? [
          card.workflowGovernanceHref ?? "",
          card.legacyAuthHandoff.bindingChipLabel,
          card.legacyAuthHandoff.statusChipLabel,
          card.legacyAuthHandoff.detail
        ].join("::")
      : null
  );
  const bulkLegacyWorkflowId = normalizeText(result.legacyAuthGovernance?.workflows[0]?.workflow_id);
  const bulkLegacyGovernance = result.legacyAuthGovernance
    ? buildWorkflowGovernanceHandoff({
        workflowId: bulkLegacyWorkflowId,
        workflowDetailHref: bulkLegacyWorkflowId
          ? resolveWorkflowDetailHref?.(bulkLegacyWorkflowId) ?? null
          : null,
        legacyAuthGovernance: result.legacyAuthGovernance
      })
    : null;
  const sharedWorkflowCatalogGapSummary =
    sampledRunCount > 1 && sharedCatalogGap?.appliesToAll
      ? sharedCatalogGap.card.workflowCatalogGapSummary ?? null
      : null;
  const sharedWorkflowCatalogGapDetail =
    sharedWorkflowCatalogGapSummary && sharedCatalogGap
      ? buildBulkWorkflowCatalogGapDetail(sharedCatalogGap.count)
      : null;
  const sharedWorkflowCatalogGapHref =
    sampledRunCount > 1 && sharedCatalogGap?.appliesToAll
      ? sharedCatalogGap.card.workflowCatalogGapHref ?? null
      : null;
  const sharedWorkflowGovernanceHref =
    sampledRunCount > 1 && sharedCatalogGap?.appliesToAll
      ? sharedCatalogGap.card.workflowGovernanceHref ?? null
      : null;
  const sharedLegacyAuthHandoff = bulkLegacyGovernance?.legacyAuthHandoff
    ? bulkLegacyGovernance.legacyAuthHandoff
    : sampledRunCount > 1 && sharedSampleLegacyAuth?.appliesToAll
      ? sharedSampleLegacyAuth.card.legacyAuthHandoff ?? null
      : null;
  const sharedLegacyWorkflowHref = bulkLegacyGovernance?.workflowGovernanceHref
    ? bulkLegacyGovernance.workflowGovernanceHref
    : sampledRunCount > 1 && sharedSampleLegacyAuth?.appliesToAll
      ? sharedSampleLegacyAuth.card.workflowGovernanceHref ?? null
      : null;
  const workflowGovernanceHref =
    sharedWorkflowGovernanceHref ??
    (sharedLegacyAuthHandoff ? sharedLegacyWorkflowHref : null) ??
    null;

  const narrativeText = buildBulkWorkflowGovernanceNarrative({
    sampledRunCount,
    catalogGapCount,
    legacyAuthCount,
    sharedCatalogGapSummary: sharedCatalogGap?.card.workflowCatalogGapSummary ?? null,
    sharedCatalogGapAppliesToAll: Boolean(sharedWorkflowCatalogGapSummary),
    bulkLegacyAuthHandoff: bulkLegacyGovernance?.legacyAuthHandoff ?? null,
    sharedLegacyAuthAppliesToAll:
      !bulkLegacyGovernance?.legacyAuthHandoff && sampledRunCount > 1
        ? sharedSampleLegacyAuth?.appliesToAll ?? false
        : false
  });

  if (
    !narrativeText &&
    !sharedWorkflowCatalogGapSummary &&
    !sharedLegacyAuthHandoff &&
    !workflowGovernanceHref
  ) {
    return null;
  }

  return {
    narrativeText,
    workflowCatalogGapSummary: sharedWorkflowCatalogGapSummary,
    workflowCatalogGapDetail: sharedWorkflowCatalogGapDetail,
    workflowCatalogGapHref: sharedWorkflowCatalogGapHref,
    workflowGovernanceHref,
    legacyAuthHandoff: sharedLegacyAuthHandoff
  };
}

function normalizeExplanationText(
  explanation: SignalFollowUpExplanation | null | undefined,
  key: keyof SignalFollowUpExplanation
) {
  const value = explanation?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

function buildBulkWorkflowGovernanceNarrative({
  sampledRunCount,
  catalogGapCount,
  legacyAuthCount,
  sharedCatalogGapSummary,
  sharedCatalogGapAppliesToAll,
  bulkLegacyAuthHandoff,
  sharedLegacyAuthAppliesToAll
}: {
  sampledRunCount: number;
  catalogGapCount: number;
  legacyAuthCount: number;
  sharedCatalogGapSummary: string | null;
  sharedCatalogGapAppliesToAll: boolean;
  bulkLegacyAuthHandoff: LegacyPublishAuthWorkflowHandoff | null;
  sharedLegacyAuthAppliesToAll: boolean;
}) {
  if (sampledRunCount <= 1) {
    return null;
  }

  const segments: string[] = [];

  if (catalogGapCount > 0) {
    if (sharedCatalogGapSummary) {
      segments.push(
        sharedCatalogGapAppliesToAll
          ? `workflow catalog gap 已收口到共享 handoff（${sharedCatalogGapSummary}）`
          : `workflow catalog gap 已在 ${catalogGapCount} / ${sampledRunCount} 个样本中暴露（${sharedCatalogGapSummary}）`
      );
    } else {
      segments.push(`workflow catalog gap 已在 ${catalogGapCount} / ${sampledRunCount} 个样本中暴露`);
    }
  }

  if (bulkLegacyAuthHandoff) {
    segments.push("legacy publish auth handoff 已在 bulk 回执保留");
  } else if (legacyAuthCount > 0) {
    segments.push(
      sharedLegacyAuthAppliesToAll
        ? "legacy publish auth handoff 已收口到共享 workflow follow-up"
        : `legacy publish auth handoff 已在 ${legacyAuthCount} / ${sampledRunCount} 个样本中暴露`
    );
  }

  if (segments.length === 0) {
    return null;
  }

  return `已回读 ${sampledRunCount} 个 sampled run；${segments.join("；")}。${
    sharedCatalogGapAppliesToAll ? " bulk 回执顶部已给出直接回到 workflow 编辑器的入口。" : ""
  }`;
}

function buildBulkWorkflowCatalogGapDetail(sampledRunCount: number) {
  if (sampledRunCount <= 1) {
    return "当前回读的 sampled run 仍指向同一条 workflow catalog gap；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 bulk 回执与 callback 事实。";
  }

  return `bulk 回执当前回读的 ${sampledRunCount} 个 sampled run 都指向同一条 workflow catalog gap；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 bulk 回执与 callback 事实。`;
}

function resolveSharedWorkflowGovernanceCard(
  sampledRunCards: SensitiveAccessBulkRunSampleCard[],
  getFingerprint: (card: SensitiveAccessBulkRunSampleCard) => string | null
) {
  const cardsWithGovernance = sampledRunCards.filter((card) => getFingerprint(card));

  if (cardsWithGovernance.length === 0) {
    return null;
  }

  const firstFingerprint = getFingerprint(cardsWithGovernance[0]);
  if (!firstFingerprint) {
    return null;
  }

  if (cardsWithGovernance.some((card) => getFingerprint(card) !== firstFingerprint)) {
    return null;
  }

  return {
    card: cardsWithGovernance[0],
    count: cardsWithGovernance.length,
    appliesToAll: cardsWithGovernance.length === sampledRunCards.length
  };
}
