import type { Metadata } from "next";
import Link from "next/link";

import { CrossEntryRiskDigestPanel } from "@/components/cross-entry-risk-digest-panel";
import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import { SandboxReadinessOverviewCard } from "@/components/sandbox-readiness-overview-card";
import {
  WorkbenchEntryLink,
  WorkbenchEntryLinks,
  type WorkbenchEntryLinkKey,
  type WorkbenchEntryLinkOverride
} from "@/components/workbench-entry-links";
import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import {
  buildWorkspaceStarterSourceGovernanceSurface
} from "@/components/workspace-starter-library/shared";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import { WorkflowLibraryLegacyAuthGovernanceCard } from "@/components/workflow-library-legacy-auth-governance-card";
import { buildCrossEntryRiskDigest } from "@/lib/cross-entry-risk-digest";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import {
  getWorkflowLibrarySnapshot,
  type WorkflowLibraryStarterItem
} from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import { buildSensitiveAccessInboxRecommendedNextStep } from "@/lib/operator-workbench-next-step";
import type { OperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import {
  buildAuthorFacingWorkflowDetailLinkSurface,
  buildWorkflowLibrarySurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import {
  getSystemOverview,
  type CallbackWaitingAutomationCheck,
  type SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { getWorkflows, type WorkflowListItem } from "@/lib/get-workflows";
import { buildLegacyPublishAuthModeFollowUp } from "@/lib/legacy-publish-auth-contract";
import { formatCountMap } from "@/lib/runtime-presenters";
import { getWorkflowLegacyPublishAuthIssues } from "@/lib/workflow-definition-governance";
import {
  appendWorkflowLibraryViewState,
  readWorkflowLibraryViewState,
  type WorkflowLibraryViewState
} from "@/lib/workflow-library-query";
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
  const workflowLibraryViewState = readWorkflowLibraryViewState(resolvedSearchParams);
  const [
    workflowInventory,
    filteredWorkflows,
    systemOverview,
    sensitiveAccessInbox,
    workflowLibrary,
    legacyAuthGovernanceSnapshot
  ] = await Promise.all([
    getWorkflows(),
    workflowLibraryViewState.definitionIssue
      ? getWorkflows({
          definitionIssue: workflowLibraryViewState.definitionIssue
        })
      : Promise.resolve<WorkflowListItem[] | null>(null),
    getSystemOverview(),
    getSensitiveAccessInboxSnapshot(),
    getWorkflowLibrarySnapshot(),
    getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot()
  ]);
  const workflows = filteredWorkflows ?? workflowInventory;
  const baseWorkflowLibraryHref = buildWorkflowLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterViewState
  );
  const workflowLibraryHref = appendWorkflowLibraryViewState(
    baseWorkflowLibraryHref,
    workflowLibraryViewState
  );
  const clearWorkflowLibraryFilterHref = appendWorkflowLibraryViewState(
    baseWorkflowLibraryHref,
    {
      definitionIssue: null
    }
  );
  const legacyPublishAuthFilterHref = appendWorkflowLibraryViewState(
    baseWorkflowLibraryHref,
    {
      definitionIssue: "legacy_publish_auth"
    }
  );
  const missingToolFilterHref = appendWorkflowLibraryViewState(baseWorkflowLibraryHref, {
    definitionIssue: "missing_tool"
  });
  const isLegacyPublishAuthFilterActive =
    workflowLibraryViewState.definitionIssue === "legacy_publish_auth";
  const isMissingToolFilterActive = workflowLibraryViewState.definitionIssue === "missing_tool";
  const summary = buildWorkflowLibrarySummary(workflowInventory);
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
    sensitiveAccessEntries: sensitiveAccessInbox.entries,
    sensitiveAccessSummary: sensitiveAccessInbox.summary,
    callbackWaitingAutomation: systemOverview.callback_waiting_automation,
    sandboxReadiness: systemOverview.sandbox_readiness,
    currentHref: workflowLibraryHref,
    workspaceStarterViewState,
    workflowLibraryViewState
  });
  const emptyStateStarterFollowUp =
    workflows.length === 0
      ? buildWorkflowLibraryEmptyStateStarterFollowUp({
          starters: workflowLibrary.starters,
          workspaceStarterViewState
        })
      : null;
  const crossEntryRiskDigest = buildCrossEntryRiskDigest({
    sandboxReadiness: systemOverview.sandbox_readiness,
    callbackWaitingAutomation: systemOverview.callback_waiting_automation,
    recentEvents: systemOverview.runtime_activity.recent_events,
    sensitiveAccessSummary: sensitiveAccessInbox.summary,
    channels: sensitiveAccessInbox.channels,
    sensitiveAccessEntries: sensitiveAccessInbox.entries
  });
  const legacyAuthWorkflowDetailHrefsById = Object.fromEntries(
    (legacyAuthGovernanceSnapshot?.workflows ?? []).map((workflow) => [
      workflow.workflow_id,
      buildFilteredWorkflowDetailLink({
        workflowId: workflow.workflow_id,
        viewState: workspaceStarterViewState,
        workflowLibraryViewState: {
          definitionIssue: "legacy_publish_auth"
        },
        variant: "editor"
      }).href
    ])
  );

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

          <div className="summary-strip">
            <Link
              className={`event-chip inbox-filter-link${
                !isLegacyPublishAuthFilterActive && !isMissingToolFilterActive ? " active" : ""
              }`}
              href={clearWorkflowLibraryFilterHref}
            >
              全部 workflow
            </Link>
            <Link
              className={`event-chip inbox-filter-link${
                isLegacyPublishAuthFilterActive ? " active" : ""
              }`}
              href={legacyPublishAuthFilterHref}
            >
              Legacy publish auth blocker
            </Link>
            <Link
              className={`event-chip inbox-filter-link${
                isMissingToolFilterActive ? " active" : ""
              }`}
              href={missingToolFilterHref}
            >
              Missing catalog tool
            </Link>
          </div>

          {isLegacyPublishAuthFilterActive ? (
            <p className="section-copy">
              当前列表只显示 legacy publish auth blocker，共 {workflows.length} / {summary.workflowCount} 个
              workflow；逐个回 editor 保存后，再回 publish 面板补发新版 binding。
            </p>
          ) : isMissingToolFilterActive ? (
            <p className="section-copy">
              当前列表只显示缺失 catalog tool 的 workflow，共 {workflows.length} / {summary.workflowCount} 个
              workflow；优先回 editor 补齐缺失 binding，再继续排查其余治理信号。
            </p>
          ) : null}

          {workflows.length === 0 ? (
            <div className="empty-state-block">
              <p className="empty-state">
                {(isLegacyPublishAuthFilterActive || isMissingToolFilterActive) &&
                summary.workflowCount > 0
                  ? isLegacyPublishAuthFilterActive
                    ? "当前筛选范围里已经没有 legacy publish auth blocker。可以清除筛选，继续检查其余 workflow 治理信号。"
                    : "当前筛选范围里已经没有缺失 catalog tool 的 workflow。可以清除筛选，继续检查其余 workflow 治理信号。"
                  : surfaceCopy.emptyState}
              </p>
              {(isLegacyPublishAuthFilterActive || isMissingToolFilterActive) &&
              summary.workflowCount > 0 ? (
                <Link className="inline-link" href={clearWorkflowLibraryFilterHref}>
                  清除筛选
                </Link>
              ) : emptyStateStarterFollowUp ? (
                <WorkspaceStarterFollowUpCard
                  detail={emptyStateStarterFollowUp.detail}
                  headline={emptyStateStarterFollowUp.headline}
                  label={emptyStateStarterFollowUp.label}
                  primaryResourceSummary={emptyStateStarterFollowUp.primaryResourceSummary}
                  actions={
                    emptyStateStarterFollowUp.entryKey ? (
                      <WorkbenchEntryLink
                        className="inline-link"
                        currentHref={workflowLibraryHref}
                        linkKey={emptyStateStarterFollowUp.entryKey}
                        override={emptyStateStarterFollowUp.entryOverride}
                      />
                    ) : null
                  }
                />
              ) : recommendedNextStep ? (
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
                const workflowDetailLink = buildFilteredWorkflowDetailLink({
                  workflowId: workflow.id,
                  viewState: workspaceStarterViewState,
                  workflowLibraryViewState
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
              <h2>治理与隔离信号</h2>
            </div>
            <p className="section-copy">{surfaceCopy.governanceDescription}</p>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Governed tools</span>
              <strong>{summary.governedToolCount}</strong>
            </article>
            <article className="summary-card">
              <span>Publish auth workflows</span>
              <strong>{summary.workflowLegacyPublishAuthCount}</strong>
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

          <WorkflowLibraryLegacyAuthGovernanceCard
            snapshot={legacyAuthGovernanceSnapshot}
            workflowDetailHrefsById={legacyAuthWorkflowDetailHrefsById}
            workflowLibraryFilterHref={legacyPublishAuthFilterHref}
          />

          <div className="event-type-strip">
            {summary.workflowsWithLegacyPublishAuth.length === 0 ? (
              <p className="empty-state compact">
                当前 workflow 列表里没有 legacy publish auth blocker。
              </p>
            ) : (
              summary.workflowsWithLegacyPublishAuth.map((workflow) => (
                <Link
                  className="event-chip inbox-filter-link"
                  href={buildFilteredWorkflowDetailLink({
                    workflowId: workflow.id,
                    viewState: workspaceStarterViewState,
                    workflowLibraryViewState: {
                      definitionIssue: "legacy_publish_auth"
                    }
                  }).href}
                  key={`${workflow.id}-publish-auth`}
                >
                  {workflow.name} · publish auth blocker
                </Link>
              ))
            )}
          </div>

          <div className="event-type-strip">
            {summary.workflowsWithMissingTools.length === 0 ? (
              <p className="empty-state compact">当前 workflow 列表里没有缺失 catalog tool 的条目。</p>
            ) : (
              summary.workflowsWithMissingTools.map((workflow) => (
                <Link
                  className="event-chip inbox-filter-link"
                  href={buildFilteredWorkflowDetailLink({
                    workflowId: workflow.id,
                    viewState: workspaceStarterViewState,
                    workflowLibraryViewState: {
                      definitionIssue: "missing_tool"
                    }
                  }).href}
                  key={`${workflow.id}-missing-tool`}
                >
                  {workflow.name} · missing tools
                </Link>
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
  const workflowsWithLegacyPublishAuth: WorkflowListItem[] = [];
  const workflowsWithMissingTools: WorkflowListItem[] = [];
  const workflowsWithStrongIsolation: WorkflowListItem[] = [];

  for (const workflow of workflows) {
    statusCounts[workflow.status] = (statusCounts[workflow.status] ?? 0) + 1;
    totalNodeCount += workflow.node_count;
    governedToolCount += workflow.tool_governance?.governed_tool_count ?? 0;
    strongIsolationToolCount += workflow.tool_governance?.strong_isolation_tool_count ?? 0;

    if (getWorkflowLegacyPublishAuthIssues(workflow).length > 0) {
      workflowsWithLegacyPublishAuth.push(workflow);
    }
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
    workflowLegacyPublishAuthCount: workflowsWithLegacyPublishAuth.length,
    workflowsWithLegacyPublishAuth,
    workflowMissingToolCount: workflowsWithMissingTools.length,
    workflowsWithMissingTools,
    workflowsWithStrongIsolation,
    statusCounts
  };
}

function buildWorkflowLibraryRecommendedNextStep({
  summary,
  sensitiveAccessEntries,
  sensitiveAccessSummary,
  callbackWaitingAutomation,
  sandboxReadiness,
  currentHref,
  workspaceStarterViewState,
  workflowLibraryViewState
}: {
  summary: ReturnType<typeof buildWorkflowLibrarySummary>;
  sensitiveAccessEntries: Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>["entries"];
  sensitiveAccessSummary: Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>["summary"];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  currentHref?: string;
  workspaceStarterViewState: Parameters<
    typeof buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState
  >[0]["viewState"];
  workflowLibraryViewState: WorkflowLibraryViewState;
}): OperatorRecommendedNextStep | null {
  const operatorGovernanceNextStep = buildSensitiveAccessInboxRecommendedNextStep({
    entries: sensitiveAccessEntries,
    summary: sensitiveAccessSummary,
    callbackWaitingAutomation,
    sandboxReadiness,
    currentHref
  });

  if (operatorGovernanceNextStep) {
    return operatorGovernanceNextStep;
  }

  const workflowLegacyPublishAuth = summary.workflowsWithLegacyPublishAuth[0] ?? null;
  if (workflowLegacyPublishAuth) {
    const workflowLink = buildFilteredWorkflowDetailLink({
      workflowId: workflowLegacyPublishAuth.id,
      viewState: workspaceStarterViewState,
      variant: "editor",
      workflowLibraryViewState
    });
    const publishAuthIssueCount = getWorkflowLegacyPublishAuthIssues(
      workflowLegacyPublishAuth
    ).length;

    return {
      label: "publish auth cleanup",
      detail:
        `当前 ${summary.workflowLegacyPublishAuthCount} 个 workflow 仍带着 legacy publish auth blocker；` +
        `优先回到 ${workflowLegacyPublishAuth.name} 处理 ${publishAuthIssueCount} 个 publish draft：${buildLegacyPublishAuthModeFollowUp()}`,
      href: workflowLink.href,
      href_label: workflowLink.label
    };
  }

  const workflowMissingTools = summary.workflowsWithMissingTools[0] ?? null;
  if (workflowMissingTools) {
    const workflowLink = buildFilteredWorkflowDetailLink({
      workflowId: workflowMissingTools.id,
      viewState: workspaceStarterViewState,
      variant: "editor",
      workflowLibraryViewState
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
    const workflowLink = buildFilteredWorkflowDetailLink({
      workflowId: workflowStrongIsolation.id,
      viewState: workspaceStarterViewState,
      variant: "editor",
      workflowLibraryViewState
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

  return null;
}

type WorkflowLibraryEmptyStateStarterFollowUp = {
  label: string;
  headline?: string | null;
  detail: string;
  primaryResourceSummary?: string | null;
  entryKey?: WorkbenchEntryLinkKey;
  entryOverride?: WorkbenchEntryLinkOverride;
};

type WorkspaceStarterFollowUpViewState = Parameters<
  typeof buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState
>[0];

function buildWorkflowLibraryEmptyStateStarterFollowUp({
  starters,
  workspaceStarterViewState
}: {
  starters: WorkflowLibraryStarterItem[];
  workspaceStarterViewState: Parameters<
    typeof buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState
  >[0]["viewState"];
}): WorkflowLibraryEmptyStateStarterFollowUp | null {
  const activeStarters = starters.filter((starter) => !starter.archived);
  if (activeStarters.length === 0) {
    return null;
  }

  const starterRequiringFollowUp =
    activeStarters.find(
      (starter) =>
        starter.sourceGovernance?.kind === "missing_source" ||
        starter.sourceGovernance?.kind === "drifted"
    ) ?? null;

  if (starterRequiringFollowUp) {
    const followUpSourceGovernanceKind =
      starterRequiringFollowUp.sourceGovernance?.kind === "missing_source" ||
      starterRequiringFollowUp.sourceGovernance?.kind === "drifted"
        ? starterRequiringFollowUp.sourceGovernance.kind
        : "all";
    const followUpViewState: WorkspaceStarterFollowUpViewState = {
      ...workspaceStarterViewState,
      activeTrack: starterRequiringFollowUp.businessTrack,
      sourceGovernanceKind: followUpSourceGovernanceKind,
      needsFollowUp: true,
      selectedTemplateId: starterRequiringFollowUp.id
    };
    const sourceGovernanceSurface = buildWorkspaceStarterSourceGovernanceSurface({
      template: toWorkspaceStarterTemplateItem(starterRequiringFollowUp),
      workspaceStarterGovernanceQueryScope: followUpViewState
    });

    return {
      label:
        sourceGovernanceSurface.recommendedNextStep?.label ??
        sourceGovernanceSurface.presenter.actionStatusLabel ??
        sourceGovernanceSurface.presenter.statusLabel,
      headline: `${starterRequiringFollowUp.name} 当前是 workflow library 空态下最先需要处理的 starter。`,
      detail:
        sourceGovernanceSurface.recommendedNextStep?.detail ??
        sourceGovernanceSurface.presenter.followUp ??
        sourceGovernanceSurface.presenter.summary,
      primaryResourceSummary:
        sourceGovernanceSurface.recommendedNextStep?.primaryResourceSummary,
      entryKey:
        sourceGovernanceSurface.recommendedNextStep?.entryKey ?? "workspaceStarterLibrary",
      entryOverride:
        sourceGovernanceSurface.recommendedNextStep?.entryOverride ?? {
          href: buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
            followUpViewState
          ),
          label: "回到治理页"
        }
    };
  }

  const starterForCreate = activeStarters[0] ?? null;
  if (starterForCreate) {
    const createViewState: WorkspaceStarterFollowUpViewState = {
      ...workspaceStarterViewState,
      activeTrack: starterForCreate.businessTrack,
      sourceGovernanceKind: "all" as const,
      needsFollowUp: false,
      selectedTemplateId: starterForCreate.id
    };
    const sourceGovernanceSurface = buildWorkspaceStarterSourceGovernanceSurface({
      template: toWorkspaceStarterTemplateItem(starterForCreate),
      workspaceStarterGovernanceQueryScope: createViewState
    });

    if (sourceGovernanceSurface.recommendedNextStep) {
      return {
        label: sourceGovernanceSurface.recommendedNextStep.label,
        headline: `${starterForCreate.name} 当前是 workflow library 空态下最先可继续推进的 starter。`,
        detail: sourceGovernanceSurface.recommendedNextStep.detail,
        primaryResourceSummary:
          sourceGovernanceSurface.recommendedNextStep.primaryResourceSummary,
        entryKey:
          sourceGovernanceSurface.recommendedNextStep.entryKey ?? "createWorkflow",
        entryOverride:
          sourceGovernanceSurface.recommendedNextStep.entryOverride ?? {
            href: buildWorkflowCreateHrefFromWorkspaceStarterViewState(createViewState),
            label: sourceGovernanceSurface.recommendedNextStep.label
          }
      };
    }

    return {
      label: "first workflow",
      detail:
        `当前还没有可编辑 workflow；优先从 starter ${starterForCreate.name} 创建首个草稿，` +
        "把作者入口继续从 starter 推进到 editor。",
      entryKey: "createWorkflow",
      entryOverride: {
        href: buildWorkflowCreateHrefFromWorkspaceStarterViewState({
          activeTrack: starterForCreate.businessTrack,
          sourceGovernanceKind: "all",
          needsFollowUp: false,
          searchQuery: "",
          selectedTemplateId: starterForCreate.id
        }),
        label: "用这个 starter 创建 workflow"
      }
    };
  }

  return null;
}

function toWorkspaceStarterTemplateItem(
  starter: WorkflowLibraryStarterItem
): WorkspaceStarterTemplateItem {
  return {
    id: starter.id,
    workspace_id: starter.workspaceId ?? "default",
    name: starter.name,
    description: starter.description,
    business_track: starter.businessTrack,
    default_workflow_name: starter.defaultWorkflowName,
    workflow_focus: starter.workflowFocus,
    recommended_next_step: starter.recommendedNextStep,
    tags: starter.tags,
    definition: starter.definition,
    created_from_workflow_id:
      starter.createdFromWorkflowId ?? starter.sourceGovernance?.sourceWorkflowId ?? null,
    created_from_workflow_version:
      starter.createdFromWorkflowVersion ?? starter.sourceGovernance?.sourceVersion ?? null,
    archived: starter.archived,
    archived_at: starter.archivedAt ?? null,
    created_at: starter.createdAt ?? "",
    updated_at: starter.updatedAt ?? starter.createdAt ?? "",
    source_governance: starter.sourceGovernance
      ? {
          kind: starter.sourceGovernance.kind,
          status_label: starter.sourceGovernance.statusLabel,
          summary: starter.sourceGovernance.summary,
          source_workflow_id: starter.sourceGovernance.sourceWorkflowId ?? null,
          source_workflow_name: starter.sourceGovernance.sourceWorkflowName ?? null,
          template_version: starter.sourceGovernance.templateVersion ?? null,
          source_version: starter.sourceGovernance.sourceVersion ?? null,
          action_decision: starter.sourceGovernance.actionDecision ?? null,
          outcome_explanation: starter.sourceGovernance.outcomeExplanation ?? null
        }
      : null
  };
}

function buildFilteredWorkflowDetailLink({
  workflowId,
  viewState,
  workflowLibraryViewState,
  variant = "chip"
}: {
  workflowId: string;
  viewState: Parameters<typeof buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState>[0]["viewState"];
  workflowLibraryViewState: WorkflowLibraryViewState;
  variant?: Parameters<typeof buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState>[0]["variant"];
}) {
  const workflowDetailLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
    workflowId,
    viewState,
    variant
  });

  return {
    ...workflowDetailLink,
    href: appendWorkflowLibraryViewState(workflowDetailLink.href, workflowLibraryViewState)
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
