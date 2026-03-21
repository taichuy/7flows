import React from "react";
import Link from "next/link";

import { CallbackWaitingSummaryCard } from "@/components/callback-waiting-summary-card";
import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type { OperatorRunSampleCard } from "@/lib/operator-run-sample-cards";
import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRunDetailLinkSurface,
  buildOperatorRunSnapshotMetaRows
} from "@/lib/operator-follow-up-presenters";

type OperatorRunSampleCardListProps = {
  cards: OperatorRunSampleCard[];
  skillTraceDescription: string;
};

export function OperatorRunSampleCardList({
  cards,
  skillTraceDescription
}: OperatorRunSampleCardListProps) {
  const surfaceCopy = buildOperatorFollowUpSurfaceCopy();

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="publish-cache-list">
      {cards.map((sample) => {
        const showHeaderExecutionFacts =
          sample.executionFactBadges.length > 0 && !sample.hasCallbackWaitingSummary;
        const runDetailLink = buildOperatorRunDetailLinkSurface({
          runId: sample.runId,
          surfaceCopy
        });
        const snapshotMetaRows = buildOperatorRunSnapshotMetaRows({
          runStatus: sample.runStatus,
          currentNodeId: sample.currentNodeId,
          focusNodeLabel: sample.focusNodeLabel,
          waitingReason: sample.waitingReason,
          surfaceCopy
        });

        return (
          <div className="payload-card compact-card" key={sample.runId}>

          <div className="payload-card-header">
            <span className="status-meta">{surfaceCopy.runTitlePrefix} {sample.shortRunId}</span>
            {runDetailLink ? (
              <Link className="event-chip inbox-filter-link" href={runDetailLink.href}>
                {runDetailLink.label}
              </Link>
            ) : null}
          </div>

          {sample.summary && !sample.hasCallbackWaitingSummary ? (
            <p className="binding-meta">{sample.summary}</p>
          ) : null}

          {snapshotMetaRows.length ? (
            <dl className="compact-meta-list">
              {snapshotMetaRows.map((row) => (
                <div key={`${sample.runId}:${row.key}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {showHeaderExecutionFacts ? (
            <div className="tool-badge-row">
              {sample.executionFactBadges.map((badge) => (
                <span className="event-chip" key={`${sample.runId}-${badge}`}>
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          <CallbackWaitingSummaryCard
            callbackWaitingExplanation={sample.callbackWaitingExplanation}
            lifecycle={sample.callbackWaitingLifecycle}
            focusNodeEvidence={sample.callbackWaitingFocusNodeEvidence}
            focusSkillReferenceCount={sample.skillReferenceCount}
            focusSkillReferenceLoads={sample.focusSkillReferenceLoads}
            focusSkillReferenceNodeId={sample.focusNodeId}
            focusSkillReferenceNodeName={sample.focusNodeLabel}
            nodeRunId={sample.focusNodeRunId}
            runId={sample.runId}
            scheduledResumeDelaySeconds={sample.scheduledResumeDelaySeconds}
            scheduledResumeDueAt={sample.scheduledResumeDueAt}
            scheduledResumeRequeuedAt={sample.scheduledResumeRequeuedAt}
            scheduledResumeRequeueSource={sample.scheduledResumeRequeueSource}
            scheduledResumeScheduledAt={sample.scheduledResumeScheduledAt}
            scheduledResumeSource={sample.scheduledResumeSource}
            scheduledWaitingStatus={sample.scheduledWaitingStatus}
            showFocusExecutionFacts={sample.hasCallbackWaitingSummary}
            showInlineActions={false}
            waitingReason={sample.waitingReason}
          />

          {sample.artifactCount > 0 ||
          sample.artifactRefCount > 0 ||
          sample.toolCallCount > 0 ||
          sample.rawRefCount > 0 ||
          sample.skillReferenceCount > 0 ? (
            <div className="tool-badge-row">
              {sample.artifactCount > 0 ? (
                <span className="event-chip">artifacts {sample.artifactCount}</span>
              ) : null}
              {sample.artifactRefCount > 0 ? (
                <span className="event-chip">artifact refs {sample.artifactRefCount}</span>
              ) : null}
              {sample.toolCallCount > 0 ? (
                <span className="event-chip">tool calls {sample.toolCallCount}</span>
              ) : null}
              {sample.rawRefCount > 0 ? (
                <span className="event-chip">raw refs {sample.rawRefCount}</span>
              ) : null}
              {sample.skillReferenceCount > 0 ? (
                <span className="event-chip">skill refs {sample.skillReferenceCount}</span>
              ) : null}
              {sample.skillReferencePhaseSummary ? (
                <span className="event-chip">phases {sample.skillReferencePhaseSummary}</span>
              ) : null}
              {sample.skillReferenceSourceSummary ? (
                <span className="event-chip">sources {sample.skillReferenceSourceSummary}</span>
              ) : null}
            </div>
          ) : null}

          {!sample.hasCallbackWaitingSummary ? (
            <>
              <OperatorFocusEvidenceCard
                artifactCount={sample.artifactCount}
                artifactRefCount={sample.artifactRefCount}
                artifactSummary={sample.focusArtifactSummary}
                artifacts={sample.focusArtifacts}
                toolCallCount={sample.toolCallCount}
                toolCallSummaries={sample.focusToolCallSummaries}
              />
              <SkillReferenceLoadList
                skillReferenceLoads={sample.focusSkillReferenceLoads}
                title={surfaceCopy.focusedSkillTraceTitle}
                description={skillTraceDescription}
              />
            </>
          ) : null}
          </div>
        );
      })}
    </div>
  );
}
