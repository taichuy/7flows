import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";
import { buildExecutionFocusExplainableNode } from "@/lib/operator-inline-action-feedback";
import { formatScheduledResumeLabel } from "@/lib/callback-waiting-presenters";
import {
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationEntrySurfaceCopy,
  buildPublishedInvocationEntryInboxLinkSurface,
  buildPublishedInvocationInboxHref,
  buildPublishedInvocationRecommendedNextStep,
  buildPublishedInvocationRunFollowUpSampleInboxHref,
  buildPublishedInvocationWaitingCardSurface,
  listPublishedInvocationEntryMetaRows,
  listPublishedInvocationRunFollowUpEvidenceChips,
  formatPublishedInvocationWaitingRuntimeFallback,
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  hasPublishedInvocationBlockingSensitiveAccessSummary,
  normalizePublishedInvocationRunSnapshot,
  resolvePublishedInvocationRunFollowUpSampleView,
  resolvePublishedInvocationCallbackWaitingExplanation,
  resolvePublishedInvocationExecutionFocusExplanation
} from "@/lib/published-invocation-presenters";
import {
  buildOperatorRunDetailLinkSurface
} from "@/lib/operator-follow-up-presenters";
import {
  formatMetricSummary,
  listExecutionFocusRuntimeFactBadges
} from "@/lib/run-execution-focus-presenters";
import { buildSandboxReadinessNodeFromRunSnapshot } from "@/lib/sandbox-readiness-presenters";
import { formatDurationMs, formatTimestamp } from "@/lib/runtime-presenters";

type PublishedInvocationItem = PublishedEndpointInvocationListResponse["items"][number];

