import Link from "next/link";

import { CallbackWaitingInlineActions } from "@/components/callback-waiting-inline-actions";
import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";
import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem
} from "@/lib/get-run-views";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  formatApprovalSummary,
  formatCallbackLifecycleLabel,
  formatCallbackWaitingNotificationSummary,
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  getCallbackWaitingHeadline,
  listCallbackWaitingChips,
  pickCallbackWaitingInlineSensitiveAccessEntry
} from "@/lib/callback-waiting-presenters";

type CallbackWaitingSummaryCardProps = {
  lifecycle?: CallbackWaitingLifecycleSummary | null;
  callbackTickets?: RunCallbackTicketItem[];
  sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
  waitingReason?: string | null;
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  inboxHref?: string | null;
  runId?: string | null;
  nodeRunId?: string | null;
  className?: string;
};

export function CallbackWaitingSummaryCard({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  waitingReason,
  scheduledResumeDelaySeconds,
  scheduledResumeSource,
  scheduledWaitingStatus,
  inboxHref,
  runId,
  nodeRunId,
  className = ""
}: CallbackWaitingSummaryCardProps) {
  const headline = getCallbackWaitingHeadline({
    lifecycle,
    callbackTickets,
    sensitiveAccessEntries
  });
  const approvalSummary = formatApprovalSummary(sensitiveAccessEntries);
  const scheduledResume = formatScheduledResumeLabel({
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus
  });
  const lifecycleSummary = formatCallbackLifecycleLabel(lifecycle);
  const inlineSensitiveAccessEntry = pickCallbackWaitingInlineSensitiveAccessEntry(
    sensitiveAccessEntries
  );
  const notificationSummary = formatCallbackWaitingNotificationSummary(inlineSensitiveAccessEntry);
  const chips = listCallbackWaitingChips({
    lifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    scheduledResumeDelaySeconds
  });
  const recommendedAction = getCallbackWaitingRecommendedAction({
    lifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus
  });
  const terminationAt = formatTimestamp(lifecycle?.terminated_at);
  const hasTermination = Boolean(lifecycle?.terminated);
  const preferredInlineAction =
    recommendedAction?.kind === "manual_resume"
      ? "resume"
      : recommendedAction?.kind === "cleanup_expired_tickets"
        ? "cleanup"
        : null;
  const inlineStatusHint =
    recommendedAction?.kind === "monitor_callback"
      ? "建议先观察 callback ticket 与外部系统；若确认回调已到达但 run 仍未推进，再尝试手动恢复。"
      : recommendedAction?.kind === "watch_scheduled_resume"
        ? "系统已安排定时恢复；仅在需要绕过当前 backoff 时，再手动恢复或清理过期 ticket。"
        : null;
  const recommendedCtaHref =
    recommendedAction?.kind === "open_inbox" ||
    recommendedAction?.kind === "inspect_termination" ||
    recommendedAction?.kind === "monitor_callback" ||
    recommendedAction?.kind === "watch_scheduled_resume"
      ? inboxHref
      : null;
  const hasContent =
    headline ||
    approvalSummary ||
    scheduledResume ||
    lifecycleSummary ||
    waitingReason ||
    chips.length > 0 ||
    hasTermination;

  if (!hasContent) {
    return null;
  }

  return (
    <div className={className}>
      {headline ? <p className="section-copy entry-copy">{headline}</p> : null}
      {chips.length ? (
        <div className="event-type-strip">
          {chips.map((chip) => (
            <span className="event-chip" key={chip}>
              {chip}
            </span>
          ))}
          {inboxHref ? (
            <Link className="event-chip inbox-filter-link" href={inboxHref}>
              open inbox slice
            </Link>
          ) : null}
        </div>
      ) : null}
      {!chips.length && inboxHref ? (
        <div className="event-type-strip">
          <Link className="event-chip inbox-filter-link" href={inboxHref}>
            open inbox slice
          </Link>
        </div>
      ) : null}
      {waitingReason ? <p className="run-error-message">{waitingReason}</p> : null}
      {approvalSummary ? <p className="section-copy entry-copy">Approval: {approvalSummary}</p> : null}
      {notificationSummary ? (
        <p className="section-copy entry-copy">Notification: {notificationSummary}</p>
      ) : null}
      {scheduledResume ? <p className="section-copy entry-copy">Resume: {scheduledResume}</p> : null}
      {lifecycleSummary ? (
        <p className="section-copy entry-copy">Lifecycle: {lifecycleSummary}</p>
      ) : null}
      {recommendedAction ? (
        <p className="section-copy entry-copy">
          Recommended next action: <strong>{recommendedAction.label}.</strong> {recommendedAction.detail}
        </p>
      ) : null}
      {recommendedCtaHref ? (
        <div className="event-type-strip">
          <Link className="event-chip inbox-filter-link" href={recommendedCtaHref}>
            {recommendedAction?.ctaLabel ?? "Open inbox slice"}
          </Link>
        </div>
      ) : null}
      {hasTermination ? (
        <p className="run-error-message">
          callback waiting terminated
          {lifecycle?.termination_reason ? ` · ${lifecycle.termination_reason}` : ""}
          {terminationAt !== "n/a" ? ` · ${terminationAt}` : ""}
        </p>
      ) : null}
      {inlineSensitiveAccessEntry ? (
        <SensitiveAccessInlineActions
          compact
          notifications={inlineSensitiveAccessEntry.notifications}
          runId={runId ?? null}
          ticket={inlineSensitiveAccessEntry.approval_ticket}
        />
      ) : null}
      <CallbackWaitingInlineActions
        allowManualResume={!hasTermination}
        compact
        nodeRunId={nodeRunId}
        preferredAction={preferredInlineAction}
        runId={runId ?? null}
        statusHint={inlineStatusHint}
      />
    </div>
  );
}
