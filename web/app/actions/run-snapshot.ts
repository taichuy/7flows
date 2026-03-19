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
  callbackWaitingExplanation?: {
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
  execution_focus_reason?: string | null;
  execution_focus_node?: {
    node_id?: string | null;
    node_run_id?: string | null;
    callback_waiting_explanation?: {
      primary_signal?: string | null;
      follow_up?: string | null;
    } | null;
  } | null;
  execution_focus_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  node_runs?: Array<{
    node_id?: string | null;
    status?: string | null;
    waiting_reason?: string | null;
  }>;
};

type RunExecutionViewResponseBody = {
  status?: string | null;
  workflow_id?: string | null;
  execution_focus_reason?: string | null;
  execution_focus_node?: {
    node_id?: string | null;
    node_run_id?: string | null;
    callback_waiting_explanation?: {
      primary_signal?: string | null;
      follow_up?: string | null;
    } | null;
  } | null;
  execution_focus_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
};

function readCurrentWaitingReason(body: RunDetailResponseBody | null) {
  const currentNodeId = body?.current_node_id?.trim();
  if (!currentNodeId || !Array.isArray(body?.node_runs)) {
    return null;
  }

  const currentNodeRun = body.node_runs.find((item) => item.node_id === currentNodeId);
  return currentNodeRun?.waiting_reason ?? null;
}

function hasRunDetailExecutionFocus(body: RunDetailResponseBody | null) {
  if (!body || typeof body !== "object") {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(body, "execution_focus_reason") ||
    Object.prototype.hasOwnProperty.call(body, "execution_focus_node") ||
    Object.prototype.hasOwnProperty.call(body, "execution_focus_explanation")
  );
}

function hasRunDetailCallbackWaitingExplanation(body: RunDetailResponseBody | null) {
  const executionFocusNode = body?.execution_focus_node;
  if (!executionFocusNode || typeof executionFocusNode !== "object") {
    return true;
  }

  return Object.prototype.hasOwnProperty.call(
    executionFocusNode,
    "callback_waiting_explanation"
  );
}

function normalizeSignalFollowUpExplanation(
  explanation:
    | {
        primary_signal?: string | null;
        follow_up?: string | null;
      }
    | null
    | undefined
) {
  if (!explanation) {
    return null;
  }

  return {
    primary_signal: explanation.primary_signal ?? null,
    follow_up: explanation.follow_up ?? null
  };
}

async function fetchRunExecutionView(
  runId: string
): Promise<RunExecutionViewResponseBody | null> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/runs/${encodeURIComponent(runId)}/execution-view`,
      {
        cache: "no-store"
      }
    );
    if (!response.ok) {
      return null;
    }

    return (await response.json().catch(() => null)) as RunExecutionViewResponseBody | null;
  } catch {
    return null;
  }
}

export async function fetchRunSnapshot(runId: string): Promise<RunSnapshot | null> {
  const normalizedRunId = runId.trim();
  if (!normalizedRunId) {
    return null;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/runs/${encodeURIComponent(normalizedRunId)}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      return null;
    }

    const body = (await response.json().catch(() => null)) as RunDetailResponseBody | null;
    const executionView =
      hasRunDetailExecutionFocus(body) && hasRunDetailCallbackWaitingExplanation(body)
        ? null
        : await fetchRunExecutionView(normalizedRunId);

    return {
      status: body?.status ?? executionView?.status ?? null,
      workflowId: body?.workflow_id ?? executionView?.workflow_id ?? null,
      currentNodeId: body?.current_node_id,
      waitingReason: readCurrentWaitingReason(body),
      executionFocusReason:
        body?.execution_focus_reason ?? executionView?.execution_focus_reason ?? null,
      executionFocusNodeId:
        body?.execution_focus_node?.node_id ?? executionView?.execution_focus_node?.node_id ?? null,
      executionFocusNodeRunId:
        body?.execution_focus_node?.node_run_id ??
        executionView?.execution_focus_node?.node_run_id ??
        null,
      executionFocusExplanation:
        normalizeSignalFollowUpExplanation(body?.execution_focus_explanation) ??
        normalizeSignalFollowUpExplanation(executionView?.execution_focus_explanation),
      callbackWaitingExplanation:
        normalizeSignalFollowUpExplanation(
          body?.execution_focus_node?.callback_waiting_explanation
        ) ??
        normalizeSignalFollowUpExplanation(
          executionView?.execution_focus_node?.callback_waiting_explanation
        )
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
