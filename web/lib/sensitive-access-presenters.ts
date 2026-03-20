import type {
  SensitiveAccessBlockingPayload,
  SensitiveAccessBlockingRequest
} from "@/lib/sensitive-access";
import type {
  OperatorRunSnapshotSummary,
  SensitiveAccessRequestItem,
  SignalFollowUpExplanation
} from "@/lib/get-sensitive-access";
import {
  buildOperatorRecommendedNextStep,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";

const DECISION_LABELS: Record<string, string> = {
  allow: "allowed",
  allow_masked: "allowed with masking",
  deny: "denied",
  require_approval: "approval required"
};

const REASON_LABELS: Record<string, string> = {
  allow_low_sensitivity: "low-sensitivity access allowed",
  allow_standard_low_risk: "low-risk access allowed",
  allow_human_moderate_runtime_use: "human moderate-sensitivity runtime access allowed",
  masked_moderate_runtime_use: "moderate-sensitivity runtime access masked",
  approval_required_non_human_mutation: "non-human mutation requires approval",
  approval_required_moderate_sensitive_operation: "moderate-sensitivity operation requires approval",
  deny_non_human_high_sensitive_mutation: "non-human high-sensitivity mutation denied",
  approval_required_high_sensitive_access: "high-sensitivity access requires approval",
  approved_after_review: "approved after review",
  rejected_after_review: "rejected after review",
  access_denied: "access denied"
};

type RequestLike = Pick<
  SensitiveAccessRequestItem,
  "decision" | "decision_label" | "reason_code" | "reason_label" | "policy_summary"
>;

type BlockingRequestLike = Pick<
  SensitiveAccessBlockingRequest,
  "decision" | "decision_label" | "reason_code" | "reason_label" | "policy_summary"
>;

function formatFallbackLabel(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  return value
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeCopy(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function formatSensitiveAccessDecisionLabel(request: RequestLike | BlockingRequestLike): string {
  return (
    request.decision_label ??
    (request.decision ? DECISION_LABELS[request.decision] : null) ??
    formatFallbackLabel(request.decision) ??
    "pending"
  );
}

export function formatSensitiveAccessReasonLabel(request: RequestLike | BlockingRequestLike): string | null {
  return (
    request.reason_label ??
    (request.reason_code ? REASON_LABELS[request.reason_code] : null) ??
    formatFallbackLabel(request.reason_code)
  );
}

export function getSensitiveAccessPolicySummary(
  request: RequestLike | BlockingRequestLike
): string | null {
  return request.policy_summary ?? null;
}

export function getSensitiveAccessBlockedPolicySummary(
  payload: SensitiveAccessBlockingPayload
): string | null {
  return getSensitiveAccessPolicySummary(payload.access_request);
}

export function getSensitiveAccessCanonicalOutcomeExplanation({
  outcomeExplanation,
  runSnapshot,
  runFollowUpExplanation
}: {
  outcomeExplanation?: SignalFollowUpExplanation | null;
  runSnapshot?: OperatorRunSnapshotSummary | null;
  runFollowUpExplanation?: SignalFollowUpExplanation | null;
}): SignalFollowUpExplanation | null {
  const outcomePrimarySignal = normalizeCopy(outcomeExplanation?.primary_signal);
  const outcomeFollowUp = normalizeCopy(outcomeExplanation?.follow_up);

  if (!outcomePrimarySignal && !outcomeFollowUp) {
    return null;
  }

  const hasCanonicalPrimarySignal = Boolean(
    runSnapshot || normalizeCopy(runFollowUpExplanation?.primary_signal)
  );
  const hasCanonicalFollowUp = Boolean(
    normalizeCopy(runFollowUpExplanation?.follow_up) ||
      normalizeCopy(runSnapshot?.callbackWaitingExplanation?.follow_up) ||
      normalizeCopy(runSnapshot?.executionFocusExplanation?.follow_up)
  );

  const primarySignal = hasCanonicalPrimarySignal ? null : outcomePrimarySignal;
  const followUp = hasCanonicalFollowUp ? null : outcomeFollowUp;

  if (!primarySignal && !followUp) {
    return null;
  }

  return {
    primary_signal: primarySignal,
    follow_up: followUp
  };
}

export const getSensitiveAccessTimelineCanonicalOutcomeExplanation =
  getSensitiveAccessCanonicalOutcomeExplanation;

export function buildSensitiveAccessBlockedRecommendedNextStep({
  inboxHref,
  runId,
  outcomeExplanation,
  runSnapshot,
  runFollowUpExplanation
}: {
  inboxHref?: string | null;
  runId?: string | null;
  outcomeExplanation?: SignalFollowUpExplanation | null;
  runSnapshot?: OperatorRunSnapshotSummary | null;
  runFollowUpExplanation?: SignalFollowUpExplanation | null;
}): OperatorRecommendedNextStep | null {
  const blockerFollowUp =
    normalizeCopy(outcomeExplanation?.follow_up) ??
    normalizeCopy(runSnapshot?.callbackWaitingExplanation?.follow_up) ??
    normalizeCopy(runSnapshot?.executionFocusExplanation?.follow_up) ??
    normalizeCopy(runFollowUpExplanation?.follow_up);

  const executionFollowUp =
    normalizeCopy(runFollowUpExplanation?.follow_up) ??
    normalizeCopy(runSnapshot?.executionFocusExplanation?.follow_up) ??
    normalizeCopy(runSnapshot?.callbackWaitingExplanation?.follow_up);

  return buildOperatorRecommendedNextStep({
    callback: {
      active: Boolean(inboxHref || blockerFollowUp),
      label: "approval blocker",
      detail: blockerFollowUp,
      href: inboxHref?.trim() || null,
      href_label: inboxHref?.trim() ? "open inbox slice" : null,
      fallback_detail:
        "当前敏感访问仍被 approval blocker 拦住；优先处理审批票据、通知与 waiting 恢复，再继续查看 run detail 或原入口。"
    },
    execution: {
      active: Boolean(runId || executionFollowUp),
      label: "run detail",
      detail: executionFollowUp,
      href: runId?.trim() ? `/runs/${encodeURIComponent(runId.trim())}` : null,
      href_label: runId?.trim() ? "open run" : null,
      fallback_detail:
        "当前阻断结果已经回接 canonical run snapshot；如果审批已处理，优先打开 run detail 确认 waiting 与 focus node 是否恢复。"
    },
    operatorFollowUp: blockerFollowUp,
    operatorLabel: "approval follow-up"
  });
}
