"use server";

import {
  buildActionCallbackBlockerDeltaSummary,
  fetchScopedCallbackBlockerSnapshot
} from "./callback-blocker-action-summary";
import {
  formatManualResumeResultMessage,
  formatOperatorOutcomeExplanationMessage
} from "@/lib/operator-action-result-presenters";
import { getApiBaseUrl } from "@/lib/api-base-url";

import { revalidateOperatorFollowUpPaths } from "./operator-follow-up-revalidation";
import {
  resolveCanonicalOperatorRunSnapshot,
  normalizeOperatorRunFollowUp,
  type OperatorRunFollowUpBody,
  type OperatorRunSnapshotBody
} from "./run-snapshot";
import type { SensitiveResourceItem } from "@/lib/get-sensitive-access";
import type { OperatorInlineActionResultState } from "@/lib/operator-inline-action-feedback";

export type ResumeRunState = OperatorInlineActionResultState & {
  status: "idle" | "success" | "error";
  message: string;
  runId: string;
};

const INITIAL_REASON = "operator_manual_resume_attempt";
const INITIAL_SOURCE = "operator_callback_resume";

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
    const beforeBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
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
          run_snapshot?: OperatorRunSnapshotBody | null;
          run_follow_up?: OperatorRunFollowUpBody | null;
          callback_blocker_delta?: {
            summary?: string | null;
            primary_resource?: SensitiveResourceItem | null;
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

    const runSnapshot = resolveCanonicalOperatorRunSnapshot({
      runId,
      runSnapshot: body?.run_snapshot,
      runFollowUp: body?.run_follow_up
    });
    revalidateOperatorFollowUpPaths({
      runIds: [runId],
      workflowIds: [runSnapshot?.workflowId]
    });
    const afterBlockers = await fetchScopedCallbackBlockerSnapshot({
      runId,
      nodeRunId
    });
    const blockerDeltaSummary = buildActionCallbackBlockerDeltaSummary({
      backendSummary: body?.callback_blocker_delta?.summary,
      backendPrimaryResource: body?.callback_blocker_delta?.primary_resource,
      before: beforeBlockers,
      after: afterBlockers
    });

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
      outcomeExplanation: body?.outcome_explanation ?? null,
      runFollowUpExplanation: body?.run_follow_up?.explanation ?? null,
      runFollowUp: normalizeOperatorRunFollowUp(body?.run_follow_up),
      blockerDeltaSummary,
      runSnapshot:
        runSnapshot ?? {
          status: body?.run?.status,
          workflowId: body?.run?.workflow_id ?? null,
          currentNodeId: body?.run?.current_node_id ?? null,
          waitingReason: null
        },
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

export async function triggerWorkflowRun(
  workflowId: string,
  inputPayload: Record<string, unknown>
): Promise<{ status: "success" | "error"; message: string; runId?: string }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/workflows/${workflowId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input_payload: inputPayload,
        source: "operator_manual_trigger"
      }),
      cache: "no-store"
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "触发工作流运行失败。"
      };
    }

    const runId = body?.id || body?.run?.id;
    
    if (runId) {
      revalidateOperatorFollowUpPaths({
        workflowIds: [workflowId],
        runIds: [runId]
      });
    }

    return {
      status: "success",
      message: "工作流触发成功",
      runId
    };
  } catch (err) {
    return {
      status: "error",
      message: "服务请求失败。"
    };
  }
}


export async function triggerWorkflowNodeTrialRun(
  workflowId: string,
  nodeId: string,
  inputPayload: Record<string, unknown>
): Promise<{ status: "success" | "error"; message: string; runId?: string }> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${workflowId}/nodes/${nodeId}/trial-runs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input_payload: inputPayload,
          source: "operator_node_trial_run"
        }),
        cache: "no-store"
      }
    );

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "触发节点试运行失败。"
      };
    }

    const runId = body?.id || body?.run?.id;

    if (runId) {
      revalidateOperatorFollowUpPaths({
        workflowIds: [workflowId],
        runIds: [runId]
      });
    }

    return {
      status: "success",
      message: "节点试运行触发成功",
      runId
    };
  } catch {
    return {
      status: "error",
      message: "服务请求失败。"
    };
  }
}