type WorkflowPublishInvocationEntryCardProps = {
  item: PublishedInvocationItem;
  detailHref: string;
  detailActive: boolean;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

function hasInvocationDrilldown(item: PublishedInvocationItem): boolean {
  return Boolean(
    item.error_message ||
      item.response_preview ||
      item.request_preview ||
      item.run_waiting_lifecycle ||
      item.finished_at
  );
}

export function WorkflowPublishInvocationEntryCard({
  item,
  detailHref,
  detailActive,
  sandboxReadiness
}: WorkflowPublishInvocationEntryCardProps) {
  const surfaceCopy = buildPublishedInvocationEntrySurfaceCopy();
  const waitingLifecycle = item.run_waiting_lifecycle;
  const scheduledResumeLabel =
    formatScheduledResumeLabel({
      scheduledResumeDelaySeconds: waitingLifecycle?.scheduled_resume_delay_seconds,
      scheduledResumeSource: waitingLifecycle?.scheduled_resume_source,
      scheduledWaitingStatus: waitingLifecycle?.scheduled_waiting_status,
      scheduledResumeScheduledAt: waitingLifecycle?.scheduled_resume_scheduled_at,
      scheduledResumeDueAt: waitingLifecycle?.scheduled_resume_due_at
    }) ?? "n/a";
  const waitingExplanation = resolvePublishedInvocationCallbackWaitingExplanation(item);
  const executionFocusExplanation = resolvePublishedInvocationExecutionFocusExplanation(item);
  const executionFocusPrimarySignal = executionFocusExplanation?.primary_signal?.trim() || null;
  const executionFocusFollowUp = executionFocusExplanation?.follow_up?.trim() || null;
  const waitingCardSurface = buildPublishedInvocationWaitingCardSurface({
    waitingLifecycle,
    waitingExplanation,
    callbackLifecycleFallback: surfaceCopy.callbackLifecycleFallback,
    surfaceCopy
  });
  const waitingChips = waitingCardSurface?.waitingChips ?? [];
  const waitingOverviewHeadline = waitingCardSurface?.headline ?? null;
  const waitingOverviewFollowUp = waitingCardSurface?.followUp ?? null;
  const sensitiveAccessChips = waitingCardSurface?.sensitiveAccessChips ?? [];
  const waitingBlockerRows = waitingCardSurface?.blockerRows ?? [];
  const sensitiveAccessRows = waitingCardSurface?.sensitiveAccessRows ?? [];
  const inboxHref = buildPublishedInvocationInboxHref({
    invocation: item,
    callbackTickets: [],
    sensitiveAccessEntries: []
  });
  const blockingInboxHref = hasPublishedInvocationBlockingSensitiveAccessSummary(
    waitingLifecycle?.sensitive_access_summary
  )
    ? buildBlockingPublishedInvocationInboxHref({
        runId: item.run_id ?? null,
        blockingNodeRunId: waitingLifecycle?.node_run_id ?? null,
        blockingSensitiveAccessEntries: []
      })
    : null;
  const primaryInboxLink = buildPublishedInvocationEntryInboxLinkSurface({
    blockingInboxHref,
    waitingInboxHref: inboxHref
  });
  const runFollowUp = item.run_follow_up;
  const runFollowUpStatusSummary = runFollowUp
    ? formatMetricSummary({
        waiting: runFollowUp.waiting_run_count,
        running: runFollowUp.running_run_count,
        succeeded: runFollowUp.succeeded_run_count,
        failed: runFollowUp.failed_run_count,
        unknown: runFollowUp.unknown_run_count
      })
    : null;
  const runFollowUpSample = resolvePublishedInvocationRunFollowUpSampleView(item);
  const runFollowUpSampleHasCallbackWaitingSummary =
    runFollowUpSample?.has_callback_waiting_summary ?? false;
  const shouldDeferToSharedCallbackWaitingSummary = runFollowUpSampleHasCallbackWaitingSummary;
  const sharedCallbackWaitingExplanation = runFollowUpSampleHasCallbackWaitingSummary
    ? runFollowUpSample?.run_snapshot.callbackWaitingExplanation ?? null
    : null;
  const canonicalFollowUp = buildPublishedInvocationCanonicalFollowUpCopy({
    explanation: runFollowUp?.explanation ?? null,
    sharedCallbackWaitingExplanations: sharedCallbackWaitingExplanation
      ? [sharedCallbackWaitingExplanation]
      : [],
    fallbackHeadline: surfaceCopy.canonicalFollowUpFallbackHeadline
  });
  const recommendedNextStep = buildPublishedInvocationRecommendedNextStep({
    runId: item.run_id ?? null,
    canonicalFollowUp,
    callbackWaitingFollowUp: waitingLifecycle ? waitingExplanation?.follow_up ?? null : null,
    executionFocusFollowUp,
    blockingInboxHref,
    approvalInboxHref: inboxHref
  });
  const runFollowUpSamplePrimarySignal = runFollowUpSample?.explanation?.primary_signal?.trim() || null;
  const runFollowUpSampleFocusNodeEvidence = runFollowUpSample
    ? buildExecutionFocusExplainableNode(runFollowUpSample.run_snapshot)
    : null;
  const runFollowUpSampleInboxHref = buildPublishedInvocationRunFollowUpSampleInboxHref(
    runFollowUpSample
  );
  const runSnapshot = normalizePublishedInvocationRunSnapshot(item.run_snapshot);
  const runSnapshotReadinessNode = buildSandboxReadinessNodeFromRunSnapshot(runSnapshot);
  const runFollowUpSampleReadinessNode = runFollowUpSample
    ? buildSandboxReadinessNodeFromRunSnapshot(runFollowUpSample.run_snapshot)
    : null;
  const readinessNode = runFollowUpSampleReadinessNode ?? runSnapshotReadinessNode;
  const runSnapshotExecutionFactBadges = listExecutionFocusRuntimeFactBadges(
    buildExecutionFocusExplainableNode(runSnapshot)
  );
  const sampledRunExecutionFactBadges = runFollowUpSampleFocusNodeEvidence
    ? listExecutionFocusRuntimeFactBadges(runFollowUpSampleFocusNodeEvidence)
    : [];
  const executionFactBadges =
    runSnapshotExecutionFactBadges.length > 0
      ? runSnapshotExecutionFactBadges
      : sampledRunExecutionFactBadges;
  const runStatus = runSnapshot?.status ?? item.run_status ?? null;
  const currentNodeId = runSnapshot?.currentNodeId ?? item.run_current_node_id ?? null;
  const waitingReason = runSnapshot?.waitingReason ?? item.run_waiting_reason ?? null;
  const entryMetaRows = listPublishedInvocationEntryMetaRows({
    invocation: item,
    runStatus,
    currentNodeId,
    waitingReason,
    scheduledResumeLabel,
    surfaceCopy
  });
  const waitingMetaRows = waitingCardSurface?.waitingRows ?? [];
  const runFollowUpEvidenceChips = runFollowUpSample
    ? listPublishedInvocationRunFollowUpEvidenceChips(runFollowUpSample)
    : [];

  return (
    <article className="payload-card compact-card">
      <div className="payload-card-header">
        <span className={`health-pill ${item.status}`}>{item.status}</span>
        <div className="tool-badge-row">
          <span className="event-chip">
            {formatPublishedInvocationCacheStatusLabel(item.cache_status)}
          </span>
          {item.reason_code ? (
            <span className="event-chip">{formatPublishedInvocationReasonLabel(item.reason_code)}</span>
          ) : null}
        </div>
      </div>
      <p className="binding-meta">
        {formatPublishedInvocationSurfaceLabel(item.request_surface)} · {item.request_source} ·{" "}
        {formatTimestamp(item.created_at)} · {formatDurationMs(item.duration_ms)}
      </p>
      {primaryInboxLink ? (
        <div className="tool-badge-row">
          <Link className="event-chip inbox-filter-link" href={primaryInboxLink.href}>
            {primaryInboxLink.label}
          </Link>
        </div>
      ) : null}
      <dl className="compact-meta-list">
        {entryMetaRows.map((row) => (
          <div key={`${item.id}-${row.key}`}>
            <dt>{row.label}</dt>
            <dd>
              {row.href ? (
                <Link className="inline-link" href={row.href}>
                  {row.value}
                </Link>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {executionFactBadges.length > 0 && !shouldDeferToSharedCallbackWaitingSummary ? (
        <div className="tool-badge-row">
          {executionFactBadges.map((badge) => (
            <span className="event-chip" key={`${item.id}-${badge}`}>
              {badge}
            </span>
          ))}
        </div>
      ) : null}
      {runFollowUp?.affected_run_count ? (
        <div className="payload-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">{surfaceCopy.canonicalFollowUpTitle}</span>
        </div>
          <p className="section-copy entry-copy">{canonicalFollowUp.headline}</p>
          {canonicalFollowUp.follow_up ? (
            <p className="binding-meta">{canonicalFollowUp.follow_up}</p>
          ) : null}
          <dl className="compact-meta-list">
            <div>
              <dt>{surfaceCopy.canonicalFollowUpAffectedRunsLabel}</dt>
              <dd>{runFollowUp.affected_run_count}</dd>
            </div>
            <div>
              <dt>{surfaceCopy.canonicalFollowUpSampledRunsLabel}</dt>
              <dd>{runFollowUp.sampled_run_count}</dd>
            </div>
            <div>
              <dt>{surfaceCopy.canonicalFollowUpStatusSummaryLabel}</dt>
              <dd>{runFollowUpStatusSummary ?? "n/a"}</dd>
            </div>
            <div>
              <dt>{surfaceCopy.canonicalFollowUpSampleFocusLabel}</dt>
              <dd>
                {(() => {
                  const runLink = buildOperatorRunDetailLinkSurface({
                    runId: runFollowUpSample?.run_id,
                    hrefLabel: runFollowUpSample?.run_id ?? null
                  });

                  return runLink ? (
                    <Link className="inline-link" href={runLink.href}>
                      {runLink.label}
                    </Link>
                  ) : (
                    "n/a"
                  );
                })()}
              </dd>
            </div>
          </dl>
          {runFollowUpSamplePrimarySignal && !runFollowUpSampleHasCallbackWaitingSummary ? (
            <p className="binding-meta">{runFollowUpSamplePrimarySignal}</p>
          ) : null}
          {runFollowUpSample?.snapshot_summary && !shouldDeferToSharedCallbackWaitingSummary ? (
            <p className="binding-meta">{runFollowUpSample.snapshot_summary}</p>
          ) : null}
          {readinessNode ? (
            <SandboxExecutionReadinessCard
              node={readinessNode}
              readiness={sandboxReadiness}
              title={surfaceCopy.liveSandboxReadinessTitle}
            />
          ) : null}
          {runFollowUpSample ? (
            <>
              {runFollowUpSample.execution_focus_artifact_count > 0 ||
              runFollowUpSample.execution_focus_artifact_ref_count > 0 ||
              runFollowUpSample.execution_focus_tool_call_count > 0 ||
              runFollowUpSample.execution_focus_raw_ref_count > 0 ||
              runFollowUpSample.skill_reference_count > 0 ? (
                <div className="tool-badge-row">
                  {runFollowUpEvidenceChips.map((chip) => (
                    <span className="event-chip" key={`${runFollowUpSample.run_id}-${chip}`}>
                      {chip}
                    </span>
                  ))}
                </div>
              ) : null}
              {runFollowUpSampleHasCallbackWaitingSummary ? (
                <CallbackWaitingSummaryCard
                  callbackWaitingExplanation={
                    runFollowUpSample.run_snapshot.callbackWaitingExplanation ?? null
                  }
                  callbackTickets={runFollowUpSample.callback_tickets}
                  lifecycle={runFollowUpSample.run_snapshot.callbackWaitingLifecycle ?? null}
                  focusNodeEvidence={runFollowUpSampleFocusNodeEvidence}
                  focusSkillReferenceCount={
                    runFollowUpSample.run_snapshot.executionFocusSkillTrace?.reference_count ?? 0
                  }
                  focusSkillReferenceLoads={
                    runFollowUpSample.run_snapshot.executionFocusSkillTrace?.loads ?? []
                  }
                  focusSkillReferenceNodeId={
                    runFollowUpSample.run_snapshot.executionFocusNodeId ?? null
                  }
                  focusSkillReferenceNodeName={
                    runFollowUpSample.run_snapshot.executionFocusNodeName ?? null
                  }
                  nodeRunId={runFollowUpSample.run_snapshot.executionFocusNodeRunId ?? null}
                  runId={runFollowUpSample.run_id}
                  scheduledResumeDelaySeconds={
                    runFollowUpSample.run_snapshot.scheduledResumeDelaySeconds ?? null
                  }
                  scheduledResumeDueAt={runFollowUpSample.run_snapshot.scheduledResumeDueAt ?? null}
                  scheduledResumeRequeuedAt={
                    runFollowUpSample.run_snapshot.scheduledResumeRequeuedAt ?? null
                  }
                  scheduledResumeRequeueSource={
                    runFollowUpSample.run_snapshot.scheduledResumeRequeueSource ?? null
                  }
                  scheduledResumeScheduledAt={
                    runFollowUpSample.run_snapshot.scheduledResumeScheduledAt ?? null
                  }
                  scheduledResumeSource={
                    runFollowUpSample.run_snapshot.scheduledResumeSource ?? null
                  }
                  scheduledWaitingStatus={
                    runFollowUpSample.run_snapshot.scheduledWaitingStatus ?? null
                  }
                  inboxHref={runFollowUpSampleInboxHref}
                  sensitiveAccessEntries={runFollowUpSample.sensitive_access_entries}
                  showFocusExecutionFacts={shouldDeferToSharedCallbackWaitingSummary}
                  showInlineActions={false}
                  waitingReason={runFollowUpSample.run_snapshot.waitingReason ?? null}
                />
              ) : (
                <>
                  <OperatorFocusEvidenceCard
                    title={surfaceCopy.sampledRunFocusEvidenceTitle}
                    artifactCount={runFollowUpSample.execution_focus_artifact_count}
                    artifactRefCount={runFollowUpSample.execution_focus_artifact_ref_count}
                    artifactSummary={runFollowUpSample.focus_artifact_summary}
                    artifacts={runFollowUpSample.focus_artifacts}
                    toolCallCount={runFollowUpSample.execution_focus_tool_call_count}
                    toolCallSummaries={runFollowUpSample.focus_tool_call_summaries}
                  />
                  <SkillReferenceLoadList
                    skillReferenceLoads={runFollowUpSample.focus_skill_reference_loads}
                    title={surfaceCopy.sampledRunSkillTraceTitle}
                    description={surfaceCopy.sampledRunSkillTraceDescription}
                  />
                </>
              )}
            </>
          ) : null}
        </div>
      ) : null}
      {recommendedNextStep ? (
        <div className="payload-card compact-card">
        <div className="payload-card-header">
            <span className="status-meta">{surfaceCopy.recommendedNextStepTitle}</span>
            <span className="event-chip">{recommendedNextStep.label}</span>
          </div>
          <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
          {recommendedNextStep.href && recommendedNextStep.href_label ? (
            <div className="tool-badge-row">
              <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                {recommendedNextStep.href_label}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {runStatus === "waiting" && !shouldDeferToSharedCallbackWaitingSummary ? (
        <>
          <p className="section-copy entry-copy">
            {executionFocusPrimarySignal ??
              formatPublishedInvocationWaitingRuntimeFallback({ currentNodeId, waitingReason })}
          </p>
          {executionFocusFollowUp ? <p className="binding-meta">{executionFocusFollowUp}</p> : null}
        </>
      ) : null}
      {waitingLifecycle ? (
        <div className="publish-meta-grid">
          <div className="payload-card compact-card">
            <div className="payload-card-header">
              <span className="status-meta">{surfaceCopy.waitingOverviewTitle}</span>
            </div>
            {!shouldDeferToSharedCallbackWaitingSummary ? (
              <p className="section-copy entry-copy">{waitingOverviewHeadline}</p>
            ) : null}
            {!shouldDeferToSharedCallbackWaitingSummary && waitingOverviewFollowUp ? (
              <p className="binding-meta">{waitingOverviewFollowUp}</p>
            ) : null}
            {!shouldDeferToSharedCallbackWaitingSummary &&
            (waitingChips.length || sensitiveAccessChips.length) ? (
              <p className="binding-meta">
                {[...waitingChips, ...sensitiveAccessChips].join(" · ")}
              </p>
            ) : null}
            <dl className="compact-meta-list">
              {waitingMetaRows.map((row) => (
                <div key={`${item.id}:${row.key}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
              {!shouldDeferToSharedCallbackWaitingSummary
                ? waitingBlockerRows.map((row) => (
                    <div key={`${item.id}:${row.label}`}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))
                : null}
              {!shouldDeferToSharedCallbackWaitingSummary
                ? sensitiveAccessRows.map((row) => (
                    <div key={`${item.id}:sensitive:${row.label}`}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))
                : null}
            </dl>
          </div>
        </div>
      ) : null}
      {item.run_status === "succeeded" ? (
        <p className="section-copy entry-copy">{surfaceCopy.succeededDescription}</p>
      ) : null}
      {item.error_message ? (
        <p className="section-copy entry-copy">
          {surfaceCopy.errorMessagePrefix}: {item.error_message}
        </p>
      ) : null}
      {hasInvocationDrilldown(item) ? (
        <div className="publish-invocation-actions">
          <Link className="inline-link" href={detailHref}>
            {detailActive ? surfaceCopy.detailActionActiveLabel : surfaceCopy.detailActionLabel}
          </Link>
          <span className="section-copy entry-copy">{surfaceCopy.detailPanelDescription}</span>
        </div>
      ) : null}
    </article>
  );
}
