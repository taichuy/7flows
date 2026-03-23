import React from "react";
import Link from "next/link";

import { RunTraceExportActions } from "@/components/run-trace-export-actions";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { DEFAULT_RUN_TRACE_LIMIT, type RunTraceQuery } from "@/lib/get-run-trace";
import { buildRequiredOperatorRunDetailLinkSurface } from "@/lib/operator-follow-up-presenters";
import { buildRunDiagnosticsTraceSurfaceCopy } from "@/lib/run-diagnostics-presenters";

import { TRACE_LIMIT_OPTIONS } from "@/components/run-diagnostics-panel/shared";

type RunDiagnosticsTraceFiltersSectionProps = {
  runId: string;
  activeTraceQuery: RunTraceQuery;
  eventTypeOptions: string[];
  nodeRunOptions: string[];
  activeFilters: string[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  runDetailHref?: string | null;
};

export function RunDiagnosticsTraceFiltersSection({
  runId,
  activeTraceQuery,
  eventTypeOptions,
  nodeRunOptions,
  activeFilters,
  callbackWaitingAutomation = null,
  sandboxReadiness = null,
  runDetailHref = null
}: RunDiagnosticsTraceFiltersSectionProps) {
  const surfaceCopy = buildRunDiagnosticsTraceSurfaceCopy({
    defaultLimit: DEFAULT_RUN_TRACE_LIMIT
  });
  const resetRunLink = buildRequiredOperatorRunDetailLinkSurface({
    runId,
    hrefLabel: surfaceCopy.resetFiltersLabel
  });
  const resetRunHref = runDetailHref ?? resetRunLink.href;

  return (
    <section className="diagnostics-layout">
      <article className="diagnostic-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Trace</p>
            <h2>Trace filters & export</h2>
          </div>
          <p className="section-copy">{surfaceCopy.sectionDescription}</p>
        </div>

        <form className="trace-filter-form" action={resetRunHref} method="get">
          <label className="binding-field">
            <span className="binding-label">Event type</span>
            <select
              className="binding-select"
              name="event_type"
              defaultValue={activeTraceQuery.event_type ?? ""}
            >
              <option value="">全部事件</option>
              {eventTypeOptions.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventType}
                </option>
              ))}
            </select>
          </label>

          <label className="binding-field">
            <span className="binding-label">Node run</span>
            <select
              className="binding-select"
              name="node_run_id"
              defaultValue={activeTraceQuery.node_run_id ?? ""}
            >
              <option value="">全部节点</option>
              {nodeRunOptions.map((nodeRunId) => (
                <option key={nodeRunId} value={nodeRunId}>
                  {nodeRunId}
                </option>
              ))}
            </select>
          </label>

          <label className="binding-field trace-field-span">
            <span className="binding-label">Payload key contains</span>
            <input
              className="trace-text-input"
              name="payload_key"
              type="text"
              defaultValue={activeTraceQuery.payload_key ?? ""}
              placeholder="artifactType / results.tool_name / error"
            />
          </label>

          <label className="binding-field">
            <span className="binding-label">Created after (UTC ISO)</span>
            <input
              className="trace-text-input"
              name="created_after"
              type="text"
              defaultValue={activeTraceQuery.created_after ?? ""}
              placeholder="2026-03-10T08:00:00Z"
            />
          </label>

          <label className="binding-field">
            <span className="binding-label">Created before (UTC ISO)</span>
            <input
              className="trace-text-input"
              name="created_before"
              type="text"
              defaultValue={activeTraceQuery.created_before ?? ""}
              placeholder="2026-03-10T09:00:00Z"
            />
          </label>

          <label className="binding-field">
            <span className="binding-label">Order</span>
            <select className="binding-select" name="order" defaultValue={activeTraceQuery.order}>
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </label>

          <label className="binding-field">
            <span className="binding-label">Limit</span>
            <select
              className="binding-select"
              name="limit"
              defaultValue={String(activeTraceQuery.limit)}
            >
              {TRACE_LIMIT_OPTIONS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </label>

          <div className="trace-filter-actions trace-field-span">
            <button className="sync-button" type="submit">
              {surfaceCopy.applyFiltersLabel}
            </button>
            <Link className="inline-link" href={resetRunHref}>
              {resetRunLink.label}
            </Link>
            <RunTraceExportActions
              callbackWaitingAutomation={callbackWaitingAutomation}
              query={activeTraceQuery}
              requesterId="run-diagnostics-trace-export"
              runId={runId}
              sandboxReadiness={sandboxReadiness}
            />
          </div>
        </form>

        <div className="trace-filter-hints">
          <span className="event-chip">{surfaceCopy.defaultLimitHint}</span>
          <span className="event-chip">{surfaceCopy.utcTimeWindowHint}</span>
          <span className="event-chip">{surfaceCopy.cursorPaginationHint}</span>
        </div>

        <div className="trace-active-filter-row">
          {activeFilters.length === 0 ? (
            <p className="empty-state compact">{surfaceCopy.emptyState}</p>
          ) : (
            activeFilters.map((filter) => (
              <span className="event-chip" key={filter}>
                {filter}
              </span>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
