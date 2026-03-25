import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import { buildOperatorTraceSliceLinkSurface } from "@/lib/operator-follow-up-presenters";
import type {
  PublishedEndpointInvocationItem,
  PublishedEndpointInvocationCallbackTicketItem,
  PublishedEndpointInvocationDetailResponse,
  RunExecutionFocusExplanation
} from "@/lib/get-workflow-publish";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import {
  buildPublishedInvocationCallbackBlockerSurface,
  buildPublishedInvocationCallbackDrilldownSurfaceCopy,
  buildPublishedInvocationCallbackTicketSurface,
  buildPublishedInvocationInboxHref,
  resolvePublishedInvocationRunFollowUpSampleView
} from "@/lib/published-invocation-presenters";
import { appendWorkflowLibraryViewState } from "@/lib/workflow-library-query";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

type WorkflowPublishInvocationCallbackSectionProps = {
  currentHref?: string | null;
  invocation: PublishedEndpointInvocationItem;
  callbackTickets: PublishedEndpointInvocationCallbackTicketItem[];
  sensitiveAccessEntries: SensitiveAccessTimelineEntry[];
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  callbackWaitingExplanation?: RunExecutionFocusExplanation | null;
  executionFocusNode?: PublishedEndpointInvocationDetailResponse["execution_focus_node"];
};

