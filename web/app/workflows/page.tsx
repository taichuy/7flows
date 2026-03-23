import type { Metadata } from "next";

import { CrossEntryRiskDigestPanel } from "@/components/cross-entry-risk-digest-panel";
import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import { WorkbenchEntryLink, WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import { buildCrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import {
  getWorkflowLibrarySnapshot,
  type WorkflowLibraryStarterItem
} from "@/lib/get-workflow-library";
import type { OperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import {
  buildAuthorFacingWorkflowDetailLinkSurface,
  buildWorkflowLibrarySurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import { getSystemOverview, type SandboxReadinessCheck } from "@/lib/get-system-overview";
import { getWorkflows, type WorkflowListItem } from "@/lib/get-workflows";
import { formatCountMap } from "@/lib/runtime-presenters";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState
} from "@/lib/workspace-starter-governance-query";
import {
  pickWorkspaceStarterGovernanceQueryScope,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";

export const metadata: Metadata = {
  title: "Workflows | 7Flows Studio"
};

type WorkflowsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkflowsPage({
  searchParams
}: WorkflowsPageProps = {}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const workspaceStarterViewState = pickWorkspaceStarterGovernanceQueryScope(
    readWorkspaceStarterLibraryViewState(resolvedSearchParams)
  );
  const [workflows, systemOverview, sensitiveAccessInbox, workflowLibrary] = await Promise.all([
    getWorkflows(),
    getSystemOverview(),
    getSensitiveAccessInboxSnapshot(),
    getWorkflowLibrarySnapshot()
  ]);
  const workflowLibraryHref = buildWorkflowLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const summary = buildWorkflowLibrarySummary(workflows);
  const surfaceCopy = buildWorkflowLibrarySurfaceCopy({
    createWorkflowHref: buildWorkflowCreateHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    ),
    workspaceStarterLibraryHref: buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    )
  });
  const recommendedNextStep = buildWorkflowLibraryRecommendedNextStep({
    summary,
    sandboxReadiness: systemOverview.sandbox_readiness,
    starters: workflowLibrary.starters,
    workspaceStarterViewState
  });
  const crossEntryRiskDigest = buildCrossEntryRiskDigest({
    sandboxReadiness: systemOverview.sandbox_readiness,
    callbackWaitingAutomation: systemOverview.callback_waiting_automation,
    sensitiveAccessSummary: sensitiveAccessInbox.summary,
    channels: sensitiveAccessInbox.channels
  });

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
        <CrossEntryRiskDigestPanel
          currentHref={workflowLibraryHref}
          digest={crossEntryRiskDigest}
          eyebrow="Workflow overview"
          intro="作者进入 workflow library 后先看到跨入口 blocker：当前强隔离是否可用、callback waiting 是否仍需 operator 跟进，以及 inbox backlog 是否会继续拖住发布与调试。"
        />
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
              {recommendedNextStep ? (
                <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
              ) : (
                <WorkbenchEntryLink className="inline-link" linkKey="createWorkflow">
                  进入新建向导
                </WorkbenchEntryLink>
              )}
            </div>
          ) : (
            <div className="workflow-chip-row">
              {workflows.map((workflow) => {
                const workflowDetailLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState(
                  {
                    workflowId: workflow.id,
                    viewState: workspaceStarterViewState
                  }
                );

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
            currentHref={workflowLibraryHref}
            intro="workflow library 直接暴露当前 live sandbox readiness，让作者在进入具体 editor 之前就能知道 blocked / degraded / offline backend 是否会继续影响强隔离节点。"
            hideRecommendedNextStep
            readiness={systemOverview.sandbox_readiness}
            title="Live sandbox readiness"
          />

          {recommendedNextStep ? (
            <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
          ) : null}

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
  const workflowsWithStrongIsolation: WorkflowListItem[] = [];

  for (const workflow of workflows) {
    statusCounts[workflow.status] = (statusCounts[workflow.status] ?? 0) + 1;
    totalNodeCount += workflow.node_count;
    governedToolCount += workflow.tool_governance?.governed_tool_count ?? 0;
    strongIsolationToolCount += workflow.tool_governance?.strong_isolation_tool_count ?? 0;

    if ((workflow.tool_governance?.missing_tool_ids.length ?? 0) > 0) {
      workflowsWithMissingTools.push(workflow);
    }
    if ((workflow.tool_governance?.strong_isolation_tool_count ?? 0) > 0) {
      workflowsWithStrongIsolation.push(workflow);
    }
  }

  return {
    workflowCount: workflows.length,
    totalNodeCount,
    governedToolCount,
    strongIsolationToolCount,
    workflowMissingToolCount: workflowsWithMissingTools.length,
    workflowsWithMissingTools,
    workflowsWithStrongIsolation,
    statusCounts
  };
}

function buildWorkflowLibraryRecommendedNextStep({
  summary,
  sandboxReadiness,
  starters,
  workspaceStarterViewState
}: {
  summary: ReturnType<typeof buildWorkflowLibrarySummary>;
  sandboxReadiness?: SandboxReadinessCheck | null;
  starters: WorkflowLibraryStarterItem[];
  workspaceStarterViewState: Parameters<
    typeof buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState
  >[0]["viewState"];
}): OperatorRecommendedNextStep | null {
  const workflowMissingTools = summary.workflowsWithMissingTools[0] ?? null;
  if (workflowMissingTools) {
    const workflowLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
      workflowId: workflowMissingTools.id,
      viewState: workspaceStarterViewState,
      variant: "editor"
    });
    const missingToolCount = workflowMissingTools.tool_governance?.missing_tool_ids.length ?? 0;

    return {
      label: "tool governance",
      detail:
        `当前 ${summary.workflowMissingToolCount} 个 workflow 仍缺少 catalog tool 绑定；` +
        `优先回到 ${workflowMissingTools.name} 补齐 ${missingToolCount} 个 missing tool，再继续清理其余条目。`,
      href: workflowLink.href,
      href_label: workflowLink.label
    };
  }

  const workflowStrongIsolation = summary.workflowsWithStrongIsolation[0] ?? null;
  if (workflowStrongIsolation && hasWorkflowLibrarySandboxRisk(sandboxReadiness)) {
    const workflowLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
      workflowId: workflowStrongIsolation.id,
      viewState: workspaceStarterViewState,
      variant: "editor"
    });

    return {
      label: "sandbox workflow",
      detail:
        `当前 ${summary.workflowsWithStrongIsolation.length} 个 workflow 仍依赖 strong isolation，` +
        `而 live sandbox readiness 还没完全恢复；优先打开 ${workflowStrongIsolation.name} ` +
        "核对 execution class、fallback 与隔离需求。",
      href: workflowLink.href,
      href_label: workflowLink.label
    };
  }

  if (summary.workflowCount === 0) {
    return buildWorkflowLibraryEmptyStateRecommendedNextStep(
      starters,
      workspaceStarterViewState
    );
  }

  return null;
}

function buildWorkflowLibraryEmptyStateRecommendedNextStep(
  starters: WorkflowLibraryStarterItem[],
  workspaceStarterViewState: Parameters<
    typeof buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState
  >[0]["viewState"]
): OperatorRecommendedNextStep {
  const activeStarters = starters.filter((starter) => !starter.archived);
  const starterRequiringGovernanceFollowUp =
    activeStarters.find(
      (starter) =>
        starter.sourceGovernance?.kind === "missing_source" ||
        starter.sourceGovernance?.kind === "drifted"
    ) ?? null;

  if (starterRequiringGovernanceFollowUp) {
    const governanceKind = starterRequiringGovernanceFollowUp.sourceGovernance?.kind ?? "all";

    return {
      label: "starter governance",
      detail:
        `当前还没有可编辑 workflow，而 workspace starter ${starterRequiringGovernanceFollowUp.name} ` +
        `仍处于${starterRequiringGovernanceFollowUp.sourceGovernance?.statusLabel ?? "待治理"}；` +
        "先回到治理页收口来源问题，再从该 starter 创建第一个 workflow。",
      href: buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState({
        activeTrack: starterRequiringGovernanceFollowUp.businessTrack,
        sourceGovernanceKind: governanceKind,
        needsFollowUp: true,
        searchQuery: "",
        selectedTemplateId: starterRequiringGovernanceFollowUp.id
      }),
      href_label: "回到治理页"
    };
  }

  const starterForCreate = activeStarters[0] ?? null;
  if (starterForCreate) {
    return {
      label: "first workflow",
      detail:
        `当前还没有可编辑 workflow；优先从 starter ${starterForCreate.name} 创建首个草稿，` +
        "把作者入口继续从 starter 推进到 editor。",
      href: buildWorkflowCreateHrefFromWorkspaceStarterViewState({
        activeTrack: starterForCreate.businessTrack,
        sourceGovernanceKind: "all",
        needsFollowUp: false,
        searchQuery: "",
        selectedTemplateId: starterForCreate.id
      }),
      href_label: "用这个 starter 创建 workflow"
    };
  }

  return {
    label: "starter library",
    detail:
      "当前 workflow 列表仍为空，workspace starter library 里也还没有可直接复用的 active starter；先准备第一个 starter，再回到创建页继续主链。",
    href: buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
      workspaceStarterViewState
    ),
    href_label: "打开 workspace starter library"
  };
}

function hasWorkflowLibrarySandboxRisk(readiness?: SandboxReadinessCheck | null) {
  if (!readiness) {
    return false;
  }

  return (
    readiness.offline_backend_count > 0 ||
    readiness.degraded_backend_count > 0 ||
    readiness.execution_classes.some((executionClass) => !executionClass.available)
  );
}
