import React from "react";

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
import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { getApiBaseUrl } from "@/lib/api-base-url";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { RunEvidenceView, RunExecutionView } from "@/lib/get-run-views";
import {
  DEFAULT_RUN_TRACE_LIMIT,
  type RunTrace,
  type RunTraceQuery
} from "@/lib/get-run-trace";
import { buildRunDiagnosticsHeroSurfaceCopy } from "@/lib/run-diagnostics-presenters";
import {
  formatDuration,
  formatTimestamp
} from "@/lib/runtime-presenters";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

type RunDiagnosticsPanelProps = {
  run: RunDetail;
  trace: RunTrace | null;
  traceError?: string | null;
  traceQuery: RunTraceQuery;
  executionView: RunExecutionView | null;
  evidenceView: RunEvidenceView | null;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function RunDiagnosticsPanel({
  run,
  trace,
  traceError,
  traceQuery,
  executionView,
  evidenceView,
  callbackWaitingAutomation,
  sandboxReadiness = null
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
  const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId: run.workflow_id,
    variant: "editor"
  });
  const heroSurfaceCopy = buildRunDiagnosticsHeroSurfaceCopy();

  return (
    <main className="shell">
      <section className="hero diagnostic-hero">
        <div className="hero-copy">
          <p className="eyebrow">{heroSurfaceCopy.eyebrowLabel}</p>
          <h1>{run.workflow_id}</h1>
          <p className="hero-text">{heroSurfaceCopy.description}</p>
          <div className="pill-row">
            <span className="pill">run {run.id}</span>
            <span className="pill">version {run.workflow_version}</span>
            <span className="pill">{run.node_runs.length} node runs</span>
            <span className="pill">{run.event_count} events</span>
          </div>
          <div className="hero-actions">
            <WorkbenchEntryLinks
              keys={["workflowLibrary", "runLibrary", "operatorInbox", "home"]}
              overrides={{
                workflowLibrary: {
                  href: workflowDetailLink.href,
                  label: workflowDetailLink.label
                },
                runLibrary: {
                  label: "回到 run 列表"
                }
              }}
              primaryKey="workflowLibrary"
              variant="inline"
            />
            <a className="inline-link" href={eventsApiHref} target="_blank" rel="noreferrer">
              {heroSurfaceCopy.eventsApiLinkLabel}
            </a>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-label">{heroSurfaceCopy.statusPanelTitle}</div>
          <div className="panel-value">{run.status}</div>
          <p className="panel-text">
            {heroSurfaceCopy.createdAtLabel}：<strong>{formatTimestamp(run.created_at)}</strong>
          </p>
          <p className="panel-text">
            {heroSurfaceCopy.durationLabel}：<strong>{formatDuration(run.started_at, run.finished_at)}</strong>
          </p>
          <dl className="signal-list">
            <div>
              <dt>{heroSurfaceCopy.nodeRunsLabel}</dt>
              <dd>{run.node_runs.length}</dd>
            </div>
            <div>
              <dt>{heroSurfaceCopy.eventsLabel}</dt>
              <dd>{run.event_count}</dd>
            </div>
            <div>
              <dt>{heroSurfaceCopy.errorsLabel}</dt>
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
        sandboxReadiness={sandboxReadiness}
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
        callbackWaitingAutomation={callbackWaitingAutomation}
        sandboxReadiness={sandboxReadiness}
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
