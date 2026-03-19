import Link from "next/link";

import { CallbackWaitingInlineActions } from "@/components/callback-waiting-inline-actions";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";
import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem,
  RunExecutionFocusExplanation,
  RunExecutionNodeItem
} from "@/lib/get-run-views";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  formatExecutionFocusArtifactSummary,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";
import {
  formatCallbackLifecycleLabel,
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  getCallbackWaitingHeadline,
  listCallbackWaitingBlockerRows,
  listCallbackWaitingChips,
  listCallbackWaitingOperatorStatuses,
  pickCallbackWaitingInlineSensitiveAccessEntry
} from "@/lib/callback-waiting-presenters";

type CallbackWaitingSummaryCardProps = {
  lifecycle?: CallbackWaitingLifecycleSummary | null;
  callbackTickets?: RunCallbackTicketItem[];
  sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
  callbackWaitingExplanation?: RunExecutionFocusExplanation | null;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  waitingReason?: string | null;
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  scheduledResumeScheduledAt?: string | null;
  scheduledResumeDueAt?: string | null;
  scheduledResumeRequeuedAt?: string | null;
  scheduledResumeRequeueSource?: string | null;
  inboxHref?: string | null;
  runId?: string | null;
  nodeRunId?: string | null;
  focusNodeEvidence?: Pick<RunExecutionNodeItem, "artifact_refs" | "artifacts" | "tool_calls"> | null;
  className?: string;
};

export function CallbackWaitingSummaryCard({
  lifecycle,
  callbackTickets = [],
  sensitiveAccessEntries = [],
  callbackWaitingExplanation,
  callbackWaitingAutomation,
  waitingReason,
  scheduledResumeDelaySeconds,
  scheduledResumeSource,
  scheduledWaitingStatus,
  scheduledResumeScheduledAt,
  scheduledResumeDueAt,
  scheduledResumeRequeuedAt,
  scheduledResumeRequeueSource,
  inboxHref,
  runId,
  nodeRunId,
  focusNodeEvidence,
  className = ""
}: CallbackWaitingSummaryCardProps) {
  const headline =
    callbackWaitingExplanation?.primary_signal?.trim() ||
    getCallbackWaitingHeadline({
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
  const callbackFollowUp = callbackWaitingExplanation?.follow_up?.trim() || null;
  const scheduledResume = formatScheduledResumeLabel({
    scheduledResumeDelaySeconds,
    scheduledResumeSource,
    scheduledWaitingStatus,
    scheduledResumeScheduledAt,
    scheduledResumeDueAt,
    scheduledResumeRequeuedAt,
    scheduledResumeRequeueSource
  });
  const lifecycleSummary = formatCallbackLifecycleLabel(lifecycle);
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
  const chips = listCallbackWaitingChips({
    lifecycle,
    callbackTickets,
    sensitiveAccessEntries,
    callbackWaitingAutomation,
    scheduledResumeDelaySeconds,
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
  const blockerRows = listCallbackWaitingBlockerRows(
    {
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
    },
    {
      includeTerminationRow: false
    }
  );
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
  const focusToolCallSummaries = focusNodeEvidence
    ? listExecutionFocusToolCallSummaries(focusNodeEvidence)
    : [];
  const focusArtifactSummary = focusNodeEvidence
    ? formatExecutionFocusArtifactSummary(focusNodeEvidence)
    : null;
  const focusArtifacts = focusNodeEvidence
    ? listExecutionFocusArtifactPreviews(focusNodeEvidence)
    : [];
  const hasContent =
    headline ||
    blockerRows.length > 0 ||
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
      {operatorStatuses.length ? (
        <div className="event-type-strip">
          {operatorStatuses.map((status) => (
            <span className="event-chip" key={status.kind}>
              {status.label}
            </span>
          ))}
        </div>
      ) : null}
      {blockerRows.map((row) => (
        <p className="section-copy entry-copy" key={row.label}>
          {row.label}: {row.value}
        </p>
      ))}
      {callbackFollowUp ? <p className="section-copy entry-copy">{callbackFollowUp}</p> : null}
      {focusNodeEvidence ? (
        <OperatorFocusEvidenceCard
          title="Waiting node focus evidence"
          artifactCount={focusNodeEvidence.artifacts.length}
          artifactRefCount={focusNodeEvidence.artifact_refs.length}
          artifactSummary={focusArtifactSummary}
          artifacts={focusArtifacts}
          toolCallCount={focusNodeEvidence.tool_calls.length}
          toolCallSummaries={focusToolCallSummaries}
        />
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
          nodeRunId={inlineSensitiveAccessEntry.approval_ticket?.node_run_id ?? nodeRunId ?? null}
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
