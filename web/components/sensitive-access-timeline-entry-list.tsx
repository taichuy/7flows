"use client";

import React from "react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";
import {
  buildCallbackWaitingRecommendedNextStep,
  getCallbackWaitingRecommendedAction,
  pickCallbackWaitingInlineSensitiveAccessEntry
} from "@/lib/callback-waiting-presenters";
import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRunDetailLinkSurface,
  formatOperatorOpenRunLinkLabel
} from "@/lib/operator-follow-up-presenters";
import {
  resolveSensitiveAccessTimelineEntryRunContext
} from "@/lib/sensitive-access";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  formatSensitiveAccessDecisionLabel,
  formatSensitiveAccessReasonLabel,
  buildSensitiveAccessBlockedRecommendedNextStep,
  getSensitiveAccessPolicySummary,
  getSensitiveAccessTimelineCanonicalOutcomeExplanation
} from "@/lib/sensitive-access-presenters";
import { buildSensitiveAccessTimelineInboxHref } from "@/lib/sensitive-access-links";

type SensitiveAccessTimelineEntryListProps = {
  entries: SensitiveAccessTimelineEntry[];
  emptyCopy: string;
  defaultRunId?: string | null;
};

type DecisionFilterValue =
  | "all"
  | NonNullable<SensitiveAccessTimelineEntry["request"]["decision"]>
  | "unset";
type TicketFilterValue =
  | "all"
  | NonNullable<NonNullable<SensitiveAccessTimelineEntry["approval_ticket"]>["status"]>
  | "none";
type NotificationFilterValue =
  | "all"
  | SensitiveAccessTimelineEntry["notifications"][number]["status"]
  | "none";

const DECISION_LABELS: Record<DecisionFilterValue, string> = {
  all: "all decisions",
  allow: "allow",
  allow_masked: "allow masked",
  deny: "deny",
  require_approval: "require approval",
  unset: "unset"
};

const TICKET_LABELS: Record<TicketFilterValue, string> = {
  all: "all tickets",
  approved: "approved",
  expired: "expired",
  none: "no ticket",
  pending: "pending",
  rejected: "rejected"
};

const NOTIFICATION_LABELS: Record<NotificationFilterValue, string> = {
  all: "all notifications",
  delivered: "delivered",
  failed: "failed",
  none: "no notification",
  pending: "pending"
};

const DECISION_ORDER: Exclude<DecisionFilterValue, "all">[] = [
  "require_approval",
  "allow",
  "deny",
  "allow_masked",
  "unset"
];
const TICKET_ORDER: Exclude<TicketFilterValue, "all">[] = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "none"
];
const NOTIFICATION_ORDER: Exclude<NotificationFilterValue, "all">[] = [
  "pending",
  "delivered",
  "failed",
  "none"
];

function getDecisionFilterValue(entry: SensitiveAccessTimelineEntry): DecisionFilterValue {
  return entry.request.decision ?? "unset";
}

function getTicketFilterValue(entry: SensitiveAccessTimelineEntry): TicketFilterValue {
  return entry.approval_ticket?.status ?? "none";
}

