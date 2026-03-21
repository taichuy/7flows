import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem
} from "@/lib/get-run-views";
import type {
  CallbackWaitingAutomationCheck,
  CallbackWaitingAutomationStepCheck
} from "@/lib/get-system-overview";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRecommendedNextStep,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  formatSensitiveAccessDecisionLabel,
  formatSensitiveAccessReasonLabel,
  getSensitiveAccessPolicySummary
} from "@/lib/sensitive-access-presenters";

function getEpoch(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getLatestNotificationTimestamp(entry: SensitiveAccessTimelineEntry): number {
  return entry.notifications.reduce((latest, notification) => {
    return Math.max(latest, getEpoch(notification.created_at));
  }, 0);
}

function getEntrySortTimestamp(entry: SensitiveAccessTimelineEntry): number {
  return Math.max(
    getLatestNotificationTimestamp(entry),
    getEpoch(entry.approval_ticket?.created_at),
    getEpoch(entry.request.created_at)
  );
}

type CallbackWaitingExplanationInput = {
  lifecycle?: CallbackWaitingLifecycleSummary | null;
  callbackTickets?: RunCallbackTicketItem[];
  sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  scheduledResumeScheduledAt?: string | null;
  scheduledResumeDueAt?: string | null;
  scheduledResumeRequeuedAt?: string | null;
  scheduledResumeRequeueSource?: string | null;
};

const AUTOMATION_STATUS_LABELS: Record<string, string> = {
  configured: "configured",
  partial: "partial",
  disabled: "disabled",
  unknown: "unknown"
};

const SCHEDULER_HEALTH_LABELS: Record<string, string> = {
  healthy: "healthy",
  degraded: "degraded",
  offline: "offline",
  disabled: "disabled",
  unknown: "unknown"
};

function hasScheduledResumeDelay(
  scheduledResumeDelaySeconds?: number | null
): scheduledResumeDelaySeconds is number {
  return (
    typeof scheduledResumeDelaySeconds === "number" &&
    Number.isFinite(scheduledResumeDelaySeconds)
  );
}

function hasScheduledResumeRequeue(
  scheduledResumeRequeuedAt?: string | null,
  scheduledResumeRequeueSource?: string | null
) {
  return Boolean(scheduledResumeRequeuedAt || scheduledResumeRequeueSource);
}

export type CallbackWaitingDetailRow = {
  label: string;
  value: string;
};

type CallbackTicketDetailRowMode = "compact" | "detail";

export type CallbackWaitingOperatorStatus = {
  kind:
    | "approval_pending"
    | "external_callback_pending"
    | "scheduled_resume_pending"
    | "late_callback_recorded"
    | "terminated";
  label: string;
  detail: string;
};

export type CallbackWaitingRecommendedAction = {
  kind:
    | "open_inbox"
    | "resolve_inline_sensitive_access"
    | "inspect_termination"
    | "cleanup_expired_tickets"
    | "monitor_callback"
    | "manual_resume"
    | "watch_scheduled_resume";
  label: string;
  detail: string;
  ctaLabel?: string;
};

export type CallbackWaitingInlineActionPreference = "resume" | "cleanup" | null;

export type CallbackWaitingSummarySurfaceCopy = {
  recommendedNextStepTitle: string;
  defaultInboxLinkLabel: string;
  defaultInlineActionTitle: string;
  optionalInlineActionTitle: string;
  monitorCallbackStatusHint: string;
  watchScheduledResumeStatusHint: string;
  preferredResumeStatusHint: string;
  preferredCleanupStatusHint: string;
  manualResumeActionLabel: string;
  cleanupActionLabel: string;
  manualResumeResultTitle: string;
  cleanupResultTitle: string;
  manualOverrideOptionalLabel: string;
  optionalOverrideDescription: string;
  waitingNodeFocusEvidenceTitle: string;
  focusedSkillTraceTitle: string;
  executionFocusSkillTraceDescription: string;
  runFallbackSkillTraceDescription: string;
  inlineLoadsSkillTraceDescription: string;
  injectedReferencesTitle: string;
  injectedReferencesDescription: string;
  terminatedLabel: string;
};

const CALLBACK_WAITING_RECOMMENDED_ACTIONS_WITH_INBOX_CTA = new Set<
  CallbackWaitingRecommendedAction["kind"]
>(["open_inbox", "inspect_termination", "monitor_callback", "watch_scheduled_resume"]);

export function buildCallbackWaitingSummarySurfaceCopy(): CallbackWaitingSummarySurfaceCopy {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  return {
    recommendedNextStepTitle: operatorSurfaceCopy.recommendedNextStepTitle,
    defaultInboxLinkLabel: operatorSurfaceCopy.openInboxSliceLabel,
    defaultInlineActionTitle: "Callback actions",
    optionalInlineActionTitle: "Optional callback override",
    monitorCallbackStatusHint:
      "建议先观察 callback ticket 与外部系统；若确认回调已到达但 run 仍未推进，再尝试手动恢复。",
    watchScheduledResumeStatusHint:
      "系统已安排定时恢复；仅在需要绕过当前 backoff 时，再手动恢复或清理过期 ticket。",
    preferredResumeStatusHint: "建议先手动恢复；若仍卡住，再处理过期 ticket。",
    preferredCleanupStatusHint: "建议先清理当前 slice 内的过期 ticket，再安排恢复。",
    manualResumeActionLabel: "立即尝试恢复",
    cleanupActionLabel: "处理过期 ticket 并尝试恢复",
    manualResumeResultTitle: "恢复结果",
    cleanupResultTitle: "Cleanup 结果",
    manualOverrideOptionalLabel: "manual override optional",
    optionalOverrideDescription:
      "Callback actions stay available below as optional operator overrides when the current waiting path needs to be bypassed.",
    waitingNodeFocusEvidenceTitle: "Waiting node focus evidence",
    focusedSkillTraceTitle: operatorSurfaceCopy.focusedSkillTraceTitle,
    executionFocusSkillTraceDescription:
      "当前 callback waiting follow-up 已直接消费 execution focus 节点的 skill trace，便于把等待原因与 agent 实际注入来源放到同一条排障链。",
    runFallbackSkillTraceDescription:
      "当前 waiting 节点没有独立 skill trace，因此这里回退展示整个 run 的注入摘要。",
    inlineLoadsSkillTraceDescription:
      "当前 waiting 节点已经记录了 skill reference loads，因此可以直接在 callback follow-up 中查看该节点的注入来源。",
    injectedReferencesTitle: operatorSurfaceCopy.injectedReferencesTitle,
    injectedReferencesDescription:
      "当前 callback waiting、operator inbox 和 publish detail 现在围绕同一份 skill trace / load 事实解释 agent 注入来源。",
    terminatedLabel: "callback waiting terminated"
  };
}

export function isObserveFirstCallbackWaitingAction(
  actionKind?: CallbackWaitingRecommendedAction["kind"] | null
) {
  return actionKind === "monitor_callback" || actionKind === "watch_scheduled_resume";
}

export function buildCallbackWaitingInlineActionTitle({
  actionKind,
  surfaceCopy = buildCallbackWaitingSummarySurfaceCopy()
}: {
  actionKind?: CallbackWaitingRecommendedAction["kind"] | null;
  surfaceCopy?: CallbackWaitingSummarySurfaceCopy;
}) {
  return isObserveFirstCallbackWaitingAction(actionKind)
    ? surfaceCopy.optionalInlineActionTitle
    : surfaceCopy.defaultInlineActionTitle;
}

export function buildCallbackWaitingInlineActionStatusHint({
  actionKind,
  preferredAction,
  surfaceCopy = buildCallbackWaitingSummarySurfaceCopy()
}: {
  actionKind?: CallbackWaitingRecommendedAction["kind"] | null;
  preferredAction?: CallbackWaitingInlineActionPreference;
  surfaceCopy?: CallbackWaitingSummarySurfaceCopy;
}) {
  if (actionKind === "monitor_callback") {
    return surfaceCopy.monitorCallbackStatusHint;
  }

  if (actionKind === "watch_scheduled_resume") {
    return surfaceCopy.watchScheduledResumeStatusHint;
  }

  if (preferredAction === "resume") {
    return surfaceCopy.preferredResumeStatusHint;
  }

  if (preferredAction === "cleanup") {
    return surfaceCopy.preferredCleanupStatusHint;
  }

  return null;
}

export function buildCallbackWaitingRecommendedNextStep({
  action,
  inboxHref,
  operatorFollowUp,
  surfaceCopy = buildCallbackWaitingSummarySurfaceCopy()
}: {
  action?: CallbackWaitingRecommendedAction | null;
  inboxHref?: string | null;
  operatorFollowUp?: string | null;
  surfaceCopy?: CallbackWaitingSummarySurfaceCopy;
}): OperatorRecommendedNextStep | null {
  if (!action) {
    return buildOperatorRecommendedNextStep({
      operatorFollowUp,
      operatorLabel: "callback waiting follow-up"
    });
  }

  const href = CALLBACK_WAITING_RECOMMENDED_ACTIONS_WITH_INBOX_CTA.has(action.kind)
    ? inboxHref?.trim() || null
    : null;

  return buildOperatorRecommendedNextStep({
    callback: {
      active: true,
      label: action.label,
      detail: null,
      href,
      href_label: href ? action.ctaLabel?.trim() || surfaceCopy.defaultInboxLinkLabel : null,
      fallback_detail: action.detail
    },
    operatorFollowUp,
    operatorLabel: "callback waiting follow-up"
  });
}

export type CallbackWaitingAutomationHealthSnapshot = {
  summary: string;
  overallStatus?: string | null;
  schedulerHealthStatus?: string | null;
  relevantStepKey?: string | null;
  relevantStepLabel?: string | null;
  relevantStepHealthStatus?: string | null;
};

type ScheduledResumeTimingState = {
  scheduledAtLabel: string | null;
  dueAtLabel: string | null;
  isOverdue: boolean;
};

function countPendingApprovals(entries: SensitiveAccessTimelineEntry[]): number {
  return entries.filter((entry) => entry.approval_ticket?.status === "pending").length;
}

function countFailedNotifications(entries: SensitiveAccessTimelineEntry[]): number {
  return entries.reduce((count, entry) => {
    return (
      count + entry.notifications.filter((notification) => notification.status === "failed").length
    );
  }, 0);
}

function hasRetriableNotification(entry: SensitiveAccessTimelineEntry): boolean {
  return entry.notifications.some((notification) => notification.status !== "delivered");
}

function hasPendingWaitingApproval(entry: SensitiveAccessTimelineEntry): boolean {
  return (
    entry.approval_ticket?.status === "pending" && entry.approval_ticket?.waiting_status === "waiting"
  );
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatOptionalParts(parts: Array<string | null | undefined>): string | null {
  const normalized = parts
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  return normalized.length ? normalized.join(" · ") : null;
}

function formatAutomationStatusLabel(status?: string | null) {
  const normalized = status?.trim();
  if (!normalized) {
    return null;
  }
  return AUTOMATION_STATUS_LABELS[normalized] ?? normalized;
}

function formatSchedulerHealthLabel(status?: string | null) {
  const normalized = status?.trim();
  if (!normalized) {
    return null;
  }
  return SCHEDULER_HEALTH_LABELS[normalized] ?? normalized;
}

function pickRelevantAutomationStep({
  lifecycle,
  callbackWaitingAutomation,
  scheduledResumeDelaySeconds,
  scheduledResumeDueAt,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: CallbackWaitingExplanationInput): CallbackWaitingAutomationStepCheck | null {
  if (!callbackWaitingAutomation?.steps?.length) {
    return null;
  }

  if (
    hasScheduledResumeDelay(scheduledResumeDelaySeconds) ||
    scheduledResumeDueAt ||
    hasScheduledResumeRequeue(scheduledResumeRequeuedAt, scheduledResumeRequeueSource)
  ) {
    return (
      callbackWaitingAutomation.steps.find((step) => step.key === "waiting_resume_monitor") ?? null
    );
  }

  if ((lifecycle?.expired_ticket_count ?? 0) > 0) {
    return (
      callbackWaitingAutomation.steps.find((step) => step.key === "callback_ticket_cleanup") ?? null
    );
  }

  return null;
}

function formatAutomationStepSummary(step: CallbackWaitingAutomationStepCheck) {
  const latestActivityAt =
    step.scheduler_health.last_finished_at ?? step.scheduler_health.last_started_at ?? null;
  const latestActivityLabel = step.scheduler_health.last_finished_at
    ? "last finished"
    : step.scheduler_health.last_started_at
      ? "last started"
      : null;

  return formatOptionalParts([
    `${step.label}: ${formatSchedulerHealthLabel(step.scheduler_health.health_status) ?? step.scheduler_health.health_status}`,
    step.scheduler_health.detail || step.detail,
    latestActivityAt && latestActivityLabel
      ? `${latestActivityLabel} ${formatTimestamp(latestActivityAt)}`
      : null,
    step.scheduler_health.last_status ? `latest status ${step.scheduler_health.last_status}` : null,
    step.scheduler_health.last_status || step.scheduler_health.matched_count > 0 || step.scheduler_health.affected_count > 0
      ? `matched ${step.scheduler_health.matched_count} · affected ${step.scheduler_health.affected_count}`
      : null
  ]);
}

function formatCallbackWaitingAutomationSummary(
  input: CallbackWaitingExplanationInput
): string | null {
  const automation = input.callbackWaitingAutomation;
  if (!automation) {
    return null;
  }

  const relevantStep = pickRelevantAutomationStep(input);
  const relevantSummary = relevantStep ? formatAutomationStepSummary(relevantStep) : null;
  const overallSummary = formatOptionalParts([
    relevantSummary ? null : `automation ${formatAutomationStatusLabel(automation.status) ?? automation.status}`,
    relevantSummary ? null : `scheduler ${formatSchedulerHealthLabel(automation.scheduler_health_status) ?? automation.scheduler_health_status}`,
    !relevantSummary ? automation.scheduler_health_detail || automation.detail : null
  ]);

  if (!relevantSummary) {
    return overallSummary;
  }

  if (automation.status === "configured" && automation.scheduler_health_status === "healthy") {
    return relevantSummary;
  }

  return formatOptionalParts([
    relevantSummary,
    `overall ${formatAutomationStatusLabel(automation.status) ?? automation.status}`,
    automation.scheduler_health_detail || automation.detail
  ]);
}

export function getCallbackWaitingAutomationHealthSnapshot(
  input: CallbackWaitingExplanationInput
): CallbackWaitingAutomationHealthSnapshot | null {
  const automation = input.callbackWaitingAutomation;
  if (!automation) {
    return null;
  }

  const summary = formatCallbackWaitingAutomationSummary(input);
  if (!summary) {
    return null;
  }

  const relevantStep = pickRelevantAutomationStep(input);
  return {
    summary,
    overallStatus: automation.status,
    schedulerHealthStatus: automation.scheduler_health_status,
    relevantStepKey: relevantStep?.key ?? null,
    relevantStepLabel: relevantStep?.label ?? null,
    relevantStepHealthStatus: relevantStep?.scheduler_health.health_status ?? null
  };
}

function shouldSurfaceAutomationHealth(input: CallbackWaitingExplanationInput) {
  return Boolean(
    input.callbackWaitingAutomation &&
      (hasScheduledResumeDelay(input.scheduledResumeDelaySeconds) ||
        input.scheduledResumeDueAt ||
        hasScheduledResumeRequeue(
          input.scheduledResumeRequeuedAt,
          input.scheduledResumeRequeueSource
        ) ||
        (input.lifecycle?.expired_ticket_count ?? 0) > 0)
  );
}

function formatScheduledResumeRequeueLabel({
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: Pick<
  CallbackWaitingExplanationInput,
  "scheduledResumeRequeuedAt" | "scheduledResumeRequeueSource"
>) {
  if (!hasScheduledResumeRequeue(scheduledResumeRequeuedAt, scheduledResumeRequeueSource)) {
    return null;
  }

  return formatOptionalParts([
    scheduledResumeRequeueSource ? `requeued by ${scheduledResumeRequeueSource}` : "requeued",
    formatOptionalTimestamp(scheduledResumeRequeuedAt)
  ]);
}

function buildDetailRows(
  rows: Array<{ label: string; value: string | null | undefined }>
): CallbackWaitingDetailRow[] {
  return rows.flatMap((row) => {
    const value = row.value?.trim();
    if (!value) {
      return [];
    }
    return [{ label: row.label, value }];
  });
}

export function formatScheduledResumeLabel({
  scheduledResumeDelaySeconds,
  scheduledResumeSource,
  scheduledWaitingStatus,
  scheduledResumeScheduledAt,
  scheduledResumeDueAt,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: Pick<
  CallbackWaitingExplanationInput,
  | "scheduledResumeDelaySeconds"
  | "scheduledResumeSource"
  | "scheduledWaitingStatus"
  | "scheduledResumeScheduledAt"
  | "scheduledResumeDueAt"
  | "scheduledResumeRequeuedAt"
  | "scheduledResumeRequeueSource"
>): string | null {
  const timingState = resolveScheduledResumeTiming({
    scheduledResumeDelaySeconds,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt
  });

  if (!hasScheduledResumeDelay(scheduledResumeDelaySeconds) && !timingState) {
    return null;
  }

  return formatOptionalParts([
    hasScheduledResumeDelay(scheduledResumeDelaySeconds)
      ? `scheduled resume ${scheduledResumeDelaySeconds}s`
      : "scheduled resume",
    scheduledResumeSource,
    scheduledWaitingStatus,
    timingState?.isOverdue ? "overdue" : null,
    timingState?.dueAtLabel ? `due ${timingState.dueAtLabel}` : null,
    formatScheduledResumeRequeueLabel({
      scheduledResumeRequeuedAt,
      scheduledResumeRequeueSource
    })
  ]);
}

export function formatScheduledResumeTimingLabel({
  scheduledResumeDelaySeconds,
  scheduledResumeScheduledAt,
  scheduledResumeDueAt
}: Pick<
  CallbackWaitingExplanationInput,
  "scheduledResumeDelaySeconds" | "scheduledResumeScheduledAt" | "scheduledResumeDueAt"
>): string | null {
  const timingState = resolveScheduledResumeTiming({
    scheduledResumeDelaySeconds,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt
  });
  if (!timingState) {
    return null;
  }

  return formatOptionalParts([
    timingState.scheduledAtLabel ? `scheduled ${timingState.scheduledAtLabel}` : null,
    timingState.dueAtLabel ? `due ${timingState.dueAtLabel}` : null,
    timingState.isOverdue ? "overdue" : null
  ]);
}

function resolveScheduledResumeTiming({
  scheduledResumeDelaySeconds,
  scheduledResumeScheduledAt,
  scheduledResumeDueAt
}: Pick<
  CallbackWaitingExplanationInput,
  "scheduledResumeDelaySeconds" | "scheduledResumeScheduledAt" | "scheduledResumeDueAt"
>): ScheduledResumeTimingState | null {
  if (
    !hasScheduledResumeDelay(scheduledResumeDelaySeconds) &&
    !scheduledResumeScheduledAt &&
    !scheduledResumeDueAt
  ) {
    return null;
  }

  const scheduledAtLabel = formatOptionalTimestamp(scheduledResumeScheduledAt);
  const dueAtLabel = formatOptionalTimestamp(scheduledResumeDueAt);
  const dueAtEpoch = getEpoch(scheduledResumeDueAt);

  return {
    scheduledAtLabel,
    dueAtLabel,
    isOverdue: dueAtEpoch > 0 && dueAtEpoch <= Date.now()
  };
}

export function formatCallbackLifecycleLabel(
  lifecycle?: CallbackWaitingLifecycleSummary | null
): string | null {
  if (!lifecycle) {
    return null;
  }

  const parts: string[] = [];
  if (lifecycle.wait_cycle_count > 0) {
    parts.push(`wait cycles ${lifecycle.wait_cycle_count}`);
  }
  if (lifecycle.expired_ticket_count > 0) {
    parts.push(`expired ${lifecycle.expired_ticket_count}`);
  }
  if (lifecycle.late_callback_count > 0) {
    parts.push(`late callbacks ${lifecycle.late_callback_count}`);
  }
  if (typeof lifecycle.last_resume_delay_seconds === "number") {
    parts.push(`resume ${lifecycle.last_resume_delay_seconds}s`);
  }
  if (lifecycle.last_resume_backoff_attempt > 0) {
    parts.push(`backoff #${lifecycle.last_resume_backoff_attempt}`);
  }
  if (lifecycle.max_expired_ticket_count > 0) {
    parts.push(`max expired ${lifecycle.max_expired_ticket_count}`);
  }
  if (lifecycle.last_ticket_status) {
    parts.push(`last ticket ${lifecycle.last_ticket_status}`);
  }
  if (lifecycle.terminated) {
    parts.push("terminated");
  }

  return parts.length ? parts.join(" · ") : "tracked";
}

export function formatCallbackTerminationLabel(
  lifecycle?: CallbackWaitingLifecycleSummary | null
): string | null {
  if (!lifecycle?.terminated) {
    return null;
  }

  return formatOptionalParts([
    "callback waiting terminated",
    lifecycle.termination_reason,
    lifecycle.terminated_at
  ]);
}

export function formatLatestCallbackTicketLabel(
  lifecycle?: CallbackWaitingLifecycleSummary | null
): string | null {
  if (!lifecycle) {
    return null;
  }

  return formatOptionalParts([
    lifecycle.last_ticket_status ? `latest ticket ${lifecycle.last_ticket_status}` : null,
    lifecycle.last_ticket_reason,
    lifecycle.last_ticket_updated_at
  ]);
}

export function formatLatestLateCallbackLabel(
  lifecycle?: CallbackWaitingLifecycleSummary | null
): string | null {
  if (!lifecycle?.last_late_callback_at) {
    return null;
  }

  return formatOptionalParts([
    lifecycle.last_late_callback_status ? `late callback ${lifecycle.last_late_callback_status}` : null,
    lifecycle.last_late_callback_reason,
    lifecycle.last_late_callback_at
  ]);
}

export function formatCallbackTicketStatusSummary(
  callbackTickets: RunCallbackTicketItem[] | undefined
): string | null {
  if (!callbackTickets?.length) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const ticket of callbackTickets) {
    counts.set(ticket.status, (counts.get(ticket.status) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status} ${count}`)
    .join(" · ");
}

export function formatApprovalSummary(
  entries: SensitiveAccessTimelineEntry[] | undefined
): string | null {
  if (!entries?.length) {
    return null;
  }

  const pendingCount = entries.filter((entry) => entry.approval_ticket?.status === "pending").length;
  const approvedCount = entries.filter((entry) => entry.approval_ticket?.status === "approved").length;
  const rejectedCount = entries.filter((entry) => entry.approval_ticket?.status === "rejected").length;
  const expiredCount = entries.filter((entry) => entry.approval_ticket?.status === "expired").length;

  if (pendingCount > 0) {
    return `${formatCountLabel(pendingCount, "approval")} still pending`;
  }
  if (rejectedCount > 0) {
    return `${formatCountLabel(rejectedCount, "approval")} rejected`;
  }
  if (expiredCount > 0) {
    return `${formatCountLabel(expiredCount, "approval")} expired`;
  }
  if (approvedCount > 0) {
    return `${formatCountLabel(approvedCount, "approval")} approved`;
  }

  return null;
}

export function pickCallbackWaitingInlineSensitiveAccessEntry(
  entries: SensitiveAccessTimelineEntry[] | undefined
): SensitiveAccessTimelineEntry | null {
  if (!entries?.length) {
    return null;
  }

  const candidates = entries.filter(
    (entry) => hasPendingWaitingApproval(entry) || hasRetriableNotification(entry)
  );

  if (!candidates.length) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const leftPending = hasPendingWaitingApproval(left) ? 1 : 0;
    const rightPending = hasPendingWaitingApproval(right) ? 1 : 0;
    if (leftPending !== rightPending) {
      return rightPending - leftPending;
    }

    const leftFailed = left.notifications.filter((item) => item.status === "failed").length;
    const rightFailed = right.notifications.filter((item) => item.status === "failed").length;
    if (leftFailed !== rightFailed) {
      return rightFailed - leftFailed;
    }

    const leftRetriable = hasRetriableNotification(left) ? 1 : 0;
    const rightRetriable = hasRetriableNotification(right) ? 1 : 0;
    if (leftRetriable !== rightRetriable) {
      return rightRetriable - leftRetriable;
    }

    return getEntrySortTimestamp(right) - getEntrySortTimestamp(left);
  })[0];
}

export function formatCallbackWaitingNotificationSummary(
  entry?: SensitiveAccessTimelineEntry | null
): string | null {
  if (!entry?.notifications.length) {
    return null;
  }

  const latest = [...entry.notifications].sort(
    (left, right) => getEpoch(right.created_at) - getEpoch(left.created_at)
  )[0];

  if (!latest) {
    return null;
  }

  return formatOptionalParts([
    `latest notify ${latest.channel} ${latest.status}`,
    latest.target,
    latest.error
  ]);
}

export function formatCallbackWaitingSensitiveAccessSummary(
  entry?: SensitiveAccessTimelineEntry | null
): string | null {
  if (!entry) {
    return null;
  }

  return formatOptionalParts([
    entry.resource.label,
    formatSensitiveAccessDecisionLabel(entry.request),
    formatSensitiveAccessReasonLabel(entry.request),
    getSensitiveAccessPolicySummary(entry.request)
  ]);
}

function formatOptionalTimestamp(value?: string | null): string | null {
  const formatted = formatTimestamp(value);
  return formatted.toLowerCase() === "n/a" ? null : formatted;
}

function formatCallbackTicketToolSummary(ticket: RunCallbackTicketItem): string {
  const toolLabel = ticket.tool_id ?? "n/a";
  return `${toolLabel} · call #${ticket.tool_call_index}`;
}

export function formatCallbackTicketLifecycleSummary(
  ticket: RunCallbackTicketItem,
  options?: {
    includeEmpty?: boolean;
  }
): string | null {
  const includeEmpty = options?.includeEmpty ?? false;
  const lifecycleParts = [
    formatOptionalTimestamp(ticket.created_at)
      ? `created ${formatOptionalTimestamp(ticket.created_at)}`
      : includeEmpty
        ? "created n/a"
        : null,
    formatOptionalTimestamp(ticket.expires_at)
      ? `expires ${formatOptionalTimestamp(ticket.expires_at)}`
      : includeEmpty
        ? "expires n/a"
        : null,
    formatOptionalTimestamp(ticket.consumed_at)
      ? `consumed ${formatOptionalTimestamp(ticket.consumed_at)}`
      : includeEmpty
        ? "consumed n/a"
        : null,
    formatOptionalTimestamp(ticket.canceled_at)
      ? `canceled ${formatOptionalTimestamp(ticket.canceled_at)}`
      : includeEmpty
        ? "canceled n/a"
        : null,
    formatOptionalTimestamp(ticket.expired_at)
      ? `expired ${formatOptionalTimestamp(ticket.expired_at)}`
      : includeEmpty
        ? "expired n/a"
        : null
  ];

  return formatOptionalParts(lifecycleParts);
}

export function listCallbackTicketDetailRows(
  ticket: RunCallbackTicketItem,
  options?: {
    mode?: CallbackTicketDetailRowMode;
    includeEmptyLifecycle?: boolean;
  }
): CallbackWaitingDetailRow[] {
  const mode = options?.mode ?? "detail";
  const lifecycleSummary = formatCallbackTicketLifecycleSummary(ticket, {
    includeEmpty: options?.includeEmptyLifecycle ?? mode === "detail"
  });

  if (mode === "compact") {
    return buildDetailRows([
      {
        label: "Waiting status",
        value: `${ticket.status} · ${ticket.waiting_status}`
      },
      {
        label: "Reason",
        value: ticket.reason
      },
      {
        label: "Lifecycle",
        value: lifecycleSummary
      }
    ]);
  }

  return buildDetailRows([
    {
      label: "Ticket",
      value: ticket.ticket
    },
    {
      label: "Node run",
      value: ticket.node_run_id
    },
    {
      label: "Tool",
      value: formatCallbackTicketToolSummary(ticket)
    },
    {
      label: "Waiting status",
      value: `${ticket.status} · ${ticket.waiting_status}`
    },
    {
      label: "Reason",
      value: ticket.reason ?? "n/a"
    },
    {
      label: "Created",
      value: formatOptionalTimestamp(ticket.created_at) ?? "n/a"
    },
    {
      label: "Expires",
      value: formatOptionalTimestamp(ticket.expires_at) ?? "n/a"
    },
    {
      label: "Consumed",
      value: formatOptionalTimestamp(ticket.consumed_at) ?? "n/a"
    },
    {
      label: "Canceled",
      value: formatOptionalTimestamp(ticket.canceled_at) ?? "n/a"
    },
    {
      label: "Expired",
      value: formatOptionalTimestamp(ticket.expired_at) ?? "n/a"
    }
  ]);
}

export function getCallbackWaitingHeadline({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  scheduledResumeDelaySeconds,
  scheduledResumeDueAt,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: CallbackWaitingExplanationInput): string | null {
  const pendingApprovalCount = countPendingApprovals(sensitiveAccessEntries);
  const pendingTicketCount = callbackTickets.filter((ticket) => ticket.status === "pending").length;
  const scheduledResumeTiming = resolveScheduledResumeTiming({
    scheduledResumeDelaySeconds,
    scheduledResumeDueAt
  });
  const scheduledResumeRequeueLabel = formatScheduledResumeRequeueLabel({
    scheduledResumeRequeuedAt,
    scheduledResumeRequeueSource
  });

  if (pendingApprovalCount > 0 && pendingTicketCount > 0) {
    return `${formatCountLabel(pendingApprovalCount, "approval")} and ${formatCountLabel(pendingTicketCount, "callback ticket")} are both blocking resume.`;
  }
  if (pendingApprovalCount > 0) {
    return `${formatCountLabel(pendingApprovalCount, "approval")} is still blocking resume.`;
  }
  if (lifecycle?.terminated) {
    return formatOptionalParts([
      "Callback waiting terminated",
      lifecycle.termination_reason
    ]);
  }
  if (pendingTicketCount > 0) {
    return `${formatCountLabel(pendingTicketCount, "callback ticket")} is still waiting for an external result.`;
  }
  if ((lifecycle?.late_callback_count ?? 0) > 0) {
    return `${formatCountLabel(lifecycle?.late_callback_count ?? 0, "late callback")} was recorded during resume handling.`;
  }
  if (scheduledResumeRequeueLabel) {
    return formatOptionalParts([
      "Scheduled resume was requeued",
      scheduledResumeRequeueLabel
    ]);
  }
  if (scheduledResumeTiming?.isOverdue) {
    return formatOptionalParts([
      "Scheduled resume is overdue",
      scheduledResumeTiming.dueAtLabel ? `due ${scheduledResumeTiming.dueAtLabel}` : null
    ]);
  }
  if (callbackTickets.length > 0 || lifecycle) {
    return "Callback waiting is tracked for this run.";
  }
  return null;
}

export function listCallbackWaitingOperatorStatuses({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  scheduledResumeDelaySeconds,
  scheduledResumeSource,
  scheduledWaitingStatus,
  scheduledResumeScheduledAt,
  scheduledResumeDueAt,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: CallbackWaitingExplanationInput): CallbackWaitingOperatorStatus[] {
  const statuses: CallbackWaitingOperatorStatus[] = [];
  const pendingApprovalCount = countPendingApprovals(sensitiveAccessEntries);
  const pendingTicketCount = callbackTickets.filter((ticket) => ticket.status === "pending").length;
  const lateCallbackCount = lifecycle?.late_callback_count ?? 0;
  const scheduledResumeTiming = resolveScheduledResumeTiming({
    scheduledResumeDelaySeconds,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt
  });
  const scheduledResumeRequeueLabel = formatScheduledResumeRequeueLabel({
    scheduledResumeRequeuedAt,
    scheduledResumeRequeueSource
  });

  if (pendingApprovalCount > 0) {
    statuses.push({
      kind: "approval_pending",
      label: "approval pending",
      detail: `${formatCountLabel(pendingApprovalCount, "approval")} still needs an operator decision before this run can resume.`
    });
  }

  if (pendingTicketCount > 0) {
    statuses.push({
      kind: "external_callback_pending",
      label: "waiting external callback",
      detail: `${formatCountLabel(pendingTicketCount, "callback ticket")} is still waiting for the upstream tool or external system to answer.`
    });
  }

  if (hasScheduledResumeDelay(scheduledResumeDelaySeconds) || scheduledResumeTiming) {
    statuses.push({
      kind: "scheduled_resume_pending",
      label: scheduledResumeRequeueLabel
        ? "scheduled resume requeued"
        : scheduledResumeTiming?.isOverdue
          ? "scheduled resume overdue"
          : "scheduled resume queued",
      detail:
        formatOptionalParts([
          scheduledResumeRequeueLabel
            ? "waiting resume monitor already requeued the stalled resume"
            : scheduledResumeTiming?.isOverdue
              ? "scheduled resume passed its due time"
              : hasScheduledResumeDelay(scheduledResumeDelaySeconds)
                ? `runtime will retry in ${scheduledResumeDelaySeconds}s`
                : "runtime already queued a scheduled resume",
          scheduledResumeSource,
          scheduledWaitingStatus,
          formatScheduledResumeTimingLabel({
            scheduledResumeDelaySeconds,
            scheduledResumeScheduledAt,
            scheduledResumeDueAt
          }),
          scheduledResumeRequeueLabel
        ]) ??
        (scheduledResumeRequeueLabel
          ? `waiting resume monitor already requeued the stalled resume · ${scheduledResumeRequeueLabel}`
          : scheduledResumeTiming?.isOverdue
            ? "scheduled resume passed its due time"
            : hasScheduledResumeDelay(scheduledResumeDelaySeconds)
              ? `runtime will retry in ${scheduledResumeDelaySeconds}s`
              : "runtime already queued a scheduled resume")
    });
  }

  if (lateCallbackCount > 0) {
    statuses.push({
      kind: "late_callback_recorded",
      label: "late callback recorded",
      detail: `${formatCountLabel(lateCallbackCount, "late callback")} already arrived after the original wait path, so manual resume can be used to pull the run forward.`
    });
  }

  if (lifecycle?.terminated) {
    statuses.push({
      kind: "terminated",
      label: "callback waiting terminated",
      detail:
        formatOptionalParts([
          lifecycle.termination_reason,
          "resume should wait until the termination reason is understood"
        ]) ?? "resume should wait until the termination reason is understood"
    });
  }

  return statuses;
}

export function formatCallbackWaitingOperatorStatusSummary(
  statuses: CallbackWaitingOperatorStatus[]
): string | null {
  if (!statuses.length) {
    return null;
  }

  return statuses.map((status) => `${status.label}: ${status.detail}`).join(" ");
}

export function listCallbackWaitingBlockerRows(
  {
    lifecycle,
    callbackTickets = [],
    sensitiveAccessEntries = [],
    callbackWaitingAutomation,
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt,
    scheduledResumeRequeuedAt,
    scheduledResumeRequeueSource
  }: CallbackWaitingExplanationInput,
  options?: {
    includeRecommendedActionRow?: boolean;
    includeTerminationRow?: boolean;
  }
): CallbackWaitingDetailRow[] {
  const includeRecommendedActionRow = options?.includeRecommendedActionRow ?? true;
  const includeTerminationRow = options?.includeTerminationRow ?? true;
  const inlineSensitiveAccessEntry = pickCallbackWaitingInlineSensitiveAccessEntry(
    sensitiveAccessEntries
  );
  const operatorStatuses = listCallbackWaitingOperatorStatuses({
    lifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    callbackWaitingAutomation,
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt,
    scheduledResumeRequeuedAt,
    scheduledResumeRequeueSource
  });
  const recommendedAction = getCallbackWaitingRecommendedAction({
    lifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    callbackWaitingAutomation,
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt,
    scheduledResumeRequeuedAt,
    scheduledResumeRequeueSource
  });

  return buildDetailRows([
    {
      label: "Status",
      value: formatCallbackWaitingOperatorStatusSummary(operatorStatuses)
    },
    {
      label: "Ticket status mix",
      value: formatCallbackTicketStatusSummary(callbackTickets)
    },
    {
      label: "Approvals",
      value: formatApprovalSummary(sensitiveAccessEntries)
    },
    {
      label: "Sensitive access",
      value: formatCallbackWaitingSensitiveAccessSummary(inlineSensitiveAccessEntry)
    },
    {
      label: "Notification",
      value: formatCallbackWaitingNotificationSummary(inlineSensitiveAccessEntry)
    },
    {
      label: "Resume",
      value: formatScheduledResumeLabel({
        scheduledResumeDelaySeconds,
        scheduledResumeSource,
        scheduledWaitingStatus,
        scheduledResumeScheduledAt,
        scheduledResumeDueAt,
        scheduledResumeRequeuedAt,
        scheduledResumeRequeueSource
      })
    },
    {
      label: "Latest requeue",
      value: formatScheduledResumeRequeueLabel({
        scheduledResumeRequeuedAt,
        scheduledResumeRequeueSource
      })
    },
    {
      label: "Resume timing",
      value: formatScheduledResumeTimingLabel({
        scheduledResumeDelaySeconds,
        scheduledResumeScheduledAt,
        scheduledResumeDueAt
      })
    },
    {
      label: "Automation",
      value: shouldSurfaceAutomationHealth({
        lifecycle,
        callbackTickets,
        sensitiveAccessEntries,
        callbackWaitingAutomation,
        scheduledResumeDelaySeconds,
        scheduledResumeSource,
        scheduledWaitingStatus,
        scheduledResumeScheduledAt,
        scheduledResumeDueAt,
        scheduledResumeRequeuedAt,
        scheduledResumeRequeueSource
      })
        ? formatCallbackWaitingAutomationSummary({
            lifecycle,
            callbackTickets,
            sensitiveAccessEntries,
            callbackWaitingAutomation,
            scheduledResumeDelaySeconds,
            scheduledResumeSource,
            scheduledWaitingStatus,
            scheduledResumeScheduledAt,
            scheduledResumeDueAt,
            scheduledResumeRequeuedAt,
            scheduledResumeRequeueSource
          })
        : null
    },
    {
      label: "Lifecycle",
      value: formatCallbackLifecycleLabel(lifecycle)
    },
    {
      label: "Termination",
      value: includeTerminationRow ? formatCallbackTerminationLabel(lifecycle) : null
    },
    {
      label: "Recommended next action",
      value:
        includeRecommendedActionRow && recommendedAction
          ? `${recommendedAction.label} · ${recommendedAction.detail}`
          : null
    }
  ]);
}

export function listCallbackWaitingEventRows({
  lifecycle,
  waitingReason,
  waitingNodeRunId,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: {
  lifecycle?: CallbackWaitingLifecycleSummary | null;
  waitingReason?: string | null;
  waitingNodeRunId?: string | null;
  scheduledResumeRequeuedAt?: string | null;
  scheduledResumeRequeueSource?: string | null;
}): CallbackWaitingDetailRow[] {
  return buildDetailRows([
    {
      label: "Latest ticket",
      value: formatLatestCallbackTicketLabel(lifecycle)
    },
    {
      label: "Latest late callback",
      value: formatLatestLateCallbackLabel(lifecycle)
    },
    {
      label: "Latest resume requeue",
      value: formatScheduledResumeRequeueLabel({
        scheduledResumeRequeuedAt,
        scheduledResumeRequeueSource
      })
    },
    {
      label: "Waiting node run",
      value: waitingNodeRunId
    },
    {
      label: "Waiting reason",
      value: waitingReason
    }
  ]);
}

export function listCallbackWaitingChips({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  callbackWaitingAutomation,
  scheduledResumeDelaySeconds,
  scheduledResumeDueAt,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: CallbackWaitingExplanationInput): string[] {
  const chips: string[] = [];
  const scheduledResumeTiming = resolveScheduledResumeTiming({
    scheduledResumeDelaySeconds,
    scheduledResumeDueAt
  });

  if (callbackTickets.length > 0) {
    chips.push(`tickets ${callbackTickets.length}`);
  }

  const pendingApprovalCount = countPendingApprovals(sensitiveAccessEntries);
  const failedNotificationCount = countFailedNotifications(sensitiveAccessEntries);
  if (pendingApprovalCount > 0) {
    chips.push(`approval ${pendingApprovalCount} pending`);
  }
  if (failedNotificationCount > 0) {
    chips.push(`notify failed ${failedNotificationCount}`);
  }

  if (lifecycle) {
    chips.push(`wait cycles ${lifecycle.wait_cycle_count}`);
    if (lifecycle.expired_ticket_count > 0) {
      chips.push(`expired ${lifecycle.expired_ticket_count}`);
    }
    if (lifecycle.late_callback_count > 0) {
      chips.push(`late ${lifecycle.late_callback_count}`);
    }
    if (typeof lifecycle.last_resume_delay_seconds === "number") {
      chips.push(`resume ${lifecycle.last_resume_delay_seconds}s`);
    }
    if (hasScheduledResumeRequeue(scheduledResumeRequeuedAt, scheduledResumeRequeueSource)) {
      chips.push("requeued");
    } else if (scheduledResumeTiming?.isOverdue) {
      chips.push("resume overdue");
    } else if (
      typeof lifecycle.last_resume_delay_seconds !== "number" &&
      hasScheduledResumeDelay(scheduledResumeDelaySeconds)
    ) {
      chips.push(`scheduled ${scheduledResumeDelaySeconds}s`);
    }
    if (lifecycle.terminated) {
      chips.push("terminated");
    }
  } else if (hasScheduledResumeRequeue(scheduledResumeRequeuedAt, scheduledResumeRequeueSource)) {
    chips.push("requeued");
  } else if (scheduledResumeTiming?.isOverdue) {
    chips.push("resume overdue");
  } else if (hasScheduledResumeDelay(scheduledResumeDelaySeconds)) {
    chips.push(`scheduled ${scheduledResumeDelaySeconds}s`);
  }

  if (
    shouldSurfaceAutomationHealth({
      lifecycle,
      callbackTickets,
      sensitiveAccessEntries,
      callbackWaitingAutomation,
      scheduledResumeDelaySeconds,
      scheduledResumeDueAt,
      scheduledResumeRequeuedAt,
      scheduledResumeRequeueSource
    }) &&
    callbackWaitingAutomation &&
    callbackWaitingAutomation.scheduler_health_status !== "healthy"
  ) {
    chips.push(
      `scheduler ${formatSchedulerHealthLabel(callbackWaitingAutomation.scheduler_health_status) ?? callbackWaitingAutomation.scheduler_health_status}`
    );
  }

  return chips;
}

export function getCallbackWaitingRecommendedAction({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  callbackWaitingAutomation,
  scheduledResumeDelaySeconds,
  scheduledResumeScheduledAt,
  scheduledResumeDueAt,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource
}: CallbackWaitingExplanationInput): CallbackWaitingRecommendedAction | null {
  const pendingApprovalCount = countPendingApprovals(sensitiveAccessEntries);
  const failedNotificationCount = countFailedNotifications(sensitiveAccessEntries);
  const expiredTicketCount = lifecycle?.expired_ticket_count ?? 0;
  const lateCallbackCount = lifecycle?.late_callback_count ?? 0;
  const pendingTicketCount = callbackTickets.filter((ticket) => ticket.status === "pending").length;
  const scheduledResumeTiming = resolveScheduledResumeTiming({
    scheduledResumeDelaySeconds,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt
  });
  const scheduledResumeRequeueLabel = formatScheduledResumeRequeueLabel({
    scheduledResumeRequeuedAt,
    scheduledResumeRequeueSource
  });
  const inlineSensitiveAccessEntry = pickCallbackWaitingInlineSensitiveAccessEntry(
    sensitiveAccessEntries
  );

  if (pendingApprovalCount > 0) {
    if (inlineSensitiveAccessEntry) {
      if (failedNotificationCount > 0) {
        return {
          kind: "resolve_inline_sensitive_access",
          label: "Retry notification here first",
          detail: `${formatCountLabel(pendingApprovalCount, "approval")} is still pending and ${formatCountLabel(failedNotificationCount, "failed notification")} suggests the approver may not have seen the request yet. Use the inline operator actions below to retarget or retry the latest notification before forcing resume.`
        };
      }

      return {
        kind: "resolve_inline_sensitive_access",
        label: "Handle approval here first",
        detail: `${formatCountLabel(pendingApprovalCount, "approval")} is still pending, so resume should start from approval handling instead of retrying the run. The inline operator actions below can approve or reject without leaving this callback summary.`
      };
    }

    return {
      kind: "open_inbox",
      label: "Open inbox slice first",
      detail: `${formatCountLabel(pendingApprovalCount, "approval")} is still pending, so resume should start from approval handling instead of retrying the run.`,
      ctaLabel: "Open approval inbox"
    };
  }

  if (lifecycle?.terminated) {
    return {
      kind: "inspect_termination",
      label: "Inspect termination before retrying",
      detail: formatOptionalParts([
        "Callback waiting has already terminated",
        lifecycle.termination_reason,
        "manual resume should wait until the termination reason is understood"
      ]) ?? "Callback waiting has already terminated.",
      ctaLabel: "Review blocker timeline"
    };
  }

  if (expiredTicketCount > 0) {
    return {
      kind: "cleanup_expired_tickets",
      label: "Cleanup expired tickets first",
      detail: `${formatCountLabel(expiredTicketCount, "expired callback ticket")} is blocking a clean resume path, so cleanup-and-resume is the safest next move.`,
      ctaLabel: "Cleanup expired tickets"
    };
  }

  if (scheduledResumeRequeueLabel) {
    return {
      kind: "watch_scheduled_resume",
      label: "Watch the requeued resume",
      detail:
        formatOptionalParts([
          "The waiting resume monitor already requeued the stalled resume",
          scheduledResumeRequeueLabel,
          "watch the worker consume that attempt before forcing another resume"
        ]) ?? "The waiting resume monitor already requeued the stalled resume.",
      ctaLabel: "Open waiting inbox"
    };
  }

  if (scheduledResumeTiming?.isOverdue) {
    const automationSummary = formatCallbackWaitingAutomationSummary({
      lifecycle,
      callbackTickets,
      sensitiveAccessEntries,
      callbackWaitingAutomation,
      scheduledResumeDelaySeconds,
      scheduledResumeScheduledAt,
      scheduledResumeDueAt,
      scheduledResumeRequeuedAt,
      scheduledResumeRequeueSource
    });

    return {
      kind: "manual_resume",
      label: "Scheduled resume is overdue",
      detail:
        formatOptionalParts([
          "The runtime already missed the scheduled resume window",
          scheduledResumeTiming.dueAtLabel ? `due ${scheduledResumeTiming.dueAtLabel}` : null,
          automationSummary ? `automation ${automationSummary}` : null,
          "inspect the scheduler or worker and use manual resume if the run should already have progressed"
        ]) ?? "The runtime already missed the scheduled resume window.",
      ctaLabel: "Try manual resume"
    };
  }

  if (pendingTicketCount > 0) {
    return {
      kind: "monitor_callback",
      label: "Wait for callback result",
      detail: `${formatCountLabel(pendingTicketCount, "callback ticket")} is still pending, so the main action is to monitor the ticket or the external tool rather than forcing another resume.`,
      ctaLabel: "Open waiting inbox"
    };
  }

  if (lateCallbackCount > 0 || callbackTickets.length > 0) {
    return {
      kind: "manual_resume",
      label: "Try manual resume now",
      detail:
        lateCallbackCount > 0
          ? `${formatCountLabel(lateCallbackCount, "late callback")} has already arrived, so an operator resume can pull the run forward without waiting for the next scheduler tick.`
          : "Callback ticket history already exists and no approval is still pending, so a manual resume is the fastest way to verify whether the run can continue immediately.",
      ctaLabel: "Try manual resume"
    };
  }

  if (hasScheduledResumeDelay(scheduledResumeDelaySeconds)) {
    return {
      kind: "watch_scheduled_resume",
      label: "Watch the scheduled resume",
      detail: `The runtime already scheduled a resume in ${scheduledResumeDelaySeconds}s, so intervention is optional unless the operator wants to bypass the backoff.`,
      ctaLabel: "Open waiting inbox"
    };
  }

  return null;
}
