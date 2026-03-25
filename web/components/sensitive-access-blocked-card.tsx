"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";
import { CredentialGovernanceSummaryCard } from "@/components/credential-governance-summary-card";
import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";
import { formatSensitiveResourceGovernanceSummary } from "@/lib/credential-governance";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import type { CallbackWaitingSummaryProps } from "@/lib/callback-waiting-summary-props";
import {
  resolveSensitiveAccessBlockingRunId,
  type SensitiveAccessBlockingPayload
} from "@/lib/sensitive-access";
import {
  buildSensitiveAccessBlockedRecommendedNextStep,
  formatSensitiveAccessDecisionLabel,
  formatSensitiveAccessReasonLabel,
  getSensitiveAccessCanonicalOutcomeExplanation,
  getSensitiveAccessBlockedPolicySummary
} from "@/lib/sensitive-access-presenters";
import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorInboxSliceLinkSurface
} from "@/lib/operator-follow-up-presenters";
import { buildSensitiveAccessInboxHref } from "@/lib/sensitive-access-links";
import {
  buildRunDetailHrefFromWorkspaceStarterViewState,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";
import {
  buildAuthorFacingFollowUpSurfaceCopy,
  buildAuthorFacingRunDetailLinkSurface
} from "@/lib/workbench-entry-surfaces";

function normalizeApprovalStatus(value?: string | null) {
  return value === "pending" || value === "approved" || value === "rejected" || value === "expired"
    ? value
    : null;
}

function normalizeWaitingStatus(value?: string | null) {
  return value === "waiting" || value === "resumed" || value === "failed" ? value : null;
}

type SensitiveAccessBlockedCardProps = {
  title: string;
  payload: SensitiveAccessBlockingPayload;
  clearHref?: string | null;
  summary?: string;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function SensitiveAccessBlockedCard({
  title,
  payload,
  clearHref = null,
  summary,
  callbackWaitingAutomation = null,
  sandboxReadiness = null
}: SensitiveAccessBlockedCardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const followUpSurfaceCopy = buildAuthorFacingFollowUpSurfaceCopy();
  const runId = resolveSensitiveAccessBlockingRunId(payload);
  const currentHref = React.useMemo(() => {
    const search = searchParams?.toString();
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);
  const workspaceStarterViewState = React.useMemo(
    () => readWorkspaceStarterLibraryViewState(new URLSearchParams(searchParams?.toString())),
    [searchParams]
  );
  const resolveRunDetailHref = React.useCallback(
    (candidateRunId: string) =>
      buildRunDetailHrefFromWorkspaceStarterViewState(
        candidateRunId,
        workspaceStarterViewState
      ),
    [workspaceStarterViewState]
  );
  const scopedRunDetailHref = runId ? resolveRunDetailHref(runId) : null;
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const inboxHref = buildSensitiveAccessInboxHref({
    runId,
    nodeRunId: payload.access_request.node_run_id ?? payload.approval_ticket?.node_run_id ?? null,
    status: normalizeApprovalStatus(payload.approval_ticket?.status),
    waitingStatus: normalizeWaitingStatus(payload.approval_ticket?.waiting_status),
    accessRequestId: payload.access_request.id,
    approvalTicketId: payload.approval_ticket?.id ?? null
  });
  const inboxLink = buildOperatorInboxSliceLinkSurface({
    href: inboxHref,
    surfaceCopy: operatorSurfaceCopy
  });
  const runLink = runId
    ? buildAuthorFacingRunDetailLinkSurface({
        runId,
        runHref: scopedRunDetailHref,
        hrefLabel: runId
      })
    : null;
  const hasStructuredFollowUp = Boolean(
      payload.outcome_explanation?.primary_signal?.trim() ||
      payload.outcome_explanation?.follow_up?.trim() ||
      payload.run_follow_up?.explanation?.primary_signal?.trim() ||
      payload.run_follow_up?.explanation?.follow_up?.trim() ||
      (payload.run_follow_up?.sampledRuns.length ?? 0) > 0 ||
      payload.run_snapshot
  );
  const canonicalOutcomeExplanation = getSensitiveAccessCanonicalOutcomeExplanation({
    outcomeExplanation: payload.outcome_explanation ?? null,
    runSnapshot: payload.run_snapshot ?? null,
    runFollowUpExplanation: payload.run_follow_up?.explanation ?? null
  });
  const canonicalCallbackRecommendedAction =
    payload.run_follow_up?.recommendedAction ??
    (payload.approval_ticket?.status === "pending" && inboxHref
      ? {
          kind: "approval blocker",
          entry_key: "operatorInbox",
          href: inboxHref,
          label: "Open approval inbox"
        }
      : null);
  const callbackWaitingActive = Boolean(
    payload.access_request.decision === "require_approval" ||
      payload.approval_ticket?.status === "pending" ||
      payload.approval_ticket?.status === "expired" ||
      payload.approval_ticket?.waiting_status === "waiting" ||
      hasCallbackWaitingSummaryFacts(payload.run_snapshot ?? null)
  );
  const recommendedNextStepPrimaryResourceSummary = formatSensitiveResourceGovernanceSummary(
    payload.resource
  );
  const recommendedNextStep = buildSensitiveAccessBlockedRecommendedNextStep({
    currentHref,
    inboxHref,
    runId,
    runHref: scopedRunDetailHref,
    primaryResourceSummary: recommendedNextStepPrimaryResourceSummary,
    outcomeExplanation: canonicalOutcomeExplanation,
    runSnapshot: payload.run_snapshot ?? null,
    runFollowUpExplanation: payload.run_follow_up?.explanation ?? null,
    recommendedAction: canonicalCallbackRecommendedAction,
    callbackWaitingAutomation,
    callbackWaitingActive,
    sandboxReadiness
  });
  const callbackWaitingSummaryProps: CallbackWaitingSummaryProps = {
    currentHref,
    inboxHref,
    callbackWaitingAutomation,
    showSensitiveAccessInlineActions: false,
    recommendedAction: canonicalCallbackRecommendedAction,
    operatorFollowUp: payload.run_follow_up?.explanation?.follow_up ?? null,
    preferCanonicalRecommendedNextStep: true
  };

  return (
    <article className="entry-card compact-card">
      <div className="payload-card-header">
        <div>
          <p className="entry-card-title">{title}</p>
          <p className="binding-meta">{payload.detail}</p>
        </div>
        {clearHref ? (
          <Link className="inline-link secondary" href={clearHref}>
            关闭详情
          </Link>
        ) : null}
      </div>

      <p className="section-copy entry-copy">
        {summary ??
          "当前入口已命中统一敏感访问控制；可先查看审批票据、通知投递和关联 run，再决定后续排障动作。"}
      </p>

      <div className="tool-badge-row">
        <span className="event-chip">{formatSensitiveAccessDecisionLabel(payload.access_request)}</span>
        <span className="event-chip">{payload.resource.sensitivity_level}</span>
        <span className="event-chip">{payload.access_request.action_type}</span>
        <span className="event-chip">{payload.resource.source}</span>
        {inboxLink ? (
          <Link className="event-chip inbox-filter-link" href={inboxLink.href}>
            {inboxLink.label}
          </Link>
        ) : null}
      </div>

      <dl className="compact-meta-list">
        <div>
          <dt>Resource</dt>
          <dd>{payload.resource.label}</dd>
        </div>
        <div>
          <dt>Requester</dt>
          <dd>
            {payload.access_request.requester_type} · {payload.access_request.requester_id}
          </dd>
        </div>
        <div>
          <dt>Reason code</dt>
          <dd>{formatSensitiveAccessReasonLabel(payload.access_request) ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd>{runLink ? <Link className="inline-link" href={runLink.href}>{runLink.label}</Link> : "n/a"}</dd>
        </div>
        <div>
          <dt>Node run</dt>
          <dd>{payload.access_request.node_run_id ?? payload.approval_ticket?.node_run_id ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Approval ticket</dt>
          <dd>
            {payload.approval_ticket
              ? `${payload.approval_ticket.status}${payload.approval_ticket.waiting_status ? ` · ${payload.approval_ticket.waiting_status}` : ""}`
              : "n/a"}
          </dd>
        </div>
      </dl>

      {payload.resource.description ? (
        <p className="section-copy entry-copy">resource: {payload.resource.description}</p>
      ) : null}
      <CredentialGovernanceSummaryCard resource={payload.resource} />
      {payload.access_request.purpose_text ? (
        <p className="section-copy entry-copy">purpose: {payload.access_request.purpose_text}</p>
      ) : null}
      {getSensitiveAccessBlockedPolicySummary(payload) ? (
        <p className="section-copy entry-copy">
          policy: {getSensitiveAccessBlockedPolicySummary(payload)}
        </p>
      ) : null}

      {payload.notifications.length ? (
        <div className="tool-badge-row">
          {payload.notifications.map((item) => (
            <span className="event-chip" key={item.id}>
              {item.channel}:{item.status}
            </span>
          ))}
        </div>
      ) : null}

      {hasStructuredFollowUp ? (
        <InlineOperatorActionFeedback
          callbackWaitingSummaryProps={callbackWaitingSummaryProps}
          currentHref={currentHref}
          message=""
          outcomeExplanation={canonicalOutcomeExplanation}
          recommendedNextStep={recommendedNextStep}
          resolveRunDetailHref={resolveRunDetailHref}
          runFollowUpExplanation={payload.run_follow_up?.explanation ?? null}
          runFollowUp={payload.run_follow_up ?? null}
          runId={runId}
          runSnapshot={payload.run_snapshot ?? null}
          sandboxReadiness={sandboxReadiness}
          status="success"
          title={followUpSurfaceCopy.canonicalFollowUpTitle}
        />
      ) : null}

      <SensitiveAccessInlineActions
        callbackWaitingSummaryProps={callbackWaitingSummaryProps}
        compact
        nodeRunId={
          payload.approval_ticket?.node_run_id ?? payload.access_request.node_run_id ?? null
        }
        notifications={payload.notifications}
        runId={runId}
        sandboxReadiness={sandboxReadiness}
        ticket={payload.approval_ticket}
      />
    </article>
  );
}
