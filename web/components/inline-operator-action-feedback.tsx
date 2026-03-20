import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { OperatorRunSampleCardList } from "@/components/operator-run-sample-card-list";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import {
  buildExecutionFocusExplainableNode,
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineActionResultState
} from "@/lib/operator-inline-action-feedback";
import { formatRunSnapshotSummary } from "@/lib/operator-action-result-presenters";
import { buildOperatorRunSampleCards } from "@/lib/operator-run-sample-cards";
import { hasCallbackWaitingSummaryFacts } from "@/lib/callback-waiting-facts";
import {
  buildOperatorRecommendedNextStep,
  type OperatorRecommendedNextStep
} from "@/lib/operator-follow-up-presenters";
import { listExecutionFocusRuntimeFactBadges } from "@/lib/run-execution-focus-presenters";

type InlineOperatorActionFeedbackProps = {
  status: "idle" | "success" | "error";
  message: string;
  title: string;
  runId?: string | null;
  recommendedNextStep?: OperatorRecommendedNextStep | null;
} & OperatorInlineActionResultState;

export function InlineOperatorActionFeedback({
  status,
  message,
  title,
  runId = null,
  recommendedNextStep: recommendedNextStepOverride = null,
  ...structuredResult
}: InlineOperatorActionFeedbackProps) {
  const model = buildOperatorInlineActionFeedbackModel({
    message,
    ...structuredResult
  });
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
  const recommendedNextStep =
    recommendedNextStepOverride ??
    (!hasCallbackWaitingSummary
      ? buildOperatorRecommendedNextStep({
          execution: {
            active: Boolean(
              runId || model.runFollowUpFollowUp || model.runSnapshotSummary || model.focusNodeLabel
            ),
            label: runId ? "run detail" : "execution follow-up",
            detail: model.runFollowUpFollowUp,
            href: runId ? `/runs/${encodeURIComponent(runId)}` : null,
            href_label: runId ? "open run" : null,
            fallback_detail:
              model.runSnapshotSummary ??
              "当前 operator action 已返回新的 run snapshot；优先回到 run detail 确认 waiting、focus node 与最新执行证据。"
          },
          operatorFollowUp: model.outcomeFollowUp,
          operatorLabel: "operator result"
        })
      : null);
  const shouldRenderOutcomeFollowUp =
    Boolean(model.outcomeFollowUp) && model.outcomeFollowUp !== recommendedNextStep?.detail;
  const shouldRenderRunFollowUpFollowUp =
    Boolean(model.runFollowUpFollowUp) &&
    model.runFollowUpFollowUp !== callbackWaitingFollowUp &&
    model.runFollowUpFollowUp !== recommendedNextStep?.detail;
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
        {runId ? (
          <Link className="event-chip inbox-filter-link" href={`/runs/${encodeURIComponent(runId)}`}>
            open run
          </Link>
        ) : null}
      </div>
      {model.headline && model.headline !== callbackWaitingSnapshotSummary ? (
        <p className="section-copy entry-copy">{model.headline}</p>
      ) : null}
      {recommendedNextStep ? (
        <div className="entry-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">Recommended next step</span>
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

      {model.runStatus || model.currentNodeId || model.focusNodeLabel || model.waitingReason ? (
        <dl className="compact-meta-list">
          <div>
            <dt>Run status</dt>
            <dd>{model.runStatus ?? "n/a"}</dd>
          </div>
          <div>
            <dt>Current node</dt>
            <dd>{model.currentNodeId ?? "n/a"}</dd>
          </div>
          <div>
            <dt>Focus node</dt>
            <dd>{model.focusNodeLabel ?? "n/a"}</dd>
          </div>
          <div>
            <dt>Waiting reason</dt>
            <dd>{model.waitingReason ?? "n/a"}</dd>
          </div>
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
            title="Focused skill trace"
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
            skillTraceDescription="当前 operator 结果会继续复用 sampled run focus node 的 compact skill trace，方便确认等待链路里实际加载了哪些参考资料。"
          />
        </div>
      ) : null}
    </div>
  );
}
