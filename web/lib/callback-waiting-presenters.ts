import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem
} from "@/lib/get-run-views";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
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
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  scheduledResumeScheduledAt?: string | null;
  scheduledResumeDueAt?: string | null;
};

function hasScheduledResumeDelay(
  scheduledResumeDelaySeconds?: number | null
): scheduledResumeDelaySeconds is number {
  return (
    typeof scheduledResumeDelaySeconds === "number" &&
    Number.isFinite(scheduledResumeDelaySeconds)
  );
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
  scheduledResumeDueAt
}: Pick<
  CallbackWaitingExplanationInput,
  | "scheduledResumeDelaySeconds"
  | "scheduledResumeSource"
  | "scheduledWaitingStatus"
  | "scheduledResumeScheduledAt"
  | "scheduledResumeDueAt"
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
    timingState?.dueAtLabel ? `due ${timingState.dueAtLabel}` : null
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
  scheduledResumeDueAt
}: CallbackWaitingExplanationInput): string | null {
  const pendingApprovalCount = countPendingApprovals(sensitiveAccessEntries);
  const pendingTicketCount = callbackTickets.filter((ticket) => ticket.status === "pending").length;
  const scheduledResumeTiming = resolveScheduledResumeTiming({
    scheduledResumeDelaySeconds,
    scheduledResumeDueAt
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
  scheduledResumeDueAt
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
      label: scheduledResumeTiming?.isOverdue
        ? "scheduled resume overdue"
        : "scheduled resume queued",
      detail:
        formatOptionalParts([
          scheduledResumeTiming?.isOverdue
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
          })
        ]) ??
        (scheduledResumeTiming?.isOverdue
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
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt
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
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt
  });
  const recommendedAction = getCallbackWaitingRecommendedAction({
    lifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt
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
        scheduledResumeDueAt
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
  waitingNodeRunId
}: {
  lifecycle?: CallbackWaitingLifecycleSummary | null;
  waitingReason?: string | null;
  waitingNodeRunId?: string | null;
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
  scheduledResumeDelaySeconds,
  scheduledResumeDueAt
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
    if (scheduledResumeTiming?.isOverdue) {
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
  } else if (scheduledResumeTiming?.isOverdue) {
    chips.push("resume overdue");
  } else if (hasScheduledResumeDelay(scheduledResumeDelaySeconds)) {
    chips.push(`scheduled ${scheduledResumeDelaySeconds}s`);
  }

  return chips;
}

export function getCallbackWaitingRecommendedAction({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  scheduledResumeDelaySeconds,
  scheduledResumeScheduledAt,
  scheduledResumeDueAt
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

  if (scheduledResumeTiming?.isOverdue) {
    return {
      kind: "manual_resume",
      label: "Scheduled resume is overdue",
      detail:
        formatOptionalParts([
          "The runtime already missed the scheduled resume window",
          scheduledResumeTiming.dueAtLabel ? `due ${scheduledResumeTiming.dueAtLabel}` : null,
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
