"use server";

import { revalidatePath } from "next/cache";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { formatManualResumeResultMessage } from "@/lib/operator-action-result-presenters";

type RunDetailResponseBody = {
  status?: string;
  current_node_id?: string | null;
  node_runs?: Array<{
    node_id?: string | null;
    status?: string | null;
    waiting_reason?: string | null;
  }>;
};

function readCurrentWaitingReason(body: RunDetailResponseBody | null) {
  const currentNodeId = body?.current_node_id?.trim();
  if (!currentNodeId || !Array.isArray(body?.node_runs)) {
    return null;
  }

  const currentNodeRun = body.node_runs.find((item) => item.node_id === currentNodeId);
  return currentNodeRun?.waiting_reason ?? null;
}

export type ResumeRunState = {
  status: "idle" | "success" | "error";
  message: string;
  runId: string;
};

const INITIAL_REASON = "operator_manual_resume_attempt";
const INITIAL_SOURCE = "operator_callback_resume";

function revalidateRunPaths(runId: string) {
  revalidatePath("/");
  revalidatePath("/sensitive-access");
  revalidatePath(`/runs/${runId}`);
}

export async function resumeRun(
  _: ResumeRunState,
  formData: FormData
): Promise<ResumeRunState> {
  const runId = String(formData.get("runId") ?? "").trim();
  const reason = String(formData.get("reason") ?? INITIAL_REASON).trim() || INITIAL_REASON;

  if (!runId) {
    return {
      status: "error",
      message: "缺少恢复 run 所需的标识。",
      runId
    };
  }

  try {
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
      | ({ detail?: string } & RunDetailResponseBody)
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "手动恢复执行失败。",
        runId
      };
    }

    revalidateRunPaths(runId);

    return {
      status: "success",
      message: formatManualResumeResultMessage({
        status: body?.status,
        currentNodeId: body?.current_node_id,
        waitingReason: readCurrentWaitingReason(body)
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
