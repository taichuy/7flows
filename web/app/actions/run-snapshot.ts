import { getApiBaseUrl } from "@/lib/api-base-url";
import type { SkillReferenceLoadItem } from "@/lib/get-run-views";

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
  executionFocusSkillTrace?: {
    reference_count: number;
    phase_counts: Record<string, number>;
    source_counts: Record<string, number>;
    loads: SkillReferenceLoadItem[];
  } | null;
};

export type RunSnapshotWithId = {
  runId: string;
  snapshot: RunSnapshot | null;
};

export type OperatorRunSnapshotBody = {
  workflow_id?: string | null;
  status?: string | null;
  current_node_id?: string | null;
  waiting_reason?: string | null;
  execution_focus_reason?: string | null;
  execution_focus_node_id?: string | null;
  execution_focus_node_run_id?: string | null;
  execution_focus_node_name?: string | null;
  execution_focus_node_type?: string | null;
  execution_focus_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  callback_waiting_explanation?: {
    primary_signal?: string | null;
    follow_up?: string | null;
  } | null;
  execution_focus_artifact_count?: number;
  execution_focus_artifact_ref_count?: number;
  execution_focus_tool_call_count?: number;
  execution_focus_raw_ref_count?: number;
  execution_focus_artifact_refs?: string[];
  execution_focus_artifacts?: Array<{
    artifact_kind?: string | null;
    content_type?: string | null;
    summary?: string | null;
    uri?: string | null;
  }>;
  execution_focus_tool_calls?: Array<{
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
  execution_focus_skill_trace?: {
    reference_count?: number | null;
    phase_counts?: Record<string, number> | null;
    source_counts?: Record<string, number> | null;
    loads?: SkillReferenceLoadItem[] | null;
  } | null;
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
  skill_trace?: {
    scope?: string | null;
    reference_count?: number | null;
    phase_counts?: Record<string, number> | null;
    source_counts?: Record<string, number> | null;
    nodes?: Array<{
      loads?: SkillReferenceLoadItem[] | null;
    }> | null;
  } | null;
};

function normalizeSkillTraceCounts(input?: Record<string, number> | null) {
  if (!input || typeof input !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => typeof key === "string" && key.trim() && Number.isFinite(value))
      .map(([key, value]) => [key, Number(value)])
  );
}

function normalizeSkillReferenceLoads(loads?: SkillReferenceLoadItem[] | null): SkillReferenceLoadItem[] {
  if (!Array.isArray(loads)) {
    return [];
  }

  return loads
    .map((load) => ({
      phase: typeof load?.phase === "string" && load.phase.trim() ? load.phase : "unknown",
      references: Array.isArray(load?.references)
        ? load.references
            .map((reference) => ({
              skill_id: typeof reference?.skill_id === "string" ? reference.skill_id : "",
              skill_name: reference?.skill_name ?? null,
              reference_id: typeof reference?.reference_id === "string" ? reference.reference_id : "",
              reference_name: reference?.reference_name ?? null,
              load_source:
                typeof reference?.load_source === "string" && reference.load_source.trim()
                  ? reference.load_source
                  : "unknown",
              fetch_reason: reference?.fetch_reason ?? null,
              fetch_request_index:
                typeof reference?.fetch_request_index === "number"
                  ? reference.fetch_request_index
                  : null,
              fetch_request_total:
                typeof reference?.fetch_request_total === "number"
                  ? reference.fetch_request_total
                  : null,
              retrieval_http_path: reference?.retrieval_http_path ?? null,
              retrieval_mcp_method: reference?.retrieval_mcp_method ?? null,
              retrieval_mcp_params:
                reference?.retrieval_mcp_params && typeof reference.retrieval_mcp_params === "object"
                  ? Object.fromEntries(
                      Object.entries(reference.retrieval_mcp_params).map(([key, value]) => [
                        key,
                        String(value)
                      ])
                    )
                  : {}
            }))
            .filter((reference) => reference.skill_id && reference.reference_id)
        : []
    }))
    .filter((load) => load.references.length > 0);
}

function normalizeFocusSkillTrace(
  skillTrace?: OperatorRunSnapshotBody["execution_focus_skill_trace"] | RunExecutionViewResponseBody["skill_trace"]
) {
  if (!skillTrace || typeof skillTrace !== "object") {
    return null;
  }

  const loads =
    "loads" in skillTrace && Array.isArray(skillTrace.loads)
      ? normalizeSkillReferenceLoads(skillTrace.loads)
      : "nodes" in skillTrace && Array.isArray(skillTrace.nodes)
        ? normalizeSkillReferenceLoads(skillTrace.nodes[0]?.loads)
        : [];
  const referenceCount = typeof skillTrace.reference_count === "number" ? skillTrace.reference_count : 0;
  const phaseCounts = normalizeSkillTraceCounts(skillTrace.phase_counts);
  const sourceCounts = normalizeSkillTraceCounts(skillTrace.source_counts);

  if (referenceCount <= 0 && loads.length === 0) {
    return null;
  }

  return {
    reference_count: referenceCount,
    phase_counts: phaseCounts,
    source_counts: sourceCounts,
    loads
  };
}

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

export function normalizeOperatorRunSnapshot(
  snapshot?: OperatorRunSnapshotBody | null
): RunSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    status: snapshot.status ?? null,
    workflowId: snapshot.workflow_id ?? null,
    currentNodeId: snapshot.current_node_id ?? null,
    waitingReason: snapshot.waiting_reason ?? null,
    executionFocusReason: snapshot.execution_focus_reason ?? null,
    executionFocusNodeId: snapshot.execution_focus_node_id ?? null,
    executionFocusNodeRunId: snapshot.execution_focus_node_run_id ?? null,
    executionFocusNodeName: snapshot.execution_focus_node_name ?? null,
    executionFocusNodeType: snapshot.execution_focus_node_type ?? null,
    executionFocusExplanation: normalizeSignalFollowUpExplanation(
      snapshot.execution_focus_explanation
    ),
    callbackWaitingExplanation: normalizeSignalFollowUpExplanation(
      snapshot.callback_waiting_explanation
    ),
    executionFocusArtifactCount: snapshot.execution_focus_artifact_count ?? 0,
    executionFocusArtifactRefCount: snapshot.execution_focus_artifact_ref_count ?? 0,
    executionFocusToolCallCount: snapshot.execution_focus_tool_call_count ?? 0,
    executionFocusRawRefCount: snapshot.execution_focus_raw_ref_count ?? 0,
    executionFocusArtifactRefs: normalizeStringList(snapshot.execution_focus_artifact_refs),
    executionFocusArtifacts: normalizeFocusArtifacts(snapshot.execution_focus_artifacts),
    executionFocusToolCalls: normalizeFocusToolCalls(snapshot.execution_focus_tool_calls),
    executionFocusSkillTrace: normalizeFocusSkillTrace(snapshot.execution_focus_skill_trace)
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
      executionFocusToolCalls: bodyToolCalls.length > 0 ? bodyToolCalls : executionViewToolCalls,
      executionFocusSkillTrace: normalizeFocusSkillTrace(
        executionView?.skill_trace?.scope === "execution_focus_node" ? executionView.skill_trace : null
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
