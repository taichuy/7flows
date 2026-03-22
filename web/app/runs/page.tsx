import type { Metadata } from "next";
import Link from "next/link";

import { CrossEntryRiskDigestPanel } from "@/components/cross-entry-risk-digest-panel";
import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import {
  WorkbenchEntryLink,
  WorkbenchEntryLinks
} from "@/components/workbench-entry-links";
import { buildCrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import {
  buildAuthorFacingWorkflowDetailLinkSurface,
  buildAuthorFacingRunDetailLinkSurface,
  buildRunLibrarySurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import { getSystemOverview } from "@/lib/get-system-overview";
import { formatCountMap, formatTimestamp } from "@/lib/runtime-presenters";

export const metadata: Metadata = {
  title: "Runs | 7Flows Studio"
};

export default async function RunsPage() {
  const [overview, sensitiveAccessInbox] = await Promise.all([
    getSystemOverview(),
    getSensitiveAccessInboxSnapshot()
  ]);
  const recentRuns = overview.runtime_activity.recent_runs;
  const activitySummary = overview.runtime_activity.summary;
  const latestRun = recentRuns[0] ?? null;
  const latestRunDetailLink = latestRun
    ? buildAuthorFacingRunDetailLinkSurface({
        runId: latestRun.id,
        variant: "latest"
      })
    : null;
  const surfaceCopy = buildRunLibrarySurfaceCopy();
  const crossEntryRiskDigest = buildCrossEntryRiskDigest({
    sandboxReadiness: overview.sandbox_readiness,
    callbackWaitingAutomation: overview.callback_waiting_automation,
    sensitiveAccessSummary: sensitiveAccessInbox.summary,
    channels: sensitiveAccessInbox.channels
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
                <WorkbenchEntryLink className="inline-link" linkKey="workflowLibrary" />
              </div>
            ) : (
              recentRuns.map((run) => {
                const runDetailLink = buildAuthorFacingRunDetailLinkSurface({
                  runId: run.id
                });
                const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
                  workflowId: run.workflow_id,
                  variant: "editor"
                });

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
                      <Link className="activity-link" href={runDetailLink.href}>
                        {runDetailLink.label}
                      </Link>
                      <Link className="inline-link secondary" href={workflowDetailLink.href}>
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
              Object.entries(activitySummary.event_types).map(([eventType, count]) => (
                <span className="event-chip" key={eventType}>
                  {eventType} · {count}
                </span>
              ))
            )}
          </div>

          <SandboxReadinessOverviewCard
            intro="run library 先直接暴露当前 sandbox backend 的健康度与 blocked execution class，避免 operator 还没进入 run detail 就误判强隔离链路已经恢复。"
            readiness={overview.sandbox_readiness}
            title="Live sandbox readiness"
          />

          <div className="entry-card">
            <p className="entry-card-title">{surfaceCopy.operatorEntryTitle}</p>
            <p className="section-copy entry-copy">{surfaceCopy.operatorEntryDescription}</p>
            <WorkbenchEntryLinks {...surfaceCopy.operatorEntryLinks} />
            {latestRunDetailLink ? (
              <Link className="inline-link secondary" href={latestRunDetailLink.href}>
                {latestRunDetailLink.label}
              </Link>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
