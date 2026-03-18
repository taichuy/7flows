import { getApiBaseUrl } from "@/lib/api-base-url";

export type RunSnapshot = {
  status?: string | null;
  currentNodeId?: string | null;
  waitingReason?: string | null;
  workflowId?: string | null;
  executionFocusReason?: string | null;
  executionFocusNodeId?: string | null;
  executionFocusNodeRunId?: string | null;
  executionFocusExplanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
};

export type RunSnapshotWithId = {
  runId: string;
  snapshot: RunSnapshot | null;
};

type RunDetailResponseBody = {
  status?: string;
  workflow_id?: string | null;
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

export async function fetchRunSnapshot(runId: string): Promise<RunSnapshot | null> {
  const normalizedRunId = runId.trim();
  if (!normalizedRunId) {
    return null;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/runs/${normalizedRunId}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json().catch(() => null)) as RunDetailResponseBody | null;
    return {
      status: body?.status,
      workflowId: body?.workflow_id,
      currentNodeId: body?.current_node_id,
      waitingReason: readCurrentWaitingReason(body)
    };
  } catch {
    return null;
  }
}

export async function fetchRunSnapshots(
  runIds: Array<string | null | undefined>,
  limit = 3
): Promise<RunSnapshotWithId[]> {
  const normalizedRunIds = [...new Set(runIds.map((item) => item?.trim()).filter(Boolean))].slice(
    0,
    Math.max(limit, 0)
  ) as string[];

  return Promise.all(
    normalizedRunIds.map(async (runId) => ({
      runId,
      snapshot: await fetchRunSnapshot(runId)
    }))
  );
}
