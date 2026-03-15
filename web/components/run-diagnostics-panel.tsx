import Link from "next/link";

import { RunDiagnosticsExecutionSections } from "@/components/run-diagnostics-execution-sections";
import { RunDiagnosticsOverviewSections } from "@/components/run-diagnostics-panel/overview-sections";
import {
  buildPageTraceHref,
  countErroredNodes,
  summarizeActiveFilters,
  toRunTraceQuery
} from "@/components/run-diagnostics-panel/shared";
import { RunDiagnosticsTraceFiltersSection } from "@/components/run-diagnostics-panel/trace-filters-section";
import { RunDiagnosticsTraceResultsSection } from "@/components/run-diagnostics-panel/trace-results-section";
import { getApiBaseUrl } from "@/lib/api-base-url";
import type { RunDetail } from "@/lib/get-run-detail";
import type { RunEvidenceView, RunExecutionView } from "@/lib/get-run-views";
import {
  DEFAULT_RUN_TRACE_LIMIT,
  type RunTrace,
  type RunTraceQuery
} from "@/lib/get-run-trace";
import {
  formatDuration,
  formatTimestamp
} from "@/lib/runtime-presenters";

type RunDiagnosticsPanelProps = {
  run: RunDetail;
  trace: RunTrace | null;
  traceError?: string | null;
  traceQuery: RunTraceQuery;
  executionView: RunExecutionView | null;
  evidenceView: RunEvidenceView | null;
};

export function RunDiagnosticsPanel({
  run,
  trace,
  traceError,
  traceQuery,
  executionView,
  evidenceView
}: RunDiagnosticsPanelProps) {
  const eventTypes = run.event_type_counts;
  const activeTraceQuery = trace
    ? toRunTraceQuery(trace.filters)
    : {
        ...traceQuery,
        limit: traceQuery.limit ?? DEFAULT_RUN_TRACE_LIMIT,
        order: traceQuery.order ?? "asc"
      };
  const eventTypeOptions = Array.from(
    new Set([
      ...Object.keys(eventTypes),
      ...(trace?.summary.available_event_types ?? [])
    ])
  ).sort();
  const nodeRunOptions = Array.from(
    new Set([
      ...run.node_runs.map((nodeRun) => nodeRun.id),
      ...(trace?.summary.available_node_run_ids ?? [])
    ])
  ).sort();
  const activeFilters = summarizeActiveFilters(activeTraceQuery);
  const traceHref = buildPageTraceHref(run.id, activeTraceQuery);
  const eventsApiHref = `${getApiBaseUrl()}/api/runs/${encodeURIComponent(run.id)}/events`;

  return (
    <main className="shell">
      <section className="hero diagnostic-hero">
        <div className="hero-copy">
          <p className="eyebrow">Run Diagnostics</p>
          <h1>{run.workflow_id}</h1>
          <p className="hero-text">
            这页现在直接消费 `run trace`，可以按事件类型、节点、时间窗和
            payload key 顺着 `run_events` 排障，同时保留导出与原始事件入口。
          </p>
          <div className="pill-row">
            <span className="pill">run {run.id}</span>
            <span className="pill">version {run.workflow_version}</span>
            <span className="pill">{run.node_runs.length} node runs</span>
            <span className="pill">{run.event_count} events</span>
          </div>
          <div className="hero-actions">
            <Link className="inline-link" href="/">
              返回系统首页
            </Link>
            <a className="inline-link" href={eventsApiHref} target="_blank" rel="noreferrer">
              打开原始 events API
            </a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-label">Run status</div>
          <div className="panel-value">{run.status}</div>
          <p className="panel-text">
            创建时间：<strong>{formatTimestamp(run.created_at)}</strong>
          </p>
          <p className="panel-text">
            执行耗时：<strong>{formatDuration(run.started_at, run.finished_at)}</strong>
          </p>
          <dl className="signal-list">
            <div>
              <dt>Node runs</dt>
              <dd>{run.node_runs.length}</dd>
            </div>
            <div>
              <dt>Events</dt>
              <dd>{run.event_count}</dd>
            </div>
            <div>
              <dt>Errors</dt>
              <dd>{countErroredNodes(run)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <RunDiagnosticsOverviewSections
        run={run}
        eventTypes={eventTypes}
        activeFilters={activeFilters}
        activeTraceQuery={activeTraceQuery}
      />

      <RunDiagnosticsTraceFiltersSection
        runId={run.id}
        activeTraceQuery={activeTraceQuery}
        eventTypeOptions={eventTypeOptions}
        nodeRunOptions={nodeRunOptions}
        activeFilters={activeFilters}
      />

      <RunDiagnosticsExecutionSections
        executionView={executionView}
        evidenceView={evidenceView}
      />

      <RunDiagnosticsTraceResultsSection
        runId={run.id}
        trace={trace}
        traceError={traceError}
        activeTraceQuery={activeTraceQuery}
        traceHref={traceHref}
      />
    </main>
  );
}
