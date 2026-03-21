import React from "react";
import Link from "next/link";

import { CallbackWaitingInlineActions } from "@/components/callback-waiting-inline-actions";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";
import type {
  CallbackWaitingLifecycleSummary,
  RunCallbackTicketItem,
  RunExecutionFocusExplanation,
  RunExecutionNodeItem,
  RunExecutionSkillTrace,
  SkillReferenceLoadItem
} from "@/lib/get-run-views";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { buildCallbackWaitingFocusSkillTraceModel } from "@/lib/callback-waiting-focus-skill-trace";
import {
  type ExecutionFocusArtifactLike,
  type ExecutionFocusToolCallLike,
  formatExecutionFocusArtifactSummary,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusRuntimeFactBadges,
  listExecutionFocusToolCallSummaries
} from "@/lib/run-execution-focus-presenters";
import {
  buildCallbackWaitingInlineActionStatusHint,
  buildCallbackWaitingInlineActionTitle,
  buildCallbackWaitingSummarySurfaceCopy,
  buildCallbackWaitingRecommendedNextStep,
  formatCallbackLifecycleLabel,
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  getCallbackWaitingHeadline,
  isObserveFirstCallbackWaitingAction,
  listCallbackWaitingBlockerRows,
  listCallbackWaitingChips,
  listCallbackWaitingOperatorStatuses,
  pickCallbackWaitingInlineSensitiveAccessEntry
} from "@/lib/callback-waiting-presenters";

