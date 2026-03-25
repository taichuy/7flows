"use client";

import React from "react";
import Link from "next/link";

import type { RunSnapshotWithId } from "@/app/actions/run-snapshot";
import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";
import { RunTraceExportActions } from "@/components/run-trace-export-actions";
import { SandboxExecutionReadinessCard } from "@/components/sandbox-execution-readiness-card";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import {
  buildLegacyPublishAuthGovernanceSurfaceCopy,
  buildLegacyPublishAuthWorkflowHandoff
} from "@/lib/legacy-publish-auth-governance-presenters";
import {
  DEFAULT_RUN_TRACE_LIMIT,
  type RunTrace
} from "@/lib/get-run-trace";
import type { WorkflowRunListItem } from "@/lib/get-workflow-runs";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import { buildOperatorRunSampleInboxHref } from "@/lib/operator-run-sample-cards";
import { buildExecutionFocusSurfaceDescription } from "@/lib/run-execution-focus-presenters";
import { buildSandboxReadinessNodeFromRunSnapshot } from "@/lib/sandbox-readiness-presenters";
import {
  formatCatalogGapToolSummary,
  formatWorkflowMissingToolSummary,
  hasWorkflowMissingToolIssues
} from "@/lib/workflow-definition-governance";
import { appendWorkflowLibraryViewState } from "@/lib/workflow-library-query";
import {
  buildAuthorFacingRunDetailLinkSurface,
  buildAuthorFacingWorkflowDetailLinkSurface
} from "@/lib/workbench-entry-surfaces";
import {
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildRunDetailHrefFromWorkspaceStarterViewState,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import {
  formatDuration,
  formatDurationMs,
  formatTimestamp
} from "@/lib/runtime-presenters";

type WorkflowRunOverlayPanelProps = {
  runs: WorkflowRunListItem[];
  selectedRunId: string | null;
  run: RunDetail | null;
  runSnapshot: RunSnapshotWithId | null;
  trace: RunTrace | null;
  traceError?: string | null;
  selectedNodeId?: string | null;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
  isLoading: boolean;
  isRefreshingRuns: boolean;
  onSelectRunId: (runId: string) => void;
  onRefreshRuns: () => void;
};

export function WorkflowRunOverlayPanel({
  runs,
  selectedRunId,
  run,
  runSnapshot,
  trace,
  traceError,
  selectedNodeId,
  callbackWaitingAutomation,
  sandboxReadiness,
  workspaceStarterGovernanceQueryScope = null,
  isLoading,
  isRefreshingRuns,
  onSelectRunId,
  onRefreshRuns
}: WorkflowRunOverlayPanelProps) {
  const runSnapshotModel = runSnapshot?.snapshot ?? null;
  const selectedNodeRun =
    selectedNodeId && run
      ? run.node_runs.find((nodeRun) => nodeRun.node_id === selectedNodeId) ?? null
      : null;
  const tracePreview = trace?.events.slice(-6) ?? [];
  const sandboxReadinessNode = buildSandboxReadinessNodeFromRunSnapshot(runSnapshotModel);
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const callbackWaitingSummaryProps = runSnapshot
    ? {
        inboxHref: buildOperatorRunSampleInboxHref(runSnapshot),
        callbackTickets: runSnapshot.callbackTickets ?? [],
        callbackWaitingAutomation,
        sensitiveAccessEntries: runSnapshot.sensitiveAccessEntries ?? [],
        showSensitiveAccessInlineActions: false
      }
    : undefined;
  const resolveRunDetailHref = React.useCallback(
    (candidateRunId: string) =>
      workspaceStarterGovernanceQueryScope
        ? buildRunDetailHrefFromWorkspaceStarterViewState(
            candidateRunId,
            workspaceStarterGovernanceQueryScope
          )
        : null,
    [workspaceStarterGovernanceQueryScope]
  );
  const runDrilldownLink = run
    ? buildAuthorFacingRunDetailLinkSurface({
        runId: run.id,
        runHref: resolveRunDetailHref(run.id)
      })
    : null;
  const baseWorkflowDetailHref = run
    ? workspaceStarterGovernanceQueryScope
      ? buildWorkflowEditorHrefFromWorkspaceStarterViewState(
          run.workflow_id,
          workspaceStarterGovernanceQueryScope
        )
      : buildAuthorFacingWorkflowDetailLinkSurface({
          workflowId: run.workflow_id,
          variant: "editor"
        }).href
    : null;
  const workflowGovernanceHref =
    run && baseWorkflowDetailHref && hasWorkflowMissingToolIssues(run)
      ? appendWorkflowLibraryViewState(baseWorkflowDetailHref, {
          definitionIssue: "missing_tool"
        })
      : baseWorkflowDetailHref;
  const workflowCatalogGapSummary = run ? formatWorkflowMissingToolSummary(run) : null;
  const workflowCatalogGapToolCopy = formatCatalogGapToolSummary(
    run?.tool_governance?.missing_tool_ids ?? []
  );
  const legacyAuthSurfaceCopy = buildLegacyPublishAuthGovernanceSurfaceCopy();
  const legacyAuthHandoff = run
    ? buildLegacyPublishAuthWorkflowHandoff(run.legacy_auth_governance, run.workflow_id)
    : null;

  return (
    <article className="diagnostic-panel editor-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Runtime Overlay</p>
          <h2>Canvas run state</h2>
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="empty-state compact">
          当前 workflow 还没有可复用的 run 记录。等执行链路产生 `runs / node_runs / run_events`
          后，这里会自动承接画布高亮和时间线。
        </p>
      ) : (
        <>
          <div className="binding-actions">
            <label className="binding-field runtime-overlay-select">
              <span className="binding-label">Recent run</span>
              <select
                className="binding-select"
                value={selectedRunId ?? ""}
                onChange={(event) => onSelectRunId(event.target.value)}
              >
                {runs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.status} · {formatTimestamp(item.created_at)} · {item.id}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="sync-button"
              type="button"
              onClick={onRefreshRuns}
              disabled={isRefreshingRuns}
            >
              {isRefreshingRuns ? "刷新中..." : "刷新 recent runs"}
            </button>
          </div>

          {run ? (
            <>
              <div className="summary-strip compact-strip">
                <article className="summary-card">
                  <span>Status</span>
                  <strong>{run.status}</strong>
                </article>
                <article className="summary-card">
                  <span>Node runs</span>
                  <strong>{run.node_runs.length}</strong>
                </article>
                <article className="summary-card">
                  <span>Trace events</span>
                  <strong>{trace?.summary.total_event_count ?? run.event_count}</strong>
                </article>
              </div>

              <p className="section-copy">
                Created {formatTimestamp(run.created_at)} · Duration{" "}
                {formatDuration(run.started_at, run.finished_at)} · Workflow version{" "}
                {run.workflow_version}
              </p>

              {workflowCatalogGapSummary ? (
                <div className="payload-card compact-card runtime-overlay-governance-card">
                  <div className="payload-card-header">
                    <span className="status-meta">Workflow governance</span>
                    <span className="event-chip">{workflowCatalogGapSummary}</span>
                  </div>
                  <p className="section-copy entry-copy">
                    {workflowCatalogGapToolCopy
                      ? `当前这条 run 对应的 workflow 版本仍有 catalog gap（${workflowCatalogGapToolCopy}）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照当前 node timeline 与 trace。`
                      : "当前这条 run 对应的 workflow 版本仍有 catalog gap；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照当前 node timeline 与 trace。"}
                  </p>
                  {workflowGovernanceHref ? (
                    <Link className="inline-link" href={workflowGovernanceHref}>
                      回到 workflow 编辑器处理 catalog gap
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {legacyAuthHandoff ? (
                <div className="payload-card compact-card runtime-overlay-governance-card">
                  <div className="payload-card-header">
                    <span className="status-meta">{legacyAuthSurfaceCopy.title}</span>
                    <span className="event-chip">{legacyAuthHandoff.bindingChipLabel}</span>
                    <span className="event-chip">{legacyAuthHandoff.statusChipLabel}</span>
                  </div>
                  <p className="section-copy entry-copy">{legacyAuthHandoff.detail}</p>
                  {workflowGovernanceHref ? (
                    <Link className="inline-link" href={workflowGovernanceHref}>
                      回到 workflow 编辑器处理 publish auth contract
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="hero-actions">
                {runDrilldownLink ? (
                  <Link className="inline-link" href={runDrilldownLink.href}>
                    {runDrilldownLink.label}
                  </Link>
                ) : null}
                <RunTraceExportActions
                  callbackWaitingAutomation={callbackWaitingAutomation}
                  formats={["json"]}
                  query={{
                    limit: DEFAULT_RUN_TRACE_LIMIT,
                    order: "asc"
                  }}
                  requesterId="workflow-run-overlay-export"
                  runId={run.id}
                  sandboxReadiness={sandboxReadiness}
                />
              </div>

              {selectedNodeRun ? (
                <div className="payload-card compact-card runtime-overlay-focus-card">
                  <div className="payload-card-header">
                    <span className="status-meta">Selected node run</span>
                    <span className={`health-pill ${selectedNodeRun.status}`}>
                      {selectedNodeRun.status}
                    </span>
                  </div>
                  <p className="activity-copy">
                    {selectedNodeRun.node_name} · {selectedNodeRun.node_type} · node run{" "}
                    {selectedNodeRun.id}
                  </p>
                  <p className="event-run">
                    Started {formatTimestamp(selectedNodeRun.started_at)} · Duration{" "}
                    {formatDuration(selectedNodeRun.started_at, selectedNodeRun.finished_at)}
                  </p>
                  {selectedNodeRun.error_message ? (
                    <p className="run-error-message">{selectedNodeRun.error_message}</p>
                  ) : null}
                </div>
              ) : null}

              {runSnapshotModel ? (
                <div className="runtime-overlay-focus-card">
                  <p className="section-copy entry-copy">
                    {buildExecutionFocusSurfaceDescription("overlay")}
                  </p>
                  <InlineOperatorActionFeedback
                    status="success"
                    message=""
                    resolveRunDetailHref={resolveRunDetailHref}
                    runId={run.id}
                    runSnapshot={runSnapshotModel}
                    callbackWaitingSummaryProps={callbackWaitingSummaryProps}
                    sandboxReadiness={sandboxReadiness}
                    title={operatorSurfaceCopy.executionFocusTitle}
                  />
                  {sandboxReadinessNode ? (
                    <SandboxExecutionReadinessCard
                      node={sandboxReadinessNode}
                      readiness={sandboxReadiness}
                    />
                  ) : null}
                </div>
              ) : (
                <p className="empty-state compact">
                  当前 run 还没有可复用的 canonical execution focus snapshot。
                </p>
              )}

              <div className="timeline-list runtime-overlay-timeline">
                {run.node_runs.length === 0 ? (
                  <p className="empty-state compact">当前 run 还没有节点执行记录。</p>
                ) : (
                  run.node_runs.map((nodeRun) => (
                    <article
                      className={`timeline-row compact-card ${
                        selectedNodeId === nodeRun.node_id ? "selected" : ""
                      }`}
                      key={nodeRun.id}
                    >
                      <div className="activity-header">
                        <div>
                          <h3>{nodeRun.node_name}</h3>
                          <p className="timeline-meta">
                            {nodeRun.node_type} · node {nodeRun.node_id}
                          </p>
                        </div>
                        <span className={`health-pill ${nodeRun.status}`}>
                          {nodeRun.status}
                        </span>
                      </div>
                      <p className="event-run">
                        {formatDuration(nodeRun.started_at, nodeRun.finished_at)} · node run{" "}
                        {nodeRun.id}
                      </p>
                    </article>
                  ))
                )}
              </div>

              <div className="payload-card compact-card runtime-overlay-trace-card">
                <div className="payload-card-header">
                  <span className="status-meta">Trace preview</span>
                  {isLoading ? (
                    <span className="event-chip">loading</span>
                  ) : traceError ? (
                    <span className="event-chip">trace unavailable</span>
                  ) : (
                    <span className="event-chip">
                      {trace?.summary.returned_event_count ?? 0} events
                    </span>
                  )}
                </div>

                {traceError ? (
                  <p className="run-error-message">{traceError}</p>
                ) : tracePreview.length === 0 ? (
                  <p className="empty-state compact">当前没有可展示的 trace 事件。</p>
                ) : (
                  <div className="event-list runtime-overlay-event-list">
                    {tracePreview.map((event) => (
                      <article className="event-row compact-card" key={event.id}>
                        <div className="event-meta">
                          <span>{event.event_type}</span>
                          <span>+{formatDurationMs(event.replay_offset_ms)}</span>
                        </div>
                        <p className="event-run">
                          {event.node_run_id
                            ? `${findNodeRunName(run, event.node_run_id)} · node run ${event.node_run_id}`
                            : `run ${event.run_id}`}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="empty-state compact">
              {isLoading
                ? "正在加载选中 run 的 node_runs 与 trace..."
                : "选择一个 recent run 后，这里会显示节点时间线和回放入口。"}
            </p>
          )}
        </>
      )}
    </article>
  );
}

function findNodeRunName(run: RunDetail | null, nodeRunId: string) {
  if (!run) {
    return "unknown node";
  }

  const nodeRun = run.node_runs.find((item) => item.id === nodeRunId);
  return nodeRun?.node_name ?? "unknown node";
}
