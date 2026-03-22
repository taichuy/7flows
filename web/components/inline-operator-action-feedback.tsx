import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { OperatorRunSampleCardList } from "@/components/operator-run-sample-card-list";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { CallbackWaitingSummaryProps } from "@/lib/callback-waiting-summary-props";
import {
  buildOperatorInlineActionSampleInboxContext,
  buildExecutionFocusExplainableNode,
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineActionResultState
} from "@/lib/operator-inline-action-feedback";
import { formatRunSnapshotSummary } from "@/lib/operator-action-result-presenters";
import { buildOperatorRunSampleCards } from "@/lib/operator-run-sample-cards";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  buildOperatorRecommendedActionCandidate,
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRunDetailLinkSurface,
  buildOperatorRecommendedNextStep,
  buildSharedOrLocalOperatorCandidate,
  buildOperatorRunSnapshotMetaRows,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import { listExecutionFocusRuntimeFactBadges } from "@/lib/run-execution-focus-presenters";
import { buildSandboxReadinessNodeFromRunSnapshot } from "@/lib/sandbox-readiness-presenters";
import {
  buildCallbackWaitingAutomationFollowUpCandidate,
  buildSandboxReadinessFollowUpCandidate,
  shouldPreferSharedSandboxReadinessFollowUp
} from "@/lib/system-overview-follow-up-presenters";
import { buildRunDetailExecutionFocusSurfaceCopy } from "@/lib/workbench-entry-surfaces";

type InlineOperatorActionFeedbackProps = {
  status: "idle" | "success" | "error";
  message: string;
  title: string;
  runId?: string | null;
  recommendedNextStep?: OperatorRecommendedNextStep | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  callbackWaitingSummaryProps?: CallbackWaitingSummaryProps;
} & OperatorInlineActionResultState;

