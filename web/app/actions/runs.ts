"use server";

import {
  fetchCallbackBlockerSnapshot,
  formatCallbackAutomationHealthDeltaSummary
} from "@/lib/callback-blocker-follow-up";
import {
  formatManualResumeResultMessage,
  formatOperatorOutcomeExplanationMessage
} from "@/lib/operator-action-result-presenters";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { getSystemOverview } from "@/lib/get-system-overview";

import { revalidateOperatorFollowUpPaths } from "./operator-follow-up-revalidation";
import { fetchRunSnapshot } from "./run-snapshot";

export type ResumeRunState = {
  status: "idle" | "success" | "error";
  message: string;
  runId: string;
};

const INITIAL_REASON = "operator_manual_resume_attempt";
const INITIAL_SOURCE = "operator_callback_resume";

function joinUniqueMessageParts(parts: Array<string | null | undefined>) {
  const normalized: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed || normalized.includes(trimmed)) {
      continue;
    }
    normalized.push(trimmed);
  }
  return normalized.join(" ");
}

export async function resumeRun(
  _: ResumeRunState,
  formData: FormData
): Promise<ResumeRunState> {
  const runId = String(formData.get("runId") ?? "").trim();
  const nodeRunId = String(formData.get("nodeRunId") ?? "").trim();
  const reason = String(formData.get("reason") ?? INITIAL_REASON).trim() || INITIAL_REASON;

  if (!runId) {
    return {
      status: "error",
      message: "缺少恢复 run 所需的标识。",
      runId
    };
  }

  try {
    const beforeAutomation = (await getSystemOverview()).callback_waiting_automation;
    const beforeBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation: beforeAutomation
    });
    const response = await fetch(`${getApiBaseUrl()}/api/runs/${runId}/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: INITIAL_SOURCE,
        reason
      }),
      cache: "no-store"
    });

    const body = (await response.json().catch(() => null)) as
      | {
          detail?: string;
          run?: {
            workflow_id?: string | null;
            status?: string | null;
            current_node_id?: string | null;
          } | null;
          outcome_explanation?: {
            primary_signal?: string | null;
            follow_up?: string | null;
          } | null;
          run_follow_up?: {
            explanation?: {
              primary_signal?: string | null;
              follow_up?: string | null;
            } | null;
          } | null;
          callback_blocker_delta?: {
            summary?: string | null;
          } | null;
        }
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "手动恢复执行失败。",
        runId
      };
    }

    const runSnapshot = await fetchRunSnapshot(runId);
    revalidateOperatorFollowUpPaths({
      runIds: [runId],
      workflowIds: [runSnapshot?.workflowId]
    });
    const afterAutomation = (await getSystemOverview()).callback_waiting_automation;
    const afterBlockers = await fetchCallbackBlockerSnapshot({
      runId,
      nodeRunId: nodeRunId || null,
      callbackWaitingAutomation: afterAutomation
    });
    const automationDeltaSummary = formatCallbackAutomationHealthDeltaSummary({
      before: beforeBlockers,
      after: afterBlockers
    });
    const blockerDeltaSummary =
      joinUniqueMessageParts([
        body?.callback_blocker_delta?.summary,
        automationDeltaSummary
      ]) || null;

    return {
      status: "success",
      message: formatOperatorOutcomeExplanationMessage({
        explanation: body?.outcome_explanation,
        runFollowUpExplanation: body?.run_follow_up?.explanation,
        blockerDeltaSummary,
        runSnapshot:
          runSnapshot ?? {
            status: body?.run?.status,
            workflowId: body?.run?.workflow_id ?? null,
            currentNodeId: body?.run?.current_node_id ?? null,
            waitingReason: null
          },
        fallback: formatManualResumeResultMessage({
          blockerDeltaSummary,
          runSnapshot:
            runSnapshot ?? {
              status: body?.run?.status,
              workflowId: body?.run?.workflow_id ?? null,
              currentNodeId: body?.run?.current_node_id ?? null,
              waitingReason: null
            }
        })
      }),
      runId
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端执行手动恢复。",
      runId
    };
  }
}
