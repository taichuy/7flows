import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import {
  buildExecutionFocusExplainableNode,
  buildOperatorInlineActionFeedbackModel,
  type OperatorInlineActionResultState
} from "@/lib/operator-inline-action-feedback";

type InlineOperatorActionFeedbackProps = {
  status: "idle" | "success" | "error";
  message: string;
  title: string;
  runId?: string | null;
} & OperatorInlineActionResultState;

export function InlineOperatorActionFeedback({
  status,
  message,
  title,
  runId = null,
  ...structuredResult
}: InlineOperatorActionFeedbackProps) {
  const model = buildOperatorInlineActionFeedbackModel({
    message,
    ...structuredResult
  });
  const runSnapshot = structuredResult.runSnapshot;
  const hasCallbackWaitingSummary = Boolean(
    runSnapshot?.callbackWaitingExplanation?.primary_signal?.trim() ||
      runSnapshot?.callbackWaitingExplanation?.follow_up?.trim() ||
      runSnapshot?.waitingReason?.trim()
  );
  const callbackWaitingFocusNode = buildExecutionFocusExplainableNode(runSnapshot);

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
      {model.headline ? <p className="section-copy entry-copy">{model.headline}</p> : null}
      {model.outcomeFollowUp ? <p className="binding-meta">{model.outcomeFollowUp}</p> : null}
      {model.blockerDeltaSummary ? <p className="binding-meta">{model.blockerDeltaSummary}</p> : null}
      {model.runFollowUpPrimarySignal ? (
        <p className="section-copy entry-copy">{model.runFollowUpPrimarySignal}</p>
      ) : null}
      {model.runFollowUpFollowUp ? <p className="binding-meta">{model.runFollowUpFollowUp}</p> : null}
      {model.runSnapshotSummary ? <p className="binding-meta">{model.runSnapshotSummary}</p> : null}

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
      model.skillReferenceCount > 0 ? (
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
        </div>
      ) : null}

      {hasCallbackWaitingSummary ? (
        <CallbackWaitingSummaryCard
          callbackWaitingExplanation={runSnapshot?.callbackWaitingExplanation ?? null}
          focusNodeEvidence={callbackWaitingFocusNode}
          focusSkillReferenceCount={runSnapshot?.executionFocusSkillTrace?.reference_count ?? 0}
          focusSkillReferenceLoads={runSnapshot?.executionFocusSkillTrace?.loads ?? []}
          focusSkillReferenceNodeId={runSnapshot?.executionFocusNodeId ?? null}
          focusSkillReferenceNodeName={runSnapshot?.executionFocusNodeName ?? null}
          nodeRunId={runSnapshot?.executionFocusNodeRunId ?? null}
          runId={runId}
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
    </div>
  );
}