export function InlineOperatorActionFeedback({
  status,
  message,
  title,
  runId = null,
  recommendedNextStep: recommendedNextStepOverride,
  sandboxReadiness = null,
  callbackWaitingSummaryProps,
  ...structuredResult
}: InlineOperatorActionFeedbackProps) {
  const model = buildOperatorInlineActionFeedbackModel({
    message,
    ...structuredResult
  });
  const surfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const runFollowUp = structuredResult.runFollowUp ?? null;
  const runSnapshot = structuredResult.runSnapshot;
  const hasCallbackWaitingSummary = hasCallbackWaitingSummaryFacts(runSnapshot);
  const shouldDeferToSharedCallbackWaitingSummary = hasCallbackWaitingSummary;
  const callbackWaitingSnapshotSummary = hasCallbackWaitingSummary
    ? formatRunSnapshotSummary(runSnapshot ?? {})
    : null;
  const callbackWaitingFollowUp = runSnapshot?.callbackWaitingExplanation?.follow_up?.trim() || null;
  const callbackWaitingFocusNode = buildExecutionFocusExplainableNode(runSnapshot);
  const executionFactBadges = listExecutionFocusRuntimeFactBadges(callbackWaitingFocusNode);
  const sandboxReadinessNode = buildSandboxReadinessNodeFromRunSnapshot(runSnapshot);
  const executionSurfaceCopy = buildRunDetailExecutionFocusSurfaceCopy();
  const runDetailLink = buildOperatorRunDetailLinkSurface({ runId, surfaceCopy });
  const hasCanonicalRecommendedAction = Boolean(
    runFollowUp?.recommendedAction?.kind ||
      runFollowUp?.recommendedAction?.entryKey ||
      runFollowUp?.recommendedAction?.href ||
      runFollowUp?.recommendedAction?.label
  );
  const callbackFallbackDetail =
    "当前 operator 结果仍落在 callback waiting / approval blocker 链；优先回到 inbox slice 核对票据与 waiting 恢复。";
  const sharedCallbackRecoveryCandidate =
    !hasCanonicalRecommendedAction && (hasCallbackWaitingSummary || Boolean(callbackWaitingSummaryProps))
      ? buildCallbackWaitingAutomationFollowUpCandidate(
          callbackWaitingSummaryProps?.callbackWaitingAutomation,
          "callback recovery"
        )
      : null;
  const canonicalCallbackRecommendedAction =
    runFollowUp?.recommendedAction ?? callbackWaitingSummaryProps?.recommendedAction ?? null;
  const canonicalCallbackOperatorFollowUp =
    model.runFollowUpFollowUp ?? callbackWaitingSummaryProps?.operatorFollowUp ?? null;
  const preferCanonicalCallbackRecommendedNextStep =
    runFollowUp?.recommendedAction
      ? true
      : callbackWaitingSummaryProps?.preferCanonicalRecommendedNextStep ??
        Boolean(canonicalCallbackRecommendedAction);
  const hasExplicitRecommendedNextStepOverride = recommendedNextStepOverride !== undefined;
  const executionNeedsSharedSandboxFollowUp =
    Boolean(sandboxReadinessNode) &&
    shouldPreferSharedSandboxReadinessFollowUp({
      hasExecutionBlockingReason: Boolean(sandboxReadinessNode?.execution_blocking_reason),
      signals: [
        runSnapshot?.executionFocusExplanation?.primary_signal,
        runSnapshot?.executionFocusExplanation?.follow_up,
        model.runSnapshotSummary,
        model.runFollowUpFollowUp,
        runSnapshot?.executionFocusNodeType
      ]
    });
  const sharedSandboxCandidate = executionNeedsSharedSandboxFollowUp
    ? buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness")
    : null;
  const canonicalCallbackCandidate = buildOperatorRecommendedActionCandidate({
    action: runFollowUp?.recommendedAction ?? null,
    detail: model.runFollowUpFollowUp,
    fallbackDetail: callbackFallbackDetail,
    scope: "callback",
    surfaceCopy
  });
  const sampledCallbackInboxContext =
    !hasCanonicalRecommendedAction && !hasCallbackWaitingSummary
      ? buildOperatorInlineActionSampleInboxContext({
          runFollowUp,
          runId
        })
      : null;
  const sampledCallbackCandidate = sampledCallbackInboxContext
    ? buildOperatorRecommendedActionCandidate({
        action: {
          kind: sampledCallbackInboxContext.kind,
          entryKey: "operatorInbox",
          href: sampledCallbackInboxContext.href,
          label: sampledCallbackInboxContext.hrefLabel
        },
        detail: model.runFollowUpFollowUp,
        fallbackDetail: callbackFallbackDetail,
        scope: "callback",
        surfaceCopy
      })
    : null;
  const callbackCandidate = buildSharedOrLocalOperatorCandidate({
    sharedCandidate:
      canonicalCallbackCandidate ?? sharedCallbackRecoveryCandidate ?? sampledCallbackCandidate,
    active: hasCallbackWaitingSummary || Boolean(callbackWaitingSummaryProps),
    href: callbackWaitingSummaryProps?.inboxHref,
    runId,
    label: "callback waiting",
    detail: canonicalCallbackOperatorFollowUp,
    hrefLabel: callbackWaitingSummaryProps?.inboxHref ? surfaceCopy.openInboxSliceLabel : null,
    fallbackDetail: callbackFallbackDetail,
    surfaceCopy
  });
  const canonicalExecutionCandidate = buildOperatorRecommendedActionCandidate({
    action: runFollowUp?.recommendedAction ?? null,
    detail: model.runFollowUpFollowUp,
    fallbackDetail: model.runSnapshotSummary ?? executionSurfaceCopy.recommendedNextStepFallbackDetail,
    scope: "execution",
    surfaceCopy
  });
  const executionCandidate = buildSharedOrLocalOperatorCandidate({
    sharedCandidate: sharedSandboxCandidate ?? canonicalExecutionCandidate,
    active: Boolean(runId),
    runId,
    label: runId ? "run detail" : "execution follow-up",
    detail: model.runFollowUpFollowUp,
    fallbackDetail: model.runSnapshotSummary ?? executionSurfaceCopy.recommendedNextStepFallbackDetail,
    surfaceCopy
  });
  const recommendedNextStep =
    hasExplicitRecommendedNextStepOverride
      ? recommendedNextStepOverride
      : !hasCallbackWaitingSummary
      ? buildOperatorRecommendedNextStep({
          callback: callbackCandidate,
          execution: executionCandidate,
          operatorFollowUp: executionCandidate.active ? model.outcomeFollowUp : null,
          operatorLabel: "operator result"
        })
      : null;
  const shouldRenderOutcomeFollowUp =
    Boolean(model.outcomeFollowUp) && model.outcomeFollowUp !== recommendedNextStep?.detail;
  const shouldRenderRunFollowUpFollowUp =
    Boolean(model.runFollowUpFollowUp) &&
    model.runFollowUpFollowUp !== callbackWaitingFollowUp &&
    model.runFollowUpFollowUp !== recommendedNextStep?.detail;
  const snapshotMetaRows = buildOperatorRunSnapshotMetaRows({
    runStatus: model.runStatus,
    currentNodeId: model.currentNodeId,
    focusNodeLabel: model.focusNodeLabel,
    waitingReason: model.waitingReason,
    surfaceCopy
  });
  const sampledRunCards = buildOperatorRunSampleCards(
    (runFollowUp?.sampledRuns ?? []).filter(
      (sample) => sample.snapshot && (!runId || sample.runId !== runId || !runSnapshot)
    )
  );

  if (!message && !model.hasStructuredContent) {
    return null;
  }

  if (status !== "success" || !model.hasStructuredContent) {
    return message ? <p className={`sync-message ${status}`}>{message}</p> : null;
  }

  return (
    <div className="entry-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
        {runDetailLink ? (
          <Link className="event-chip inbox-filter-link" href={runDetailLink.href}>
            {runDetailLink.label}
          </Link>
        ) : null}
      </div>
      {model.headline && model.headline !== callbackWaitingSnapshotSummary ? (
        <p className="section-copy entry-copy">{model.headline}</p>
      ) : null}
      {recommendedNextStep ? (
        <div className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">{surfaceCopy.recommendedNextStepTitle}</span>
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
      {shouldRenderOutcomeFollowUp ? <p className="binding-meta">{model.outcomeFollowUp}</p> : null}
      {model.blockerDeltaSummary ? <p className="binding-meta">{model.blockerDeltaSummary}</p> : null}
      {model.runFollowUpPrimarySignal ? (
        <p className="section-copy entry-copy">{model.runFollowUpPrimarySignal}</p>
      ) : null}
      {shouldRenderRunFollowUpFollowUp ? (
        <p className="binding-meta">{model.runFollowUpFollowUp}</p>
      ) : null}
      {!hasCallbackWaitingSummary && model.runSnapshotSummary ? (
        <p className="binding-meta">{model.runSnapshotSummary}</p>
      ) : null}

      {snapshotMetaRows.length ? (
        <dl className="compact-meta-list">
          {snapshotMetaRows.map((row) => (
            <div key={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {model.artifactCount > 0 ||
      model.artifactRefCount > 0 ||
      model.toolCallCount > 0 ||
      model.rawRefCount > 0 ||
      model.skillReferenceCount > 0 ||
      executionFactBadges.length > 0 ? (
        <div className="tool-badge-row">
          {model.artifactCount > 0 ? (
            <span className="event-chip">artifacts {model.artifactCount}</span>
          ) : null}
          {model.artifactRefCount > 0 ? (
            <span className="event-chip">artifact refs {model.artifactRefCount}</span>
          ) : null}
          {model.toolCallCount > 0 ? (
            <span className="event-chip">tool calls {model.toolCallCount}</span>
          ) : null}
          {model.rawRefCount > 0 ? (
            <span className="event-chip">raw refs {model.rawRefCount}</span>
          ) : null}
          {model.skillReferenceCount > 0 ? (
            <span className="event-chip">skill refs {model.skillReferenceCount}</span>
          ) : null}
          {model.skillReferencePhaseSummary ? (
            <span className="event-chip">phases {model.skillReferencePhaseSummary}</span>
          ) : null}
          {model.skillReferenceSourceSummary ? (
            <span className="event-chip">sources {model.skillReferenceSourceSummary}</span>
          ) : null}
          {!shouldDeferToSharedCallbackWaitingSummary
            ? executionFactBadges.map((badge) => (
                <span className="event-chip" key={`run-snapshot-${badge}`}>
                  {badge}
                </span>
              ))
            : null}
        </div>
      ) : null}

      {sandboxReadinessNode ? (
        <SandboxExecutionReadinessCard
          node={sandboxReadinessNode}
          readiness={sandboxReadiness}
        />
      ) : null}

      {runFollowUp && runFollowUp.affectedRunCount > 0 ? (
        <div className="tool-badge-row">
          <span className="event-chip">affected runs {runFollowUp.affectedRunCount}</span>
          <span className="event-chip">sampled {runFollowUp.sampledRunCount}</span>
          {runFollowUp.waitingRunCount > 0 ? (
            <span className="event-chip">still waiting {runFollowUp.waitingRunCount}</span>
          ) : null}
          {runFollowUp.runningRunCount > 0 ? (
            <span className="event-chip">running {runFollowUp.runningRunCount}</span>
          ) : null}
          {runFollowUp.succeededRunCount > 0 ? (
            <span className="event-chip">succeeded {runFollowUp.succeededRunCount}</span>
          ) : null}
          {runFollowUp.failedRunCount > 0 ? (
            <span className="event-chip">failed {runFollowUp.failedRunCount}</span>
          ) : null}
          {runFollowUp.unknownRunCount > 0 ? (
            <span className="event-chip">unknown {runFollowUp.unknownRunCount}</span>
          ) : null}
        </div>
      ) : null}

      {hasCallbackWaitingSummary ? (
        <CallbackWaitingSummaryCard
          callbackWaitingExplanation={runSnapshot?.callbackWaitingExplanation ?? null}
          callbackTickets={callbackWaitingSummaryProps?.callbackTickets}
          callbackWaitingAutomation={callbackWaitingSummaryProps?.callbackWaitingAutomation ?? null}
          lifecycle={runSnapshot?.callbackWaitingLifecycle ?? null}
          focusNodeEvidence={callbackWaitingFocusNode}
          focusSkillReferenceCount={runSnapshot?.executionFocusSkillTrace?.reference_count ?? 0}
          focusSkillReferenceLoads={runSnapshot?.executionFocusSkillTrace?.loads ?? []}
          focusSkillReferenceNodeId={runSnapshot?.executionFocusNodeId ?? null}
          focusSkillReferenceNodeName={runSnapshot?.executionFocusNodeName ?? null}
          nodeRunId={runSnapshot?.executionFocusNodeRunId ?? null}
          runId={runId}
          scheduledResumeDelaySeconds={runSnapshot?.scheduledResumeDelaySeconds ?? null}
          scheduledResumeSource={runSnapshot?.scheduledResumeSource ?? null}
          scheduledWaitingStatus={runSnapshot?.scheduledWaitingStatus ?? null}
          scheduledResumeScheduledAt={runSnapshot?.scheduledResumeScheduledAt ?? null}
          scheduledResumeDueAt={runSnapshot?.scheduledResumeDueAt ?? null}
          scheduledResumeRequeuedAt={runSnapshot?.scheduledResumeRequeuedAt ?? null}
          scheduledResumeRequeueSource={runSnapshot?.scheduledResumeRequeueSource ?? null}
          showFocusExecutionFacts={shouldDeferToSharedCallbackWaitingSummary}
          showInlineActions={false}
          waitingReason={runSnapshot?.waitingReason ?? null}
          inboxHref={callbackWaitingSummaryProps?.inboxHref}
          recommendedAction={canonicalCallbackRecommendedAction}
          operatorFollowUp={canonicalCallbackOperatorFollowUp}
          preferCanonicalRecommendedNextStep={preferCanonicalCallbackRecommendedNextStep}
          sensitiveAccessEntries={callbackWaitingSummaryProps?.sensitiveAccessEntries}
          suppressSensitiveAccessContextRows={
            callbackWaitingSummaryProps?.suppressSensitiveAccessContextRows ?? false
          }
          showSensitiveAccessInlineActions={
            callbackWaitingSummaryProps?.showSensitiveAccessInlineActions ?? false
          }
        />
      ) : (
        <>
          <OperatorFocusEvidenceCard
            artifactCount={model.artifactCount}
            artifactRefCount={model.artifactRefCount}
            artifactSummary={model.focusArtifactSummary}
            artifacts={model.focusArtifacts}
            toolCallCount={model.toolCallCount}
            toolCallSummaries={model.focusToolCallSummaries}
          />
          <SkillReferenceLoadList
            skillReferenceLoads={model.focusSkillReferenceLoads}
            title={surfaceCopy.focusedSkillTraceTitle}
            description="当前 operator 结果会直接复用 focus node 的 compact skill trace，方便确认 agent 本轮实际加载了哪些参考资料。"
          />
        </>
      )}

      {sampledRunCards.length > 0 ? (
        <div className="binding-section">
          <p className="section-copy entry-copy">
            当前 action result 也会直接展开受影响 sampled run 的 compact snapshot，避免还要跳回
            run detail 才确认 waiting / scheduled resume 是否已经变化。
          </p>
          <OperatorRunSampleCardList
            cards={sampledRunCards}
            callbackWaitingSummaryProps={{
              recommendedAction: canonicalCallbackRecommendedAction,
              operatorFollowUp: canonicalCallbackOperatorFollowUp,
              preferCanonicalRecommendedNextStep: preferCanonicalCallbackRecommendedNextStep
            }}
            sandboxReadiness={sandboxReadiness}
            skillTraceDescription="当前 operator 结果会继续复用 sampled run focus node 的 compact skill trace，方便确认等待链路里实际加载了哪些参考资料。"
          />
        </div>
      ) : null}
    </div>
  );
}
