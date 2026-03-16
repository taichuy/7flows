import Link from "next/link";

import { CallbackWaitingInlineActions } from "@/components/callback-waiting-inline-actions";
import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem
} from "@/lib/get-run-views";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  formatApprovalSummary,
  formatCallbackLifecycleLabel,
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  getCallbackWaitingHeadline,
  listCallbackWaitingChips
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
      {scheduledResume ? <p className="section-copy entry-copy">Resume: {scheduledResume}</p> : null}
      {lifecycleSummary ? (
        <p className="section-copy entry-copy">Lifecycle: {lifecycleSummary}</p>
      ) : null}
      {recommendedAction ? (
        <p className="section-copy entry-copy">
          Recommended next action: <strong>{recommendedAction.label}.</strong> {recommendedAction.detail}
        </p>
      ) : null}
      {recommendedAction?.kind === "open_inbox" && inboxHref ? (
        <div className="event-type-strip">
          <Link className="event-chip inbox-filter-link" href={inboxHref}>
            {recommendedAction.ctaLabel ?? "Open inbox slice"}
          </Link>
        </div>
      ) : null}
      {recommendedAction?.kind === "inspect_termination" && inboxHref ? (
        <div className="event-type-strip">
          <Link className="event-chip inbox-filter-link" href={inboxHref}>
            {recommendedAction.ctaLabel ?? "Review blocker timeline"}
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
      <CallbackWaitingInlineActions
        allowManualResume={!hasTermination}
        compact
        nodeRunId={nodeRunId}
        preferredAction={preferredInlineAction}
        runId={runId ?? null}
      />
    </div>
  );
}
