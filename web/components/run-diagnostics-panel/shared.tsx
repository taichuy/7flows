import type { RunDetail } from "@/lib/get-run-detail";
import {
  buildRunTraceQueryString,
  DEFAULT_RUN_TRACE_LIMIT,
  type RunTrace,
  type RunTraceQuery
} from "@/lib/get-run-trace";
import { buildRequiredOperatorRunDetailLinkSurface } from "@/lib/operator-follow-up-presenters";
import { formatJsonPayload } from "@/lib/runtime-presenters";

export const TRACE_LIMIT_OPTIONS = [50, 100, 200, 500];

export function PayloadCard({
  title,
  payload,
  emptyCopy = "当前没有可展示的数据。"
}: {
  title: string;
  payload: unknown;
  emptyCopy?: string;
}) {
  const isEmptyObject =
    payload !== null &&
    typeof payload === "object" &&
    Object.keys(payload as Record<string, unknown>).length === 0;

  return (
    <div className="payload-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
      </div>
      {payload == null || isEmptyObject ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        <pre>{formatJsonPayload(payload)}</pre>
      )}
    </div>
  );
}

export function countErroredNodes(run: RunDetail) {
  return run.node_runs.filter(
    (nodeRun) => nodeRun.status === "failed" || Boolean(nodeRun.error_message)
  ).length;
}

export function toRunTraceQuery(filters: RunTrace["filters"]): RunTraceQuery {
  return {
    cursor: filters.cursor ?? undefined,
    event_type: filters.event_type ?? undefined,
    node_run_id: filters.node_run_id ?? undefined,
    created_after: filters.created_after ?? undefined,
    created_before: filters.created_before ?? undefined,
    payload_key: filters.payload_key ?? undefined,
    limit: filters.limit ?? DEFAULT_RUN_TRACE_LIMIT,
    order: filters.order ?? "asc"
  };
}

export function summarizeActiveFilters(query: RunTraceQuery) {
  const filters: string[] = [];

  if (query.event_type) {
    filters.push(`event_type=${query.event_type}`);
  }
  if (query.node_run_id) {
    filters.push(`node_run_id=${query.node_run_id}`);
  }
  if (query.payload_key) {
    filters.push(`payload_key~${query.payload_key}`);
  }
  if (query.created_after) {
    filters.push(`after=${query.created_after}`);
  }
  if (query.created_before) {
    filters.push(`before=${query.created_before}`);
  }
  if ((query.order ?? "asc") !== "asc") {
    filters.push(`order=${query.order}`);
  }
  if ((query.limit ?? DEFAULT_RUN_TRACE_LIMIT) !== DEFAULT_RUN_TRACE_LIMIT) {
    filters.push(`limit=${query.limit}`);
  }

  return filters;
}

export function buildPageTraceHref(
  runId: string,
  query: RunTraceQuery,
  baseHref?: string | null
) {
  const queryString = buildRunTraceQueryString(query);
  const runHref = baseHref ?? buildRequiredOperatorRunDetailLinkSurface({ runId }).href;

  if (!queryString) {
    return runHref;
  }

  const [pathname, existingQuery = ""] = runHref.split("?");
  const mergedSearchParams = new URLSearchParams(existingQuery);
  const traceSearchParams = new URLSearchParams(queryString);

  traceSearchParams.forEach((value, key) => {
    mergedSearchParams.set(key, value);
  });

  const mergedQuery = mergedSearchParams.toString();

  return mergedQuery ? `${pathname}?${mergedQuery}` : pathname;
}
