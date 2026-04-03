import {
  fetchConsoleApiPath,
  resolveConsoleApiUrl
} from "@/lib/console-session-client";
import type { WorkflowToolGovernanceSummary } from "@/lib/get-workflows";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-types";

export const DEFAULT_RUN_TRACE_LIMIT = 100;

export type RunTraceQuery = {
  cursor?: string;
  event_type?: string;
  node_run_id?: string;
  created_after?: string;
  created_before?: string;
  payload_key?: string;
  limit?: number;
  order?: "asc" | "desc";
};

export type RunTraceFilters = RunTraceQuery & {
  before_event_id?: number | null;
  after_event_id?: number | null;
};

export type RunTraceSummary = {
  total_event_count: number;
  matched_event_count: number;
  returned_event_count: number;
  available_event_types: string[];
  available_node_run_ids: string[];
  available_payload_keys: string[];
  trace_started_at?: string | null;
  trace_finished_at?: string | null;
  matched_started_at?: string | null;
  matched_finished_at?: string | null;
  returned_started_at?: string | null;
  returned_finished_at?: string | null;
  returned_duration_ms: number;
  next_cursor?: string | null;
  prev_cursor?: string | null;
  first_event_id?: number | null;
  last_event_id?: number | null;
  has_more: boolean;
};

export type RunTraceEventItem = {
  id: number;
  run_id: string;
  node_run_id?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  sequence: number;
  replay_offset_ms: number;
};

export type RunTrace = {
  run_id: string;
  filters: RunTraceFilters;
  summary: RunTraceSummary;
  tool_governance?: WorkflowToolGovernanceSummary | null;
  legacy_auth_governance?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  events: RunTraceEventItem[];
};

export type RunTraceLoadResult = {
  trace: RunTrace | null;
  errorMessage: string | null;
};

export function parseRunTraceSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): RunTraceQuery {
  const limitValue = Number.parseInt(
    readFirstSearchParam(searchParams.limit) ?? "",
    10
  );
  const limit = Number.isFinite(limitValue)
    ? clamp(limitValue, 1, 1000)
    : DEFAULT_RUN_TRACE_LIMIT;
  const order = readFirstSearchParam(searchParams.order);

  return {
    cursor: normalizeQueryValue(readFirstSearchParam(searchParams.cursor)),
    event_type: normalizeQueryValue(readFirstSearchParam(searchParams.event_type)),
    node_run_id: normalizeQueryValue(readFirstSearchParam(searchParams.node_run_id)),
    created_after: normalizeQueryValue(
      readFirstSearchParam(searchParams.created_after)
    ),
    created_before: normalizeQueryValue(
      readFirstSearchParam(searchParams.created_before)
    ),
    payload_key: normalizeQueryValue(readFirstSearchParam(searchParams.payload_key)),
    limit,
    order: order === "desc" ? "desc" : "asc"
  };
}

export function buildRunTraceQueryString(query: RunTraceQuery) {
  const searchParams = new URLSearchParams();

  setString(searchParams, "cursor", query.cursor);
  setString(searchParams, "event_type", query.event_type);
  setString(searchParams, "node_run_id", query.node_run_id);
  setString(searchParams, "created_after", query.created_after);
  setString(searchParams, "created_before", query.created_before);
  setString(searchParams, "payload_key", query.payload_key);

  if (typeof query.limit === "number") {
    searchParams.set("limit", String(clamp(query.limit, 1, 1000)));
  }

  if (query.order === "desc") {
    searchParams.set("order", "desc");
  } else if (query.order === "asc") {
    searchParams.set("order", "asc");
  }

  return searchParams.toString();
}

export function buildRunTraceExportUrl(
  runId: string,
  query: RunTraceQuery,
  format: "json" | "jsonl"
) {
  const searchParams = new URLSearchParams(buildRunTraceQueryString(query));
  searchParams.set("format", format);

  return resolveConsoleApiUrl(
    `/api/runs/${encodeURIComponent(runId)}/trace/export?${searchParams.toString()}`
  );
}

export async function getRunTrace(
  runId: string,
  query: RunTraceQuery
): Promise<RunTraceLoadResult> {
  try {
    const queryString = buildRunTraceQueryString(query);
    const response = await fetchConsoleApiPath(
      `/api/runs/${encodeURIComponent(runId)}/trace${queryString ? `?${queryString}` : ""}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { detail?: string }
        | null;
      return {
        trace: null,
        errorMessage:
          body?.detail ?? `无法读取 run trace，API 返回 ${response.status}。`
      };
    }

    return {
      trace: (await response.json()) as RunTrace,
      errorMessage: null
    };
  } catch {
    return {
      trace: null,
      errorMessage: "无法连接后端读取 run trace，请确认 API 已启动。"
    };
  }
}

function readFirstSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value[0]?.trim();
  }

  return undefined;
}

function normalizeQueryValue(value?: string) {
  return value ? value.trim() : undefined;
}

function setString(searchParams: URLSearchParams, key: string, value?: string) {
  if (value) {
    searchParams.set(key, value);
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
