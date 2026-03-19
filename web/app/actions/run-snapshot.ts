import { getApiBaseUrl } from "@/lib/api-base-url";

export type RunSnapshot = {
  status?: string | null;
  currentNodeId?: string | null;
  waitingReason?: string | null;
  workflowId?: string | null;
  executionFocusReason?: string | null;
  executionFocusNodeId?: string | null;
  executionFocusNodeRunId?: string | null;
  executionFocusNodeName?: string | null;
  executionFocusNodeType?: string | null;
  executionFocusExplanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  callbackWaitingExplanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  executionFocusArtifactCount?: number;
  executionFocusArtifactRefCount?: number;
  executionFocusToolCallCount?: number;
  executionFocusRawRefCount?: number;
  executionFocusArtifactRefs?: string[];
  executionFocusArtifacts?: Array<{
    artifact_kind?: string | null;
    content_type?: string | null;
    summary?: string | null;
    uri?: string | null;
  }>;
  executionFocusToolCalls?: Array<{
    id?: string | null;
    tool_id?: string | null;
    tool_name?: string | null;
    phase?: string | null;
    status?: string | null;
    effective_execution_class?: string | null;
    execution_sandbox_backend_id?: string | null;
    execution_sandbox_runner_kind?: string | null;
    execution_blocking_reason?: string | null;
    execution_fallback_reason?: string | null;
    response_summary?: string | null;
    response_content_type?: string | null;
    raw_ref?: string | null;
  }>;
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
    node_name?: string | null;
    node_type?: string | null;
    callback_waiting_explanation?: {
      primary_signal?: string | null;
      follow_up?: string | null;
    } | null;
    artifact_refs?: string[];
    artifacts?: Array<{
      artifact_kind?: string | null;
      content_type?: string | null;
      summary?: string | null;
      uri?: string | null;
    }>;
    tool_calls?: Array<{
      id?: string | null;
      tool_id?: string | null;
      tool_name?: string | null;
      phase?: string | null;
      status?: string | null;
      effective_execution_class?: string | null;
      execution_sandbox_backend_id?: string | null;
      execution_sandbox_runner_kind?: string | null;
      execution_blocking_reason?: string | null;
      execution_fallback_reason?: string | null;
      response_summary?: string | null;
      response_content_type?: string | null;
      raw_ref?: string | null;
    }>;
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
    node_name?: string | null;
    node_type?: string | null;
    callback_waiting_explanation?: {
      primary_signal?: string | null;
      follow_up?: string | null;
    } | null;
    artifact_refs?: string[];
    artifacts?: Array<{
      artifact_kind?: string | null;
      content_type?: string | null;
      summary?: string | null;
      uri?: string | null;
    }>;
    tool_calls?: Array<{
      id?: string | null;
      tool_id?: string | null;
      tool_name?: string | null;
      phase?: string | null;
      status?: string | null;
      effective_execution_class?: string | null;
      execution_sandbox_backend_id?: string | null;
      execution_sandbox_runner_kind?: string | null;
      execution_blocking_reason?: string | null;
      execution_fallback_reason?: string | null;
      response_summary?: string | null;
      response_content_type?: string | null;
      raw_ref?: string | null;
    }>;
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

function hasRunDetailExecutionFocusEvidence(body: RunDetailResponseBody | null) {
  const executionFocusNode = body?.execution_focus_node;
  if (!executionFocusNode || typeof executionFocusNode !== "object") {
    return true;
  }

  return (
    Object.prototype.hasOwnProperty.call(executionFocusNode, "artifact_refs") ||
    Object.prototype.hasOwnProperty.call(executionFocusNode, "artifacts") ||
    Object.prototype.hasOwnProperty.call(executionFocusNode, "tool_calls")
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

function normalizeStringList(values?: string[] | null) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeFocusArtifacts(
  values?:
    | Array<{
        artifact_kind?: string | null;
        content_type?: string | null;
        summary?: string | null;
        uri?: string | null;
      }>
    | null
) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((item) => ({
    artifact_kind: item?.artifact_kind ?? null,
    content_type: item?.content_type ?? null,
    summary: item?.summary ?? null,
    uri: item?.uri ?? null
  }));
}

function normalizeFocusToolCalls(
  values?:
    | Array<{
        id?: string | null;
        tool_id?: string | null;
        tool_name?: string | null;
        phase?: string | null;
        status?: string | null;
        effective_execution_class?: string | null;
        execution_sandbox_backend_id?: string | null;
        execution_sandbox_runner_kind?: string | null;
        execution_blocking_reason?: string | null;
        execution_fallback_reason?: string | null;
        response_summary?: string | null;
        response_content_type?: string | null;
        raw_ref?: string | null;
      }>
    | null
) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((item) => ({
    id: item?.id ?? null,
    tool_id: item?.tool_id ?? null,
    tool_name: item?.tool_name ?? null,
    phase: item?.phase ?? null,
    status: item?.status ?? null,
    effective_execution_class: item?.effective_execution_class ?? null,
    execution_sandbox_backend_id: item?.execution_sandbox_backend_id ?? null,
    execution_sandbox_runner_kind: item?.execution_sandbox_runner_kind ?? null,
    execution_blocking_reason: item?.execution_blocking_reason ?? null,
    execution_fallback_reason: item?.execution_fallback_reason ?? null,
    response_summary: item?.response_summary ?? null,
    response_content_type: item?.response_content_type ?? null,
    raw_ref: item?.raw_ref ?? null
  }));
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
      hasRunDetailExecutionFocus(body) &&
      hasRunDetailCallbackWaitingExplanation(body) &&
      hasRunDetailExecutionFocusEvidence(body)
        ? null
        : await fetchRunExecutionView(normalizedRunId);

    const bodyArtifactRefs = normalizeStringList(body?.execution_focus_node?.artifact_refs);
    const executionViewArtifactRefs = normalizeStringList(
      executionView?.execution_focus_node?.artifact_refs
    );
    const bodyArtifacts = normalizeFocusArtifacts(body?.execution_focus_node?.artifacts);
    const executionViewArtifacts = normalizeFocusArtifacts(
      executionView?.execution_focus_node?.artifacts
    );
    const bodyToolCalls = normalizeFocusToolCalls(body?.execution_focus_node?.tool_calls);
    const executionViewToolCalls = normalizeFocusToolCalls(
      executionView?.execution_focus_node?.tool_calls
    );

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
      executionFocusNodeName:
        body?.execution_focus_node?.node_name ?? executionView?.execution_focus_node?.node_name ?? null,
      executionFocusNodeType:
        body?.execution_focus_node?.node_type ?? executionView?.execution_focus_node?.node_type ?? null,
      executionFocusExplanation:
        normalizeSignalFollowUpExplanation(body?.execution_focus_explanation) ??
        normalizeSignalFollowUpExplanation(executionView?.execution_focus_explanation),
      callbackWaitingExplanation:
        normalizeSignalFollowUpExplanation(
          body?.execution_focus_node?.callback_waiting_explanation
        ) ??
        normalizeSignalFollowUpExplanation(
          executionView?.execution_focus_node?.callback_waiting_explanation
        ),
      executionFocusArtifactCount:
        body?.execution_focus_node?.artifacts?.length ??
        executionView?.execution_focus_node?.artifacts?.length ??
        0,
      executionFocusArtifactRefCount:
        body?.execution_focus_node?.artifact_refs?.length ??
        executionView?.execution_focus_node?.artifact_refs?.length ??
        0,
      executionFocusToolCallCount:
        body?.execution_focus_node?.tool_calls?.length ??
        executionView?.execution_focus_node?.tool_calls?.length ??
        0,
      executionFocusRawRefCount:
        body?.execution_focus_node?.tool_calls?.filter((item) => item?.raw_ref?.trim()).length ??
        executionView?.execution_focus_node?.tool_calls?.filter((item) => item?.raw_ref?.trim()).length ??
        0,
      executionFocusArtifactRefs:
        bodyArtifactRefs.length > 0 ? bodyArtifactRefs : executionViewArtifactRefs,
      executionFocusArtifacts: bodyArtifacts.length > 0 ? bodyArtifacts : executionViewArtifacts,
      executionFocusToolCalls: bodyToolCalls.length > 0 ? bodyToolCalls : executionViewToolCalls
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
