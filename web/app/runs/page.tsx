import type { Metadata } from "next";
import Link from "next/link";

import { CrossEntryRiskDigestPanel } from "@/components/cross-entry-risk-digest-panel";
import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import {
  WorkbenchEntryLinks
} from "@/components/workbench-entry-links";
import { buildCrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { buildRunLibraryRecommendedNextStep } from "@/lib/operator-workbench-next-step";
import {
  buildAuthorFacingWorkflowDetailLinkSurface,
  buildAuthorFacingRunDetailLinkSurface,
  buildRunLibrarySurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import { getSystemOverview } from "@/lib/get-system-overview";
import { formatCountMap, formatTimestamp } from "@/lib/runtime-presenters";
import {
  buildRuntimeActivityEventTraceLinkSurface,
  buildRuntimeActivityEventTypeTraceLinkSurface
} from "@/lib/runtime-activity-trace-links";
import {
  buildRunDetailHrefFromWorkspaceStarterViewState,
  buildRunLibraryHrefFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";

export const metadata: Metadata = {
  title: "Runs | 7Flows Studio"
};

type RunsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RunsPage({ searchParams }: RunsPageProps = {}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const workspaceStarterViewState = readWorkspaceStarterLibraryViewState(
    resolvedSearchParams
  );
  const workflowLibraryHref = buildWorkflowLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const runLibraryHref = buildRunLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const [overview, sensitiveAccessInbox] = await Promise.all([
    getSystemOverview(),
    getSensitiveAccessInboxSnapshot()
  ]);
  const recentRuns = overview.runtime_activity.recent_runs;
  const recentEvents = overview.runtime_activity.recent_events;
  const activitySummary = overview.runtime_activity.summary;
  const latestRun = recentRuns[0] ?? null;
  const latestRunDetailLink = latestRun
    ? buildAuthorFacingRunDetailLinkSurface({
        runId: latestRun.id,
        variant: "latest"
      })
    : null;
  const latestRunDetailHref = latestRun
    ? buildRunDetailHrefFromWorkspaceStarterViewState(latestRun.id, workspaceStarterViewState)
    : null;
  const surfaceCopy = buildRunLibrarySurfaceCopy({ workflowLibraryHref });
  const crossEntryRiskDigest = buildCrossEntryRiskDigest({
    sandboxReadiness: overview.sandbox_readiness,
    callbackWaitingAutomation: overview.callback_waiting_automation,
    recentEvents,
    sensitiveAccessSummary: sensitiveAccessInbox.summary,
    channels: sensitiveAccessInbox.channels,
    sensitiveAccessEntries: sensitiveAccessInbox.entries
  });
  const recommendedNextStep = buildRunLibraryRecommendedNextStep({
    runtimeActivity: overview.runtime_activity,
    callbackWaitingAutomation: overview.callback_waiting_automation,
    sandboxReadiness: overview.sandbox_readiness,
    sensitiveAccessSummary: sensitiveAccessInbox.summary,
    currentHref: runLibraryHref
  });

  return (
    <main className="page-shell workspace-page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Run library</p>
          <h1>运行诊断入口收口到独立列表</h1>
          <p className="hero-copy">{surfaceCopy.heroDescription}</p>
        </div>
        <WorkbenchEntryLinks {...surfaceCopy.heroLinks} />
      </section>

      <section className="diagnostics-layout">
        <CrossEntryRiskDigestPanel
          currentHref={runLibraryHref}
          digest={crossEntryRiskDigest}
          eyebrow="Run overview"
          intro="进入 run library 后先看跨入口 blocker：强隔离 execution class、callback recovery 与 operator backlog 是否已经收口，再决定去具体 run、workflow 或 inbox。"
        />
      </section>

      <section className="diagnostics-layout runtime-layout">
        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recent runs</p>
              <h2>统一 run 事实入口</h2>
            </div>
            <p className="section-copy">{surfaceCopy.recentRunsDescription}</p>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Recent runs</span>
              <strong>{activitySummary.recent_run_count}</strong>
            </article>
            <article className="summary-card">
              <span>Recent events</span>
              <strong>{activitySummary.recent_event_count}</strong>
            </article>
            <article className="summary-card">
              <span>Run statuses</span>
              <strong>{formatCountMap(activitySummary.run_statuses)}</strong>
            </article>
          </div>

          <div className="activity-list">
            {recentRuns.length === 0 ? (
              <div className="empty-state-block">
                <p className="empty-state">{surfaceCopy.emptyState}</p>
                <Link className="inline-link" href={workflowLibraryHref}>
                  打开 workflow 列表
                </Link>
              </div>
            ) : (
              recentRuns.map((run) => {
                const runDetailLink = buildAuthorFacingRunDetailLinkSurface({
                  runId: run.id
                });
                const runDetailHref = buildRunDetailHrefFromWorkspaceStarterViewState(
                  run.id,
                  workspaceStarterViewState
                );
                const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
                  workflowId: run.workflow_id,
                  variant: "editor"
                });
                const workflowDetailHref = buildWorkflowEditorHrefFromWorkspaceStarterViewState(
                  run.workflow_id,
                  workspaceStarterViewState
                );

                return (
                  <article className="activity-row" key={run.id}>
                    <div className="activity-header">
                      <div>
                        <h3>{run.workflow_id}</h3>
                        <p>
                          run {run.id} · version {run.workflow_version}
                        </p>
                      </div>
                      <span className={`health-pill ${run.status}`}>{run.status}</span>
                    </div>
                    <p className="activity-copy">
                      Created {formatTimestamp(run.created_at)} · events {run.event_count}
                    </p>
                    <div className="section-actions">
                      <Link className="activity-link" href={runDetailHref}>
                        {runDetailLink.label}
                      </Link>
                      <Link className="inline-link secondary" href={workflowDetailHref}>
                        {workflowDetailLink.label}
                      </Link>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Event spine</p>
              <h2>事件流聚合信号</h2>
            </div>
            <p className="section-copy">
              调试、流式输出和 callback waiting follow-up 继续复用同一条 run events 事件脊柱；这里保留聚合信号，详情仍进入具体 run。
            </p>
          </div>

          <div className="event-type-strip">
            {Object.keys(activitySummary.event_types).length === 0 ? (
              <p className="empty-state compact">当前还没有可聚合的事件类型统计。</p>
            ) : (
              Object.entries(activitySummary.event_types).map(([eventType, count]) => {
                const traceLink = buildRuntimeActivityEventTypeTraceLinkSurface({
                  eventType,
                  recentEvents,
                  resolveRunHref: (runId) =>
                    buildRunDetailHrefFromWorkspaceStarterViewState(runId, workspaceStarterViewState)
                });

                return traceLink ? (
                  <Link
                    className="event-chip inbox-filter-link"
                    href={traceLink.href}
                    key={eventType}
                    title={traceLink.label}
                  >
                    {eventType} · {count}
                  </Link>
                ) : (
                  <span className="event-chip" key={eventType}>
                    {eventType} · {count}
                  </span>
                );
              })
            )}
          </div>

          {recentEvents.length === 0 ? (
            <p className="empty-state compact">当前还没有最近事件样本可用于 trace 深链。</p>
          ) : (
            <div className="event-list">
              {recentEvents.slice(0, 3).map((event) => {
                const traceLink = buildRuntimeActivityEventTraceLinkSurface(event, {
                  resolveRunHref: (runId) =>
                    buildRunDetailHrefFromWorkspaceStarterViewState(runId, workspaceStarterViewState),
                  hrefLabel: "open recent event trace"
                });

                return (
                  <article className="event-row" key={event.id}>
                    <div className="event-meta">
                      <span>{event.event_type}</span>
                      <span>{formatTimestamp(event.created_at)}</span>
                    </div>
                    <p className="event-run">
                      {event.node_run_id
                        ? `run ${event.run_id} · node run ${event.node_run_id}`
                        : `run ${event.run_id}`}
                    </p>
                    <p className="activity-copy">
                      {event.payload_preview || "当前事件没有 payload preview。"}
                    </p>
                    {event.payload_keys.length > 0 ? (
                      <div className="event-type-strip">
                        {event.payload_keys.slice(0, 3).map((payloadKey) => (
                          <span className="event-chip" key={`${event.id}-${payloadKey}`}>
                            {payloadKey}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {traceLink ? (
                      <div className="section-actions">
                        <Link className="inline-link secondary" href={traceLink.href}>
                          {traceLink.label}
                        </Link>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}

          <SandboxReadinessOverviewCard
            currentHref={runLibraryHref}
            intro="run library 先直接暴露当前 sandbox backend 的健康度与 blocked execution class，避免 operator 还没进入 run detail 就误判强隔离链路已经恢复。"
            hideRecommendedNextStep={Boolean(recommendedNextStep)}
            readiness={overview.sandbox_readiness}
            title="Live sandbox readiness"
          />

          <div className="entry-card">
            <p className="entry-card-title">{surfaceCopy.operatorEntryTitle}</p>
            <p className="section-copy entry-copy">{surfaceCopy.operatorEntryDescription}</p>
            {recommendedNextStep ? (
              <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
            ) : null}
            <WorkbenchEntryLinks {...surfaceCopy.operatorEntryLinks} />
            {latestRunDetailLink ? (
              <Link
                className="inline-link secondary"
                href={latestRunDetailHref ?? latestRunDetailLink.href}
              >
                {latestRunDetailLink.label}
              </Link>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