type CallbackWaitingFocusNodeEvidence = {
  artifact_refs: string[];
  artifacts: ExecutionFocusArtifactLike[];
  tool_calls: ExecutionFocusToolCallLike[];
} &
  Partial<
    Pick<
      RunExecutionNodeItem,
      | "effective_execution_class"
      | "execution_executor_ref"
      | "execution_sandbox_backend_id"
      | "execution_sandbox_runner_kind"
    >
  >;

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
  actionNodeRunId?: string | null;
  focusNodeEvidence?: CallbackWaitingFocusNodeEvidence | null;
  focusSkillTrace?: RunExecutionSkillTrace | null;
  focusSkillReferenceLoads?: SkillReferenceLoadItem[];
  focusSkillReferenceCount?: number | null;
  focusSkillReferenceNodeId?: string | null;
  focusSkillReferenceNodeName?: string | null;
  showFocusExecutionFacts?: boolean;
  showInlineActions?: boolean;
  showSensitiveAccessInlineActions?: boolean;
  showCallbackInlineActions?: boolean;
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
  actionNodeRunId = null,
  focusNodeEvidence,
  focusSkillTrace,
  focusSkillReferenceLoads = [],
  focusSkillReferenceCount = null,
  focusSkillReferenceNodeId = null,
  focusSkillReferenceNodeName = null,
  showFocusExecutionFacts = false,
  showInlineActions = true,
  showSensitiveAccessInlineActions,
  showCallbackInlineActions,
  className = ""
}: CallbackWaitingSummaryCardProps) {
  const surfaceCopy = buildCallbackWaitingSummarySurfaceCopy();
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
  const inlineActionNodeRunId = actionNodeRunId ?? nodeRunId ?? null;
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
  const recommendedNextStep = buildCallbackWaitingRecommendedNextStep({
    action: recommendedAction,
    inboxHref,
    operatorFollowUp: callbackFollowUp,
    surfaceCopy
  });
  const shouldShowSensitiveAccessInlineActions =
    showSensitiveAccessInlineActions ?? showInlineActions;
  const isObserveFirstRecommendedAction = isObserveFirstCallbackWaitingAction(
    recommendedAction?.kind ?? null
  );
  const shouldHideCallbackInlineActionsByDefault =
    recommendedAction?.kind === "resolve_inline_sensitive_access" ||
    recommendedAction?.kind === "open_inbox";
  const shouldShowCallbackInlineActions =
    showCallbackInlineActions ??
    (showInlineActions && !shouldHideCallbackInlineActionsByDefault);
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
  const callbackInlineActionTitle = buildCallbackWaitingInlineActionTitle({
    actionKind: recommendedAction?.kind ?? null,
    surfaceCopy
  });
  const inlineStatusHint = buildCallbackWaitingInlineActionStatusHint({
    actionKind: recommendedAction?.kind ?? null,
    preferredAction: preferredInlineAction,
    surfaceCopy
  });
  const shouldRenderStandaloneCallbackFollowUp =
    Boolean(callbackFollowUp) && callbackFollowUp !== recommendedNextStep?.detail;
  const recommendedNextStepHrefLabel = recommendedNextStep?.href_label ?? null;
  const inboxLinkLabel =
    recommendedNextStep?.href === inboxHref && recommendedNextStepHrefLabel
      ? recommendedNextStepHrefLabel
      : surfaceCopy.defaultInboxLinkLabel;
  const focusToolCallSummaries = focusNodeEvidence
    ? listExecutionFocusToolCallSummaries(focusNodeEvidence)
    : [];
  const focusArtifactSummary = focusNodeEvidence
    ? formatExecutionFocusArtifactSummary(focusNodeEvidence)
    : null;
  const focusArtifacts = focusNodeEvidence
    ? listExecutionFocusArtifactPreviews(focusNodeEvidence)
    : [];
  const focusExecutionFactBadges =
    showFocusExecutionFacts && focusNodeEvidence
      ? listExecutionFocusRuntimeFactBadges(focusNodeEvidence)
      : [];
  const focusSkillTraceModel = buildCallbackWaitingFocusSkillTraceModel({
    skillTrace: focusSkillTrace,
    fallbackNodeRunId: nodeRunId,
    fallbackNodeId: focusSkillReferenceNodeId,
    fallbackNodeName: focusSkillReferenceNodeName,
    fallbackLoads: focusSkillReferenceLoads,
    fallbackReferenceCount: focusSkillReferenceCount
  });
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
              {inboxLinkLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
      {!chips.length && inboxHref ? (
        <div className="event-type-strip">
          <Link className="event-chip inbox-filter-link" href={inboxHref}>
            {inboxLinkLabel}
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
      {shouldRenderStandaloneCallbackFollowUp ? (
        <p className="section-copy entry-copy">{callbackFollowUp}</p>
      ) : null}
      {recommendedAction && recommendedNextStep ? (
        <div className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{surfaceCopy.recommendedNextStepTitle}</span>
            <span className="event-chip">{recommendedNextStep.label}</span>
            {isObserveFirstRecommendedAction ? (
              <span className="event-chip">{surfaceCopy.manualOverrideOptionalLabel}</span>
            ) : null}
            {recommendedNextStep.href && recommendedNextStep.href_label ? (
              <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                {recommendedNextStep.href_label}
              </Link>
            ) : null}
          </div>
          <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
          {isObserveFirstRecommendedAction && shouldShowCallbackInlineActions ? (
            <p className="binding-meta">{surfaceCopy.optionalOverrideDescription}</p>
          ) : null}
        </div>
      ) : null}
      {focusExecutionFactBadges.length ? (
        <div className="tool-badge-row">
          {focusExecutionFactBadges.map((badge) => (
            <span className="event-chip" key={badge}>
              {badge}
            </span>
          ))}
        </div>
      ) : null}
      {focusNodeEvidence ? (
        <OperatorFocusEvidenceCard
          title={surfaceCopy.waitingNodeFocusEvidenceTitle}
          artifactCount={focusNodeEvidence.artifacts.length}
          artifactRefCount={focusNodeEvidence.artifact_refs.length}
          artifactSummary={focusArtifactSummary}
          artifacts={focusArtifacts}
          toolCallCount={focusNodeEvidence.tool_calls.length}
          toolCallSummaries={focusToolCallSummaries}
        />
      ) : null}
      {focusSkillTraceModel ? (
        <div className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{surfaceCopy.focusedSkillTraceTitle}</span>
            <span className="event-chip">refs {focusSkillTraceModel.referenceCount}</span>
          </div>
          <p className="section-copy entry-copy">
            {focusSkillTraceModel.source === "execution_focus_node"
              ? surfaceCopy.executionFocusSkillTraceDescription
              : focusSkillTraceModel.source === "run"
                ? surfaceCopy.runFallbackSkillTraceDescription
                : surfaceCopy.inlineLoadsSkillTraceDescription}
          </p>
          <div className="tool-badge-row">
            {focusSkillTraceModel.phaseSummary ? (
              <span className="event-chip">phases {focusSkillTraceModel.phaseSummary}</span>
            ) : null}
            {focusSkillTraceModel.sourceSummary ? (
              <span className="event-chip">sources {focusSkillTraceModel.sourceSummary}</span>
            ) : null}
          </div>
          {focusSkillTraceModel.nodes.map((node) => (
            <div key={node.key}>
              <p className="section-copy entry-copy">
                {node.label} · node run {node.nodeRunId}
              </p>
              <SkillReferenceLoadList
                skillReferenceLoads={node.loads}
                title={surfaceCopy.injectedReferencesTitle}
                description={surfaceCopy.injectedReferencesDescription}
              />
            </div>
          ))}
        </div>
      ) : null}
      {hasTermination ? (
        <p className="run-error-message">
          {surfaceCopy.terminatedLabel}
          {lifecycle?.termination_reason ? ` · ${lifecycle.termination_reason}` : ""}
          {terminationAt !== "n/a" ? ` · ${terminationAt}` : ""}
        </p>
      ) : null}
      {shouldShowSensitiveAccessInlineActions && inlineSensitiveAccessEntry ? (
        <SensitiveAccessInlineActions
          compact
          nodeRunId={
            inlineSensitiveAccessEntry.approval_ticket?.node_run_id ?? inlineActionNodeRunId
          }
          notifications={inlineSensitiveAccessEntry.notifications}
          runId={runId ?? null}
          ticket={inlineSensitiveAccessEntry.approval_ticket}
        />
      ) : null}
      {shouldShowCallbackInlineActions ? (
        <CallbackWaitingInlineActions
          allowManualResume={!hasTermination}
          compact
          nodeRunId={inlineActionNodeRunId}
          preferredAction={preferredInlineAction}
          recommendedActionKind={recommendedAction?.kind ?? null}
          runId={runId ?? null}
          title={callbackInlineActionTitle}
          statusHint={inlineStatusHint}
        />
      ) : null}
    </div>
  );
}
