import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem
} from "@/lib/get-run-views";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";

type CallbackWaitingExplanationInput = {
  lifecycle?: CallbackWaitingLifecycleSummary | null;
  callbackTickets?: RunCallbackTicketItem[];
  sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
};

export type CallbackWaitingRecommendedAction = {
  kind:
    | "open_inbox"
    | "inspect_termination"
    | "cleanup_expired_tickets"
    | "monitor_callback"
    | "manual_resume"
    | "watch_scheduled_resume";
  label: string;
  detail: string;
  ctaLabel?: string;
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

function formatCountLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatOptionalParts(parts: Array<string | null | undefined>): string | null {
  const normalized = parts
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  return normalized.length ? normalized.join(" · ") : null;
}

export function formatScheduledResumeLabel({
  scheduledResumeDelaySeconds,
  scheduledResumeSource,
  scheduledWaitingStatus
}: Pick<
  CallbackWaitingExplanationInput,
  "scheduledResumeDelaySeconds" | "scheduledResumeSource" | "scheduledWaitingStatus"
>): string | null {
  if (!scheduledResumeDelaySeconds) {
    return null;
  }

  return formatOptionalParts([
    `scheduled resume ${scheduledResumeDelaySeconds}s`,
    scheduledResumeSource,
    scheduledWaitingStatus
  ]);
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

export function getCallbackWaitingHeadline({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = []
}: CallbackWaitingExplanationInput): string | null {
  const pendingApprovalCount = countPendingApprovals(sensitiveAccessEntries);
  const pendingTicketCount = callbackTickets.filter((ticket) => ticket.status === "pending").length;

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
  if (callbackTickets.length > 0 || lifecycle) {
    return "Callback waiting is tracked for this run.";
  }
  return null;
}

export function listCallbackWaitingChips({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  scheduledResumeDelaySeconds
}: CallbackWaitingExplanationInput): string[] {
  const chips: string[] = [];

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
    } else if (scheduledResumeDelaySeconds) {
      chips.push(`scheduled ${scheduledResumeDelaySeconds}s`);
    }
    if (lifecycle.terminated) {
      chips.push("terminated");
    }
  } else if (scheduledResumeDelaySeconds) {
    chips.push(`scheduled ${scheduledResumeDelaySeconds}s`);
  }

  return chips;
}

export function getCallbackWaitingRecommendedAction({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  scheduledResumeDelaySeconds
}: CallbackWaitingExplanationInput): CallbackWaitingRecommendedAction | null {
  const pendingApprovalCount = countPendingApprovals(sensitiveAccessEntries);
  const failedNotificationCount = countFailedNotifications(sensitiveAccessEntries);
  const expiredTicketCount = lifecycle?.expired_ticket_count ?? 0;
  const lateCallbackCount = lifecycle?.late_callback_count ?? 0;
  const pendingTicketCount = callbackTickets.filter((ticket) => ticket.status === "pending").length;

  if (pendingApprovalCount > 0) {
    if (failedNotificationCount > 0) {
      return {
        kind: "open_inbox",
        label: "Open inbox slice and retry notification",
        detail: `${formatCountLabel(pendingApprovalCount, "approval")} is still pending and ${formatCountLabel(failedNotificationCount, "failed notification")} suggests the approver may never have seen the request yet. Retry or retarget the latest notification before forcing resume.`,
        ctaLabel: "Open approval inbox"
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

  if (pendingTicketCount > 0) {
    return {
      kind: "monitor_callback",
      label: "Wait for callback result",
      detail: `${formatCountLabel(pendingTicketCount, "callback ticket")} is still pending, so the main action is to monitor the ticket or the external tool rather than forcing another resume.`
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

  if (scheduledResumeDelaySeconds) {
    return {
      kind: "watch_scheduled_resume",
      label: "Watch the scheduled resume",
      detail: `The runtime already scheduled a resume in ${scheduledResumeDelaySeconds}s, so intervention is optional unless the operator wants to bypass the backoff.`
    };
  }

  return null;
}
