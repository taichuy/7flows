"use server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  formatCleanupResultMessage,
  formatOperatorOutcomeExplanationMessage
} from "@/lib/operator-action-result-presenters";
import {
  buildActionCallbackBlockerDeltaSummary,
  fetchScopedCallbackBlockerSnapshot
} from "./callback-blocker-action-summary";

import { revalidateOperatorFollowUpPaths } from "./operator-follow-up-revalidation";
import {
  fetchRunSnapshot,
  normalizeOperatorRunSnapshot,
  type OperatorRunSnapshotBody
} from "./run-snapshot";
import type { OperatorInlineActionResultState } from "@/lib/operator-inline-action-feedback";

export type CleanupRunCallbackTicketsState = OperatorInlineActionResultState & {
  status: "idle" | "success" | "error";
  message: string;
  scopeKey: string;
};

type CleanupRunCallbackTicketsResponseBody = {
  matched_count: number;
  expired_count: number;
  scheduled_resume_count: number;
  terminated_count: number;
  run_ids: string[];
  outcome_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  callback_blocker_delta?: {
    summary?: string | null;
  } | null;
  run_snapshot?: OperatorRunSnapshotBody | null;
  run_follow_up?: {
    explanation?: {
      primary_signal?: string | null;
      follow_up?: string | null;
    } | null;
  } | null;
};

export async function cleanupRunCallbackTickets(
  _: CleanupRunCallbackTicketsState,
  formData: FormData
): Promise<CleanupRunCallbackTicketsState> {
  const runId = String(formData.get("runId") ?? "").trim();
  const nodeRunId = String(formData.get("nodeRunId") ?? "").trim();
  const scopeKey = `${runId}:${nodeRunId}`;

  if (!runId) {
    return {
      status: "error",
      message: "缺少 callback cleanup 所需的 run 标识。",
      scopeKey
    };
  }

  try {
    const beforeBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
    });
    const response = await fetch(`${getApiBaseUrl()}/api/runs/callback-tickets/cleanup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: "operator_callback_cleanup",
        run_id: runId,
        node_run_id: nodeRunId || null,
        schedule_resumes: true
      }),
      cache: "no-store"
    });

    const body = (await response.json().catch(() => null)) as
      | ({ detail?: string } & Partial<CleanupRunCallbackTicketsResponseBody>)
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "callback cleanup 执行失败。",
        scopeKey
      };
    }

    const expiredCount = body?.expired_count ?? 0;
    const scheduledResumeCount = body?.scheduled_resume_count ?? 0;
    const terminatedCount = body?.terminated_count ?? 0;
    const matchedCount = body?.matched_count ?? 0;
    const runSnapshot =
      normalizeOperatorRunSnapshot(body?.run_snapshot) ?? (await fetchRunSnapshot(runId));
    revalidateOperatorFollowUpPaths({
      runIds: body?.run_ids?.length ? body.run_ids : [runId],
      workflowIds: [runSnapshot?.workflowId]
    });
    const afterBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
    });
    const blockerDeltaSummary = buildActionCallbackBlockerDeltaSummary({
      backendSummary: body?.callback_blocker_delta?.summary,
      before: beforeBlockers,
      after: afterBlockers
    });

    return {
      status: "success",
      message: formatOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        blockerDeltaSummary,
        runFollowUpExplanation: body?.run_follow_up?.explanation,
        runSnapshot,
        fallback: formatCleanupResultMessage({
          matchedCount,
          expiredCount,
          scheduledResumeCount,
          terminatedCount,
          blockerDeltaSummary,
          runFollowUpExplanation: body?.run_follow_up?.explanation,
          runSnapshot
        })
      }),
      outcomeExplanation: body?.outcome_explanation ?? null,
      runFollowUpExplanation: body?.run_follow_up?.explanation ?? null,
      blockerDeltaSummary,
      runSnapshot,
      scopeKey
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端执行 callback cleanup。",
      scopeKey
    };
  }
}
