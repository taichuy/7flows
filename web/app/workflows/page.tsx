import type { Metadata } from "next";

import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import { WorkbenchEntryLink, WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import {
  buildAuthorFacingWorkflowDetailLinkSurface,
  buildWorkflowLibrarySurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflows, type WorkflowListItem } from "@/lib/get-workflows";
import { formatCountMap } from "@/lib/runtime-presenters";

export const metadata: Metadata = {
  title: "Workflows | 7Flows Studio"
};

export default async function WorkflowsPage() {
  const [workflows, systemOverview] = await Promise.all([
    getWorkflows(),
    getSystemOverview()
  ]);
  const summary = buildWorkflowLibrarySummary(workflows);
  const surfaceCopy = buildWorkflowLibrarySurfaceCopy();

  return (
    <main className="page-shell workspace-page">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Workflow library</p>
          <h1>作者、operator 与运行入口统一收口</h1>
          <p className="hero-copy">{surfaceCopy.heroDescription}</p>
        </div>
        <WorkbenchEntryLinks {...surfaceCopy.heroLinks} />
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Editor entry</p>
              <h2>可编辑 workflow 列表</h2>
            </div>
            <p className="section-copy">{surfaceCopy.editorListDescription}</p>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Workflows</span>
              <strong>{summary.workflowCount}</strong>
            </article>
            <article className="summary-card">
              <span>Total nodes</span>
              <strong>{summary.totalNodeCount}</strong>
            </article>
            <article className="summary-card">
              <span>Statuses</span>
              <strong>{formatCountMap(summary.statusCounts)}</strong>
            </article>
          </div>

          {workflows.length === 0 ? (
            <div className="empty-state-block">
              <p className="empty-state">
                {surfaceCopy.emptyState}
              </p>
              <WorkbenchEntryLink className="inline-link" linkKey="createWorkflow">
                进入新建向导
              </WorkbenchEntryLink>
            </div>
          ) : (
            <div className="workflow-chip-row">
              {workflows.map((workflow) => {
                const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
                  workflowId: workflow.id
                });

                return (
                  <WorkflowChipLink
                    key={`workflow-library-${workflow.id}`}
                    workflow={workflow}
                    href={workflowDetailLink.href}
                  />
                );
              })}
            </div>
          )}
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Governance</p>
              <h2>工具与隔离信号</h2>
            </div>
            <p className="section-copy">{surfaceCopy.governanceDescription}</p>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Governed tools</span>
              <strong>{summary.governedToolCount}</strong>
            </article>
            <article className="summary-card">
              <span>Strong isolation</span>
              <strong>{summary.strongIsolationToolCount}</strong>
            </article>
            <article className="summary-card">
              <span>Missing tool workflows</span>
              <strong>{summary.workflowMissingToolCount}</strong>
            </article>
          </div>

          <div className="event-type-strip">
            {summary.workflowsWithMissingTools.length === 0 ? (
              <p className="empty-state compact">当前 workflow 列表里没有缺失 catalog tool 的条目。</p>
            ) : (
              summary.workflowsWithMissingTools.map((workflow) => (
                <span className="event-chip" key={workflow.id}>
                  {workflow.name} · missing tools
                </span>
              ))
            )}
          </div>

          <SandboxReadinessOverviewCard
            intro="workflow library 直接暴露当前 live sandbox readiness，让作者在进入具体 editor 之前就能知道 blocked / degraded / offline backend 是否会继续影响强隔离节点。"
            readiness={systemOverview.sandbox_readiness}
            title="Live sandbox readiness"
          />

          <div className="entry-card">
            <p className="entry-card-title">{surfaceCopy.nextStepTitle}</p>
            <p className="section-copy entry-copy">{surfaceCopy.nextStepDescription}</p>
            <WorkbenchEntryLinks {...surfaceCopy.nextStepLinks} />
          </div>
        </article>
      </section>
    </main>
  );
}

function buildWorkflowLibrarySummary(workflows: WorkflowListItem[]) {
  const statusCounts: Record<string, number> = {};
  let totalNodeCount = 0;
  let governedToolCount = 0;
  let strongIsolationToolCount = 0;
  const workflowsWithMissingTools: WorkflowListItem[] = [];

  for (const workflow of workflows) {
    statusCounts[workflow.status] = (statusCounts[workflow.status] ?? 0) + 1;
    totalNodeCount += workflow.node_count;
    governedToolCount += workflow.tool_governance?.governed_tool_count ?? 0;
    strongIsolationToolCount += workflow.tool_governance?.strong_isolation_tool_count ?? 0;

    if ((workflow.tool_governance?.missing_tool_ids.length ?? 0) > 0) {
      workflowsWithMissingTools.push(workflow);
    }
  }

  return {
    workflowCount: workflows.length,
    totalNodeCount,
    governedToolCount,
    strongIsolationToolCount,
    workflowMissingToolCount: workflowsWithMissingTools.length,
    workflowsWithMissingTools,
    statusCounts
  };
}
