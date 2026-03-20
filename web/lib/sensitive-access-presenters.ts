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

export type SensitiveAccessTimelineSurface =
  | "execution_node"
  | "publish_invocation"
  | "publish_blocking_invocation";

export type SensitiveAccessTimelineSurfaceCopy = {
  title: string;
  description: string;
  emptyState: string;
  inboxLinkLabel: string;
};

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

function trimTrailingSentencePunctuation(value: string) {
  return value.replace(/[。．.!！？?]+$/u, "");
}

function resolveSensitiveAccessBlockedPrimarySignal({
  outcomeExplanation,
  runSnapshot,
  runFollowUpExplanation
}: {
  outcomeExplanation?: SignalFollowUpExplanation | null;
  runSnapshot?: OperatorRunSnapshotSummary | null;
  runFollowUpExplanation?: SignalFollowUpExplanation | null;
}) {
  return (
    normalizeCopy(runFollowUpExplanation?.primary_signal) ??
    normalizeCopy(runSnapshot?.callbackWaitingExplanation?.primary_signal) ??
    normalizeCopy(runSnapshot?.executionFocusExplanation?.primary_signal) ??
    normalizeCopy(outcomeExplanation?.primary_signal)
  );
}

function buildSensitiveAccessBlockedSurfaceTitle({
  surfaceLabel,
  payload
}: {
  surfaceLabel: string;
  payload: SensitiveAccessBlockingPayload;
}) {
  const approvalStatus = payload.approval_ticket?.status ?? null;

  if (approvalStatus === "rejected") {
    return `${surfaceLabel} rejected by approval review`;
  }

  if (approvalStatus === "expired") {
    return `${surfaceLabel} approval expired`;
  }

  if (
    approvalStatus === "pending" ||
    payload.approval_ticket?.waiting_status === "waiting" ||
    payload.access_request.decision === "require_approval"
  ) {
    return `${surfaceLabel} waiting on approval`;
  }

  if (payload.notifications.some((item) => item.status === "failed")) {
    return `${surfaceLabel} blocked by notification delivery`;
  }

  if (payload.notifications.some((item) => item.status === "pending")) {
    return `${surfaceLabel} waiting on notification delivery`;
  }

  if (payload.access_request.decision === "deny") {
    return `${surfaceLabel} blocked by sensitive access policy`;
  }

  return `${surfaceLabel} blocked by sensitive access control`;
}

export function buildSensitiveAccessTimelineSurfaceCopy({
  surface,
  blockingNodeRunId
}: {
  surface: SensitiveAccessTimelineSurface;
  blockingNodeRunId?: string | null;
}): SensitiveAccessTimelineSurfaceCopy {
  if (surface === "publish_blocking_invocation") {
    return {
      title: "Blocking approval timeline",
      description:
        `Focus the approval history for the waiting node run first so operator triage can stay on the blocker instead of scanning the entire run timeline.${blockingNodeRunId?.trim() ? ` Current blocking node run: ${blockingNodeRunId.trim()}.` : ""}`,
      emptyState: "当前阻塞节点没有关联 sensitive access timeline。",
      inboxLinkLabel: "open blocker inbox slice"
    };
  }

  if (surface === "publish_invocation") {
    return {
      title: "Approval timeline",
      description:
        "Sensitive access decisions, approval tickets and notification delivery are grouped here so published-surface debugging no longer has to jump back to the inbox.",
      emptyState: "当前这次 invocation 没有关联 sensitive access timeline。",
      inboxLinkLabel: "open approval inbox slice"
    };
  }

  return {
    title: "Sensitive access timeline",
    description:
      "Approval tickets, notification delivery and policy decisions stay grouped here so operator triage can continue without leaving the execution node.",
    emptyState: "当前这个 execution node 没有关联 sensitive access timeline。",
    inboxLinkLabel: "open inbox slice"
  };
}

export function buildSensitiveAccessBlockedSurfaceCopy({
  surfaceLabel,
  payload,
  title,
  summary,
  guardedActionLabel
}: {
  surfaceLabel: string;
  payload: SensitiveAccessBlockingPayload;
  title?: string | null;
  summary?: string | null;
  guardedActionLabel?: string | null;
}) {
  const primarySignal = resolveSensitiveAccessBlockedPrimarySignal({
    outcomeExplanation: payload.outcome_explanation ?? null,
    runSnapshot: payload.run_snapshot ?? null,
    runFollowUpExplanation: payload.run_follow_up?.explanation ?? null
  });
  const reasonLabel = formatSensitiveAccessReasonLabel(payload.access_request);
  const policySummary = getSensitiveAccessBlockedPolicySummary(payload);
  const decisionLabel = formatSensitiveAccessDecisionLabel(payload.access_request);
  const normalizedTitle = normalizeCopy(title);
  const normalizedSummary = normalizeCopy(summary);
  const normalizedActionLabel = normalizeCopy(guardedActionLabel) ?? "导出动作";
  const evidenceSentence = primarySignal
    ? `当前信号：${trimTrailingSentencePunctuation(primarySignal)}`
    : policySummary
      ? `当前策略：${trimTrailingSentencePunctuation(policySummary)}`
      : reasonLabel
        ? `当前原因：${trimTrailingSentencePunctuation(reasonLabel)}`
        : `当前决策：${trimTrailingSentencePunctuation(decisionLabel)}`;

  return {
    title:
      normalizedTitle ??
      buildSensitiveAccessBlockedSurfaceTitle({
        surfaceLabel,
        payload
      }),
    summary:
      normalizedSummary ??
      `当前 ${surfaceLabel} 已接入统一敏感访问控制；${normalizedActionLabel}不会绕过审批、通知与 run follow-up 事实链。${evidenceSentence}。`
  };
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