export function WorkflowPublishInvocationCallbackSection({
  currentHref = null,
  invocation,
  callbackTickets,
  sensitiveAccessEntries,
  callbackWaitingAutomation,
  callbackWaitingExplanation,
  executionFocusNode
}: WorkflowPublishInvocationCallbackSectionProps) {
  const waitingLifecycle = invocation.run_waiting_lifecycle;
  const callbackLifecycle = waitingLifecycle?.callback_waiting_lifecycle;
  const resolvedCallbackWaitingExplanation =
    callbackWaitingExplanation ?? waitingLifecycle?.callback_waiting_explanation ?? null;
  const surfaceCopy = buildPublishedInvocationCallbackDrilldownSurfaceCopy();
  const blockerSurface = buildPublishedInvocationCallbackBlockerSurface({
    invocation,
    callbackTickets,
    sensitiveAccessEntries,
    callbackWaitingAutomation,
    callbackWaitingExplanation: resolvedCallbackWaitingExplanation,
    surfaceCopy
  });
  const shouldRenderBlockers =
    Boolean(blockerSurface.headline) ||
    Boolean(blockerSurface.followUp) ||
    blockerSurface.chips.length > 0 ||
    blockerSurface.blockerRows.length > 0 ||
    blockerSurface.eventRows.length > 0;
  const ticketSurfaces = callbackTickets.map((ticket) =>
    buildPublishedInvocationCallbackTicketSurface({
      invocation,
      ticket,
      surfaceCopy
    })
  );
  const inboxHref = buildPublishedInvocationInboxHref({
    invocation,
    callbackTickets,
    sensitiveAccessEntries
  });
  const runFollowUpSample = resolvePublishedInvocationRunFollowUpSampleView(invocation);
  const runFollowUpSampleWorkflowDetailLink = runFollowUpSample?.workflow_id
    ? buildAuthorFacingWorkflowDetailLinkSurface({
        workflowId: runFollowUpSample.workflow_id,
        variant: "editor"
      })
    : null;
  const runFollowUpSampleWorkflowDetailHref = runFollowUpSampleWorkflowDetailLink
    ? runFollowUpSample?.workflow_catalog_gap_summary
      ? appendWorkflowLibraryViewState(runFollowUpSampleWorkflowDetailLink.href, {
          definitionIssue: "missing_tool"
        })
      : runFollowUpSampleWorkflowDetailLink.href
    : null;
  const focusEvidenceDrilldownLink = buildOperatorTraceSliceLinkSurface({
    runId: invocation.run_id ?? null,
    currentHref,
    nodeRunId: waitingLifecycle?.node_run_id ?? null
  });

  return (
    <section>
      <strong>{surfaceCopy.title}</strong>
      <p className="section-copy entry-copy">{surfaceCopy.description}</p>
      {inboxHref ? (
        <div className="tool-badge-row">
          <Link className="event-chip inbox-filter-link" href={inboxHref}>
            {surfaceCopy.inboxLinkLabel}
          </Link>
        </div>
      ) : null}
      <CallbackWaitingSummaryCard
        currentHref={currentHref}
        callbackTickets={callbackTickets}
        callbackWaitingAutomation={callbackWaitingAutomation}
        callbackWaitingExplanation={resolvedCallbackWaitingExplanation}
        focusNodeEvidence={executionFocusNode ?? null}
        focusSkillReferenceCount={executionFocusNode?.skill_reference_load_count ?? null}
        focusSkillReferenceLoads={executionFocusNode?.skill_reference_loads ?? []}
        focusSkillReferenceNodeId={executionFocusNode?.node_id ?? null}
        focusSkillReferenceNodeName={executionFocusNode?.node_name ?? null}
        lifecycle={callbackLifecycle}
        sensitiveAccessEntries={sensitiveAccessEntries}
        sensitiveAccessSummary={waitingLifecycle?.sensitive_access_summary ?? null}
        showFocusExecutionFacts
        waitingReason={waitingLifecycle?.waiting_reason ?? invocation.run_waiting_reason}
        scheduledResumeDelaySeconds={waitingLifecycle?.scheduled_resume_delay_seconds}
        scheduledResumeSource={waitingLifecycle?.scheduled_resume_source}
        scheduledWaitingStatus={waitingLifecycle?.scheduled_waiting_status}
        scheduledResumeScheduledAt={waitingLifecycle?.scheduled_resume_scheduled_at}
        scheduledResumeDueAt={waitingLifecycle?.scheduled_resume_due_at}
        scheduledResumeRequeuedAt={waitingLifecycle?.scheduled_resume_requeued_at}
        scheduledResumeRequeueSource={waitingLifecycle?.scheduled_resume_requeue_source}
        inboxHref={inboxHref}
        runId={invocation.run_id ?? null}
        nodeRunId={waitingLifecycle?.node_run_id ?? null}
        operatorFollowUp={invocation.run_follow_up?.explanation?.follow_up ?? null}
        recommendedAction={invocation.run_follow_up?.recommended_action ?? null}
        workflowCatalogGapSummary={runFollowUpSample?.workflow_catalog_gap_summary}
        workflowCatalogGapDetail={runFollowUpSample?.workflow_catalog_gap_detail}
        workflowGovernanceHref={runFollowUpSampleWorkflowDetailHref}
        legacyAuthHandoff={runFollowUpSample?.legacy_auth_handoff ?? null}
        preferCanonicalRecommendedNextStep
        focusEvidenceDrilldownLink={focusEvidenceDrilldownLink}
      />
      {shouldRenderBlockers ? (
        <div className="publish-meta-grid">
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">{blockerSurface.title}</span>
            </div>
            <p className="section-copy entry-copy">{blockerSurface.displayHeadline}</p>
            {blockerSurface.followUp ? (
              <p className="binding-meta">{blockerSurface.followUp}</p>
            ) : null}
            {blockerSurface.chips.length ? (
              <p className="binding-meta">{blockerSurface.chips.join(" · ")}</p>
            ) : null}
            <dl className="compact-meta-list">
              {blockerSurface.blockerRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">{blockerSurface.latestEventsTitle}</span>
            </div>
            <dl className="compact-meta-list">
              {blockerSurface.eventRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}

      {ticketSurfaces.length ? (
        <div className="publish-cache-list">
          {ticketSurfaces.map((ticket) => (
            <article className="payload-card compact-card" key={ticket.ticketId}>
              <div className="payload-card-header">
                <span className="status-meta">{ticket.title}</span>
                <span className="event-chip">{ticket.status}</span>
              </div>
              {ticket.inboxHref ? (
                <div className="tool-badge-row">
                  <Link className="event-chip inbox-filter-link" href={ticket.inboxHref}>
                    {ticket.inboxLinkLabel}
                  </Link>
                </div>
              ) : null}
              <dl className="compact-meta-list">
                {ticket.detailRows.map((row) => (
                  <div key={`${ticket.ticketId}:${row.label}`}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {ticket.payloadPreview ? (
                <>
                  <p className="section-copy entry-copy">{ticket.payloadPreviewTitle}</p>
                  <pre className="trace-preview">{ticket.payloadPreview}</pre>
                </>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">{surfaceCopy.emptyState}</p>
      )}
    </section>
  );
}
