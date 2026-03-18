"use server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  fetchCallbackBlockerSnapshot,
  formatCallbackBlockerDeltaSummary
} from "@/lib/callback-blocker-follow-up";
import { getSystemOverview } from "@/lib/get-system-overview";
import { formatCleanupResultMessage } from "@/lib/operator-action-result-presenters";

import { revalidateOperatorFollowUpPaths } from "./operator-follow-up-revalidation";
import { fetchRunSnapshot } from "./run-snapshot";

export type CleanupRunCallbackTicketsState = {
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
    const beforeAutomation = (await getSystemOverview()).callback_waiting_automation;
    const beforeBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation: beforeAutomation
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
    const runSnapshot = await fetchRunSnapshot(runId);
    revalidateOperatorFollowUpPaths({
      runIds: body?.run_ids?.length ? body.run_ids : [runId],
      workflowIds: [runSnapshot?.workflowId]
    });
    const afterAutomation = (await getSystemOverview()).callback_waiting_automation;
    const afterBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation: afterAutomation
    });

    return {
      status: "success",
      message: formatCleanupResultMessage({
        matchedCount,
        expiredCount,
        scheduledResumeCount,
        terminatedCount,
        blockerDeltaSummary: formatCallbackBlockerDeltaSummary({
          before: beforeBlockers,
          after: afterBlockers
        }),
        runFollowUpExplanation: body?.run_follow_up?.explanation,
        runSnapshot
      }),
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
