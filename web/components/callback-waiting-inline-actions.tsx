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
import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";

type CallbackWaitingInlineActionsProps = {
  runId: string | null;
  nodeRunId?: string | null;
  compact?: boolean;
  allowManualResume?: boolean;
  preferredAction?: "resume" | "cleanup" | null;
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
  allowManualResume = true,
  preferredAction = null,
  statusHint = null
}: CallbackWaitingInlineActionsProps) {
  const router = useRouter();
  const [cleanupState, cleanupAction] = useActionState(cleanupRunCallbackTickets, initialState);
  const [resumeState, resumeAction] = useActionState(resumeRun, initialResumeState);
  const scopeKey = `${runId ?? ""}:${nodeRunId ?? ""}`;

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
          立即尝试恢复
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
          title="恢复结果"
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
          处理过期 ticket 并尝试恢复
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
          title="Cleanup 结果"
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
      {compact ? <p className="entry-card-title">Callback actions</p> : null}
      {statusHint ? <p className="empty-state compact">{statusHint}</p> : null}
      {preferredAction === "resume" ? (
        <p className="empty-state compact">建议先手动恢复；若仍卡住，再处理过期 ticket。</p>
      ) : null}
      {preferredAction === "cleanup" ? (
        <p className="empty-state compact">建议先清理当前 slice 内的过期 ticket，再安排恢复。</p>
      ) : null}
      {orderedForms.map((form, index) =>
        form ? <div key={`${preferredAction ?? "default"}-${index}`}>{form}</div> : null
      )}
    </div>
  );
}
