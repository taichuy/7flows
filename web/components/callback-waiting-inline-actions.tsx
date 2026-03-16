"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  cleanupRunCallbackTickets,
  type CleanupRunCallbackTicketsState
} from "@/app/actions/callback-tickets";
import { resumeRun, type ResumeRunState } from "@/app/actions/runs";

type CallbackWaitingInlineActionsProps = {
  runId: string | null;
  nodeRunId?: string | null;
  compact?: boolean;
  allowManualResume?: boolean;
  preferredAction?: "resume" | "cleanup" | null;
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
  preferredAction = null
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
      <input type="hidden" name="reason" value="operator_manual_resume_attempt" />
      <div className="binding-actions">
        <button className="action-link-button" type="submit">
          立即尝试恢复
        </button>
      </div>
      <p className="empty-state compact">适用于审批已处理后立即重试，避免只依赖定时恢复。</p>
      {resumeState.message && resumeState.runId === runId ? (
        <p className={`sync-message ${resumeState.status}`}>{resumeState.message}</p>
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
      <p className="empty-state compact">
        仅处理当前 run / node slice 下已过期的 callback ticket，不会扫全局批次。
      </p>
      {cleanupState.message && cleanupState.scopeKey === scopeKey ? (
        <p className={`sync-message ${cleanupState.status}`}>{cleanupState.message}</p>
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
