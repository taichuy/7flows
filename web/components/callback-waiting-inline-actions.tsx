"use client";

import React from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  cleanupRunCallbackTickets,
  type CleanupRunCallbackTicketsState
} from "@/app/actions/callback-tickets";
import { resumeRun, type ResumeRunState } from "@/app/actions/runs";
import {
  getCleanupExpectationCopy,
  getManualResumeExpectationCopy
} from "@/lib/operator-action-result-presenters";
import {
  buildCallbackWaitingInlineActionStatusHint,
  buildCallbackWaitingInlineActionTitle,
  buildCallbackWaitingSummarySurfaceCopy,
  type CallbackWaitingInlineActionPreference,
  type CallbackWaitingRecommendedAction
} from "@/lib/callback-waiting-presenters";
import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";

type CallbackWaitingInlineActionsProps = {
  runId: string | null;
  nodeRunId?: string | null;
  compact?: boolean;
  title?: string;
  allowManualResume?: boolean;
  preferredAction?: CallbackWaitingInlineActionPreference;
  recommendedActionKind?: CallbackWaitingRecommendedAction["kind"] | null;
  statusHint?: string | null;
};

const initialState: CleanupRunCallbackTicketsState = {
  status: "idle",
  message: "",
  scopeKey: ""
};

const initialResumeState: ResumeRunState = {
  status: "idle",
  message: "",
  runId: ""
};

export function CallbackWaitingInlineActions({
  runId,
  nodeRunId = null,
  compact = false,
  title,
  allowManualResume = true,
  preferredAction = null,
  recommendedActionKind = null,
  statusHint = null
}: CallbackWaitingInlineActionsProps) {
  const surfaceCopy = buildCallbackWaitingSummarySurfaceCopy();
  const router = useRouter();
  const [cleanupState, cleanupAction] = useActionState(cleanupRunCallbackTickets, initialState);
  const [resumeState, resumeAction] = useActionState(resumeRun, initialResumeState);
  const scopeKey = `${runId ?? ""}:${nodeRunId ?? ""}`;
  const resolvedTitle =
    title ??
    buildCallbackWaitingInlineActionTitle({
      actionKind: recommendedActionKind,
      surfaceCopy
    });
  const resolvedStatusHint =
    statusHint ??
    buildCallbackWaitingInlineActionStatusHint({
      actionKind: recommendedActionKind,
      preferredAction,
      surfaceCopy
    });

  useEffect(() => {
    if (cleanupState.status === "success" || resumeState.status === "success") {
      router.refresh();
    }
  }, [cleanupState.status, resumeState.status, router]);

  if (!runId) {
    return null;
  }

  const resumeForm = allowManualResume ? (
    <form action={resumeAction} className="inbox-decision-form">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="nodeRunId" value={nodeRunId ?? ""} />
      <input type="hidden" name="reason" value="operator_manual_resume_attempt" />
      <div className="binding-actions">
        <button className="action-link-button" type="submit">
          {surfaceCopy.manualResumeActionLabel}
        </button>
      </div>
      <p className="empty-state compact">{getManualResumeExpectationCopy()}</p>
      {resumeState.message && resumeState.runId === runId ? (
        <InlineOperatorActionFeedback
          message={resumeState.message}
          outcomeExplanation={resumeState.outcomeExplanation}
          runFollowUpExplanation={resumeState.runFollowUpExplanation}
          runFollowUp={resumeState.runFollowUp}
          blockerDeltaSummary={resumeState.blockerDeltaSummary}
          runId={runId}
          runSnapshot={resumeState.runSnapshot}
          status={resumeState.status}
          title={surfaceCopy.manualResumeResultTitle}
        />
      ) : null}
    </form>
  ) : null;

  const cleanupForm = (
    <form action={cleanupAction} className="inbox-decision-form">
      <input type="hidden" name="runId" value={runId} />
      <input type="hidden" name="nodeRunId" value={nodeRunId ?? ""} />
      <div className="binding-actions">
        <button className="action-link-button" type="submit">
          {surfaceCopy.cleanupActionLabel}
        </button>
      </div>
      <p className="empty-state compact">{getCleanupExpectationCopy()}</p>
      {cleanupState.message && cleanupState.scopeKey === scopeKey ? (
        <InlineOperatorActionFeedback
          message={cleanupState.message}
          outcomeExplanation={cleanupState.outcomeExplanation}
          runFollowUpExplanation={cleanupState.runFollowUpExplanation}
          runFollowUp={cleanupState.runFollowUp}
          blockerDeltaSummary={cleanupState.blockerDeltaSummary}
          runId={runId}
          runSnapshot={cleanupState.runSnapshot}
          status={cleanupState.status}
          title={surfaceCopy.cleanupResultTitle}
        />
      ) : null}
    </form>
  );

  const orderedForms =
    preferredAction === "cleanup"
      ? [cleanupForm, resumeForm]
      : preferredAction === "resume"
        ? [resumeForm, cleanupForm]
        : [resumeForm, cleanupForm];

  return (
    <div className={compact ? "entry-card compact-card" : undefined}>
      {compact ? <p className="entry-card-title">{resolvedTitle}</p> : null}
      {resolvedStatusHint ? <p className="empty-state compact">{resolvedStatusHint}</p> : null}
      {orderedForms.map((form, index) =>
        form ? <div key={`${preferredAction ?? "default"}-${index}`}>{form}</div> : null
      )}
    </div>
  );
}