function countByFilterValue<T extends string>(values: T[]): Record<T, number> {
  return values.reduce<Record<T, number>>((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {} as Record<T, number>);
}

function matchesNotificationFilter(
  entry: SensitiveAccessTimelineEntry,
  filterValue: NotificationFilterValue
) {
  if (filterValue === "all") {
    return true;
  }

  if (filterValue === "none") {
    return entry.notifications.length === 0;
  }

  return entry.notifications.some((notification) => notification.status === filterValue);
}

function shouldSurfaceCallbackWaitingSummary(entry: SensitiveAccessTimelineEntry) {
  if (entry.request.decision === "require_approval") {
    return true;
  }

  if (entry.approval_ticket?.status === "expired") {
    return true;
  }

  return pickCallbackWaitingInlineSensitiveAccessEntry([entry]) !== null;
}

function renderFilterStrip<T extends string>({
  label,
  activeValue,
  counts,
  options,
  labels,
  onChange
}: {
  label: string;
  activeValue: T;
  counts: Partial<Record<T, number>>;
  options: T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <p className="status-meta">{label}</p>
      <div className="summary-strip">
        {options.map((value) => (
          <button
            className={`event-chip inbox-filter-link timeline-filter-button${
              activeValue === value ? " active" : ""
            }`}
            key={value}
            onClick={() => onChange(value)}
            type="button"
          >
            {labels[value]} {counts[value] ?? 0}
          </button>
        ))}
      </div>
    </>
  );
}

export function SensitiveAccessTimelineEntryList({
  entries,
  emptyCopy,
  defaultRunId
}: SensitiveAccessTimelineEntryListProps) {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilterValue>("all");
  const [ticketFilter, setTicketFilter] = useState<TicketFilterValue>("all");
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilterValue>("all");

  const decisionCounts = useMemo(
    () => countByFilterValue(entries.map((entry) => getDecisionFilterValue(entry))),
    [entries]
  );
  const ticketCounts = useMemo(
    () => countByFilterValue(entries.map((entry) => getTicketFilterValue(entry))),
    [entries]
  );
  const notificationCounts = useMemo<Record<Exclude<NotificationFilterValue, "all">, number>>(
    () => ({
      none: entries.filter((entry) => entry.notifications.length === 0).length,
      pending: entries.filter((entry) =>
        entry.notifications.some((notification) => notification.status === "pending")
      ).length,
      delivered: entries.filter((entry) =>
        entry.notifications.some((notification) => notification.status === "delivered")
      ).length,
      failed: entries.filter((entry) =>
        entry.notifications.some((notification) => notification.status === "failed")
      ).length
    }),
    [entries]
  );

  const decisionOptions = useMemo(
    () => [
      "all",
      ...DECISION_ORDER.filter((value) => (decisionCounts[value] ?? 0) > 0)
    ] satisfies DecisionFilterValue[],
    [decisionCounts]
  );
  const ticketOptions = useMemo(
    () => ["all", ...TICKET_ORDER.filter((value) => (ticketCounts[value] ?? 0) > 0)] satisfies TicketFilterValue[],
    [ticketCounts]
  );
  const notificationOptions = useMemo(
    () => [
      "all",
      ...NOTIFICATION_ORDER.filter((value) => (notificationCounts[value] ?? 0) > 0)
    ] satisfies NotificationFilterValue[],
    [notificationCounts]
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (decisionFilter !== "all" && getDecisionFilterValue(entry) !== decisionFilter) {
          return false;
        }
        if (ticketFilter !== "all" && getTicketFilterValue(entry) !== ticketFilter) {
          return false;
        }
        return matchesNotificationFilter(entry, notificationFilter);
      }),
    [decisionFilter, entries, notificationFilter, ticketFilter]
  );

  if (entries.length === 0) {
    return <p className="empty-state compact">{emptyCopy}</p>;
  }

  return (
    <div>
      {renderFilterStrip({
        label: "Decision filter",
        activeValue: decisionFilter,
        counts: {
          all: entries.length,
          allow: decisionCounts.allow ?? 0,
          allow_masked: decisionCounts.allow_masked ?? 0,
          deny: decisionCounts.deny ?? 0,
          require_approval: decisionCounts.require_approval ?? 0,
          unset: decisionCounts.unset ?? 0
        },
        options: decisionOptions,
        labels: DECISION_LABELS,
        onChange: setDecisionFilter
      })}

      {renderFilterStrip({
        label: "Ticket filter",
        activeValue: ticketFilter,
        counts: {
          all: entries.length,
          approved: ticketCounts.approved ?? 0,
          expired: ticketCounts.expired ?? 0,
          none: ticketCounts.none ?? 0,
          pending: ticketCounts.pending ?? 0,
          rejected: ticketCounts.rejected ?? 0
        },
        options: ticketOptions,
        labels: TICKET_LABELS,
        onChange: setTicketFilter
      })}

      {renderFilterStrip({
        label: "Notification filter",
        activeValue: notificationFilter,
        counts: {
          all: entries.length,
          delivered: notificationCounts.delivered,
          failed: notificationCounts.failed,
          none: notificationCounts.none,
          pending: notificationCounts.pending
        },
        options: notificationOptions,
        labels: NOTIFICATION_LABELS,
        onChange: setNotificationFilter
      })}

      <p className="section-copy entry-copy">
        Showing {filteredEntries.length} of {entries.length} timeline entries.
      </p>

      {filteredEntries.length === 0 ? (
        <p className="empty-state compact">
          No timeline entries match the current filters. Reset to all to see the full trace.
        </p>
      ) : null}

      <div className="event-list">
        {filteredEntries.map((entry) => {
          const runContext = resolveSensitiveAccessTimelineEntryRunContext(entry, defaultRunId);
          const runId = runContext.runId;
          const canonicalOutcomeExplanation = getSensitiveAccessTimelineCanonicalOutcomeExplanation({
            outcomeExplanation: entry.outcome_explanation ?? null,
            runSnapshot: runContext.snapshot,
            runFollowUpExplanation: runContext.runFollowUp?.explanation ?? null
          });
          const inboxSliceHref = buildSensitiveAccessTimelineInboxHref(entry, defaultRunId);
          const hasStructuredCallbackWaitingSummary = hasCallbackWaitingSummaryFacts(
            runContext.snapshot
          );
          const shouldRenderCallbackWaitingSummary =
            shouldSurfaceCallbackWaitingSummary(entry) && !hasStructuredCallbackWaitingSummary;
          const hasStructuredOperatorFeedback = Boolean(
            runContext.snapshot ||
              runContext.runFollowUp?.explanation ||
              (runContext.runFollowUp?.sampledRuns.length ?? 0) > 0
          );
          const nodeRunId = entry.approval_ticket?.node_run_id ?? entry.request.node_run_id ?? null;
          const callbackWaitingRecommendedAction = shouldRenderCallbackWaitingSummary
            ? getCallbackWaitingRecommendedAction({
                sensitiveAccessEntries: [entry]
              })
            : null;
          const recommendedNextStep = shouldRenderCallbackWaitingSummary
            ? buildCallbackWaitingRecommendedNextStep({
                action: callbackWaitingRecommendedAction,
                inboxHref: inboxSliceHref,
                operatorFollowUp:
                  runContext.runFollowUp?.explanation?.follow_up ??
                  canonicalOutcomeExplanation?.follow_up ??
                  null
              })
            : buildSensitiveAccessBlockedRecommendedNextStep({
                inboxHref: inboxSliceHref,
                runId,
                outcomeExplanation: canonicalOutcomeExplanation,
                runSnapshot: runContext.snapshot,
                runFollowUpExplanation: runContext.runFollowUp?.explanation ?? null
              });
          const inboxLinkLabel =
            recommendedNextStep?.href === inboxSliceHref && recommendedNextStep.href_label
              ? recommendedNextStep.href_label
              : operatorSurfaceCopy.openInboxSliceLabel;
          const shouldRenderStandaloneRecommendedNextStep =
            !shouldRenderCallbackWaitingSummary && !hasStructuredOperatorFeedback && recommendedNextStep;

          return (
            <article className="event-row compact-card" key={entry.request.id}>
              <div className="event-meta">
                <span>{entry.resource.label}</span>
                <span>{formatSensitiveAccessDecisionLabel(entry.request)}</span>
              </div>

              <p className="event-run">
                {entry.request.action_type} · {entry.resource.sensitivity_level} · {entry.resource.source}
              </p>

              <div className="event-type-strip">
                <span className="event-chip">requester {entry.request.requester_type}</span>
                <span className="event-chip">id {entry.request.requester_id}</span>
                {formatSensitiveAccessReasonLabel(entry.request) ? (
                  <span className="event-chip">
                    reason {formatSensitiveAccessReasonLabel(entry.request)}
                  </span>
                ) : null}
                {entry.approval_ticket ? (
                  <span className="event-chip">ticket {entry.approval_ticket.status}</span>
                ) : null}
                {entry.approval_ticket?.waiting_status ? (
                  <span className="event-chip">waiting {entry.approval_ticket.waiting_status}</span>
                ) : null}
              </div>

              {runId || inboxSliceHref ? (
                <div className="tool-badge-row">
                  {(() => {
                    const runLink = buildOperatorRunDetailLinkSurface({
                      runId,
                      hrefLabel: runId
                        ? formatOperatorOpenRunLinkLabel(runId, operatorSurfaceCopy)
                        : null,
                      surfaceCopy: operatorSurfaceCopy
                    });

                    return runLink ? (
                      <Link className="event-chip inbox-filter-link" href={runLink.href}>
                        {runLink.label}
                      </Link>
                    ) : null;
                  })()}
                  {inboxSliceHref ? (
                    <Link className="event-chip inbox-filter-link" href={inboxSliceHref}>
                      {inboxLinkLabel}
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {entry.request.purpose_text ? (
                <p className="section-copy entry-copy">purpose: {entry.request.purpose_text}</p>
              ) : null}

              {getSensitiveAccessPolicySummary(entry.request) ? (
                <p className="section-copy entry-copy">
                  policy: {getSensitiveAccessPolicySummary(entry.request)}
                </p>
              ) : null}

              {shouldRenderStandaloneRecommendedNextStep ? (
                <div className="entry-card compact-card">
                  <div className="payload-card-header">
                    <span className="status-meta">{operatorSurfaceCopy.recommendedNextStepTitle}</span>
                    <span className="event-chip">{recommendedNextStep.label}</span>
                    {recommendedNextStep.href && recommendedNextStep.href_label ? (
                      <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                        {recommendedNextStep.href_label}
                      </Link>
                    ) : null}
                  </div>
                  <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
                </div>
              ) : null}

              {hasStructuredOperatorFeedback ? (
                <InlineOperatorActionFeedback
                  callbackWaitingSummaryProps={{
                    inboxHref: inboxSliceHref,
                    sensitiveAccessEntries: [entry],
                    suppressSensitiveAccessContextRows: true,
                    showSensitiveAccessInlineActions: false
                  }}
                  message=""
                  outcomeExplanation={shouldRenderCallbackWaitingSummary ? null : canonicalOutcomeExplanation}
                  recommendedNextStep={
                    shouldRenderCallbackWaitingSummary || hasStructuredCallbackWaitingSummary
                      ? null
                      : recommendedNextStep
                  }
                  runFollowUpExplanation={runContext.runFollowUp?.explanation ?? null}
                  runFollowUp={runContext.runFollowUp ?? null}
                  runId={runId}
                  runSnapshot={runContext.snapshot}
                  status="success"
                  title="Operator follow-up"
                />
              ) : (
                <>
                  {canonicalOutcomeExplanation?.primary_signal ? (
                    <p className="section-copy entry-copy">
                      {canonicalOutcomeExplanation.primary_signal}
                    </p>
                  ) : null}

                  {canonicalOutcomeExplanation?.follow_up ? (
                    <p className="binding-meta">{canonicalOutcomeExplanation.follow_up}</p>
                  ) : null}
                </>
              )}

              {shouldRenderCallbackWaitingSummary ? (
                <CallbackWaitingSummaryCard
                  callbackWaitingExplanation={entry.outcome_explanation ?? null}
                  className="payload-card compact-card"
                  inboxHref={inboxSliceHref}
                  nodeRunId={nodeRunId}
                  runId={runId}
                  sensitiveAccessEntries={[entry]}
                  showInlineActions={false}
                />
              ) : null}

              <dl className="compact-meta-list">
                <div>
                  <dt>Requested</dt>
                  <dd>{formatTimestamp(entry.request.created_at)}</dd>
                </div>
                <div>
                  <dt>Decided</dt>
                  <dd>{formatTimestamp(entry.request.decided_at)}</dd>
                </div>
                <div>
                  <dt>Approval</dt>
                  <dd>
                    {entry.approval_ticket
                      ? `${entry.approval_ticket.status} · ${entry.approval_ticket.id}`
                      : "n/a"}
                  </dd>
                </div>
                <div>
                  <dt>Approved by</dt>
                  <dd>{entry.approval_ticket?.approved_by ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Approval decided</dt>
                  <dd>{formatTimestamp(entry.approval_ticket?.decided_at)}</dd>
                </div>
                <div>
                  <dt>Approval expires</dt>
                  <dd>{formatTimestamp(entry.approval_ticket?.expires_at)}</dd>
                </div>
              </dl>

              {entry.notifications.length > 0 ? (
                <div className="event-type-strip">
                  {entry.notifications.map((notification) => (
                    <span className="event-chip" key={notification.id}>
                      notify {notification.channel} {notification.status}
                    </span>
                  ))}
                </div>
              ) : null}

              {entry.notifications.length > 0 ? (
                <dl className="compact-meta-list">
                  {entry.notifications.map((notification) => (
                    <div key={notification.id}>
                      <dt>{notification.channel}</dt>
                      <dd>
                        {notification.target} · {notification.status} · {formatTimestamp(
                          notification.delivered_at ?? notification.created_at
                        )}
                        {notification.error ? ` · ${notification.error}` : ""}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <SensitiveAccessInlineActions
                compact
                nodeRunId={nodeRunId}
                notifications={entry.notifications}
                runId={runId}
                ticket={entry.approval_ticket}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
