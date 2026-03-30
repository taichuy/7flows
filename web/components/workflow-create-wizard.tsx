"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  buildWorkspaceStarterMissingToolGovernanceSurface,
  buildWorkspaceStarterSourceGovernanceSurface,
  type WorkspaceStarterFollowUpSurface
} from "@/components/workspace-starter-library/shared";
import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowCreateLauncherPanel } from "@/components/workflow-create-wizard/workflow-create-launcher-panel";
import { WorkflowCreatePreviewPanel } from "@/components/workflow-create-wizard/workflow-create-preview-panel";
import { useWorkflowCreateShellState } from "@/components/workflow-create-wizard/use-workflow-create-shell-state";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import { appendWorkflowLibraryViewState } from "@/lib/workflow-library-query";
import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  describeWorkflowDefinitionSandboxDependency
} from "@/lib/workflow-definition-sandbox-governance";
import {
  formatCatalogGapToolSummary,
  getWorkflowLegacyPublishAuthBacklogCount
} from "@/lib/workflow-definition-governance";
import type {
  WorkflowLibrarySourceLane,
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import {
  buildWorkflowGovernanceHandoff,
  type WorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
import {
  buildWorkflowCreateWizardSurfaceCopy,
  type WorkflowCreateWizardSurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import {
  createWorkflow,
  type WorkflowListItem,
  WorkflowDefinitionValidationError
} from "@/lib/get-workflows";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkspaceHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import {
  buildWorkflowStarterTemplates,
  buildWorkflowStarterTracks,
  type WorkflowStarterTemplate
} from "@/lib/workflow-starters";

import { Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

type WorkflowCreateWizardProps = {
  catalogToolCount: number;
  governanceQueryScope: WorkspaceStarterGovernanceQueryScope;
  legacyAuthGovernanceSnapshot?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workflows: WorkflowListItem[];
  starters: WorkflowLibraryStarterItem[];
  starterSourceLanes: WorkflowLibrarySourceLane[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  tools: PluginToolRegistryItem[];
};

type WorkflowCreateFeaturedNode = {
  type: WorkflowNodeCatalogItem["type"];
  label: string;
  supportStatus: WorkflowNodeCatalogItem["supportStatus"];
};

const WORKFLOW_CREATE_FEATURED_NODE_TYPES = [
  "llm_agent",
  "tool",
  "condition",
  "loop",
  "mcp_query",
  "sandbox_code",
  "output"
] as const;

export function WorkflowCreateWizard({
  governanceQueryScope,
  legacyAuthGovernanceSnapshot = null,
  workflows,
  starters,
  nodeCatalog,
  tools
}: WorkflowCreateWizardProps) {
  const router = useRouter();
  const searchQuery = governanceQueryScope.searchQuery;
  const sourceGovernanceKind =
    governanceQueryScope.sourceGovernanceKind === "all"
      ? undefined
      : governanceQueryScope.sourceGovernanceKind;
  const needsFollowUp = governanceQueryScope.needsFollowUp;
  const starterTemplates = useMemo(
    () => buildWorkflowStarterTemplates(starters, nodeCatalog, tools),
    [nodeCatalog, starters, tools]
  );
  const starterTracks = useMemo(
    () => buildWorkflowStarterTracks(starterTemplates),
    [starterTemplates]
  );
  const {
    activeTrack,
    activeTrackPresentation,
    applyStarterSelection,
    clearFeedback,
    createSignalItems,
    handleTrackSelect,
    isCreating,
    message,
    messageTone,
    runCreateTransition,
    selectedStarter,
    selectedStarterTrackPresentation,
    setFeedback,
    setWorkflowName,
    visibleStarters,
    workflowName,
    workspaceStarterGovernanceScope
  } = useWorkflowCreateShellState({
    governanceQueryScope,
    starterTemplates,
    workflowsCount: workflows.length
  });
  const selectedStarterSandboxBadges = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowDefinitionSandboxGovernanceBadges(selectedStarter.sandboxGovernance)
        : [],
    [selectedStarter]
  );
  const selectedStarterSourceGovernance = selectedStarter?.sourceGovernance ?? null;
  const selectedStarterSourceGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkspaceStarterSourceGovernanceSurface({
            template: toWorkspaceStarterGovernanceTemplate(selectedStarter)
          })
        : null,
    [selectedStarter]
  );
  const selectedStarterSourcePresenter =
    selectedStarterSourceGovernanceSurface?.presenter ?? null;
  const selectedStarterSourceChips = useMemo(
    () => selectedStarterSourcePresenter?.factChips ?? [],
    [selectedStarterSourcePresenter]
  );
  const selectedStarterSourcePrimarySignal =
    selectedStarter?.sourceGovernance?.outcomeExplanation?.primary_signal ??
    null;
  const shouldRenderSelectedStarterSourceGovernance = Boolean(
    selectedStarter &&
      (selectedStarter.origin === "workspace" ||
        selectedStarter.createdFromWorkflowId ||
        selectedStarterSourceGovernance)
  );
  const currentWorkflowCreateHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const starterGovernanceHref = buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const recentWorkflowLink = workflows[0]
    ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
        workflowId: workflows[0].id,
        viewState: workspaceStarterGovernanceScope,
        variant: "recent"
      })
    : null;
  const surfaceCopy = useMemo(
    () =>
      buildWorkflowCreateWizardSurfaceCopy({
        starterGovernanceHref
      }),
    [starterGovernanceHref]
  );
  const sourceWorkflowSummariesById = useMemo(
    () => Object.fromEntries(workflows.map((workflow) => [workflow.id, workflow] as const)),
    [workflows]
  );
  const selectedStarterMissingToolGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkspaceStarterMissingToolGovernanceSurface({
            template: toWorkspaceStarterGovernanceTemplate(selectedStarter),
            missingToolIds: selectedStarter.missingToolIds,
            sourceWorkflowSummariesById,
            workspaceStarterGovernanceQueryScope: workspaceStarterGovernanceScope
          })
        : null,
    [selectedStarter, sourceWorkflowSummariesById, workspaceStarterGovernanceScope]
  );
  const selectedStarterMissingToolBlockingSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterMissingToolBlockingSurface({
            starter: selectedStarter
          })
        : null,
    [selectedStarter]
  );
  const selectedStarterLegacyAuthWorkflowGovernanceHandoff = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterLegacyAuthWorkflowGovernanceHandoff({
            starter: selectedStarter,
            legacyAuthGovernanceSnapshot,
            workspaceStarterGovernanceScope
          })
        : null,
    [legacyAuthGovernanceSnapshot, selectedStarter, workspaceStarterGovernanceScope]
  );
  const selectedStarterNextStepSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterNextStepSurface({
            missingToolGovernanceSurface: selectedStarterMissingToolGovernanceSurface,
            legacyAuthWorkflowGovernanceHandoff:
              selectedStarterLegacyAuthWorkflowGovernanceHandoff,
            starter: selectedStarter,
            sourceGovernanceSurface: selectedStarterSourceGovernanceSurface,
            starterGovernanceHref,
            surfaceCopy
          })
        : null,
    [
      selectedStarter,
      selectedStarterLegacyAuthWorkflowGovernanceHandoff,
      selectedStarterMissingToolGovernanceSurface,
      selectedStarterSourceGovernanceSurface,
      starterGovernanceHref,
      surfaceCopy
    ]
  );
  const shouldRenderSelectedStarterNextStep = Boolean(
    selectedStarterNextStepSurface?.workflowGovernanceHandoff ||
      selectedStarterNextStepSurface?.primaryResourceSummary ||
      selectedStarterNextStepSurface?.href
  );
  const selectedStarterSandboxDependencySummary = useMemo(
    () =>
      selectedStarter
        ? describeWorkflowDefinitionSandboxDependency(selectedStarter.sandboxGovernance)
        : null,
    [selectedStarter]
  );
  const selectedStarterPreviewNodes = useMemo(
    () =>
      (selectedStarter?.definition.nodes ?? []).slice(0, 4).map((node) => {
        const catalogLabel = nodeCatalog.find((item) => item.type === node.type)?.label;
        return node.name?.trim() || catalogLabel || node.type;
      }),
    [nodeCatalog, selectedStarter?.definition.nodes]
  );
  const selectedStarterPreviewOverflow = Math.max(
    0,
    (selectedStarter?.definition.nodes?.length ?? 0) - selectedStarterPreviewNodes.length
  );
  const selectedStarterFactPills = useMemo(
    () =>
      selectedStarter
        ? [
            getWorkflowCreateSourceLabel(selectedStarter.origin),
            `${selectedStarter.nodeCount} 个节点`,
            selectedStarter.governedToolCount > 0
              ? `${selectedStarter.governedToolCount} 个工具`
              : "无工具依赖"
          ]
        : [],
    [selectedStarter]
  );
  const governanceDisclosureStatus =
    selectedStarterSourcePresenter?.actionStatusLabel ??
    selectedStarterSourcePresenter?.statusLabel ??
    (selectedStarterNextStepSurface ? "按需展开" : null);
  const handleCreateWorkflow = useCallback(() => {
    runCreateTransition(async () => {
      if (!selectedStarter) {
        return;
      }

      if (selectedStarterMissingToolBlockingSurface) {
        setFeedback(selectedStarterMissingToolBlockingSurface.blockedMessage, "error");
        return;
      }

      const normalizedName = workflowName.trim() || selectedStarter.defaultWorkflowName;
      setFeedback("正在创建应用草稿...", "idle");

      try {
        if (!selectedStarter.definition) {
          setFeedback("当前 starter definition 尚未加载完成，请刷新创建页后重试。", "error");
          return;
        }

        const body = await createWorkflow({
          name: normalizedName,
          definition: structuredClone(selectedStarter.definition)
        });

        setFeedback(`已创建 ${normalizedName}，正在进入 xyflow Studio...`, "success");
        router.push(
          buildWorkflowEditorHrefFromWorkspaceStarterViewState(
            body.id,
            workspaceStarterGovernanceScope
          )
        );
        router.refresh();
      } catch (error) {
        setFeedback(
          error instanceof WorkflowDefinitionValidationError
            ? error.message
            : "无法连接后端创建 workflow，请确认 API 已启动。",
          "error"
        );
      }
    });
  }, [
    router,
    runCreateTransition,
    selectedStarter,
    selectedStarterMissingToolBlockingSurface,
    setFeedback,
    workflowName,
    workspaceStarterGovernanceScope
  ]);

  const handleWorkflowNameChange = useCallback(
    (nextWorkflowName: string) => {
      clearFeedback();
      setWorkflowName(nextWorkflowName);
    },
    [clearFeedback, setWorkflowName]
  );

  const hasScopedWorkspaceStarterFilters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterGovernanceScope
  );
  const recentDrafts = useMemo(
    () =>
      workflows.slice(0, 2).map((workflow) => ({
        href: appendWorkflowLibraryViewState(
          buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
            workflowId: workflow.id,
            viewState: workspaceStarterGovernanceScope,
            variant: "recent"
          }).href,
          {
            definitionIssue: workflow.tool_governance?.missing_tool_ids?.length
              ? "missing_tool"
              : null
          }
        ),
        id: workflow.id,
        missingToolSummary: workflow.tool_governance?.missing_tool_ids?.length
          ? `${workflow.tool_governance.missing_tool_ids.length} 个工具缺口`
          : null,
        name: workflow.name,
        nodeCount: workflow.node_count,
        statusLabel: workflow.status === "published" ? "已发布" : "草稿",
        version: workflow.version
      })),
    [workflows, workspaceStarterGovernanceScope]
  );
  const selectedStarterSourceGovernancePresenter = useMemo(
    () =>
      selectedStarterSourcePresenter
        ? {
            chips: selectedStarterSourceChips,
            primarySignal: selectedStarterSourcePrimarySignal,
            summary:
              selectedStarterSourcePresenter.followUp ?? selectedStarterSourcePresenter.summary,
            tagLabel:
              selectedStarterSourcePresenter.actionStatusLabel ??
              selectedStarterSourcePresenter.statusLabel
          }
        : null,
    [
      selectedStarterSourceChips,
      selectedStarterSourcePresenter,
      selectedStarterSourcePrimarySignal
    ]
  );
  const featuredNodes = useMemo<WorkflowCreateFeaturedNode[]>(
    () =>
      WORKFLOW_CREATE_FEATURED_NODE_TYPES.map((type) => nodeCatalog.find((item) => item.type === type))
        .filter((item): item is WorkflowNodeCatalogItem => Boolean(item))
        .map((item) => ({
          type: item.type,
          label: item.label,
          supportStatus: item.supportStatus
        })),
    [nodeCatalog]
  );

  if (!selectedStarter) {
    return (
      <main className="editor-shell">
        <section className="hero creation-hero">
          <div className="hero-copy">
            <p className="eyebrow">Starter scope</p>
            <h1>当前筛选范围里没有可复用的 active workspace starter</h1>
            <p className="hero-text">
              {surfaceCopy.emptyStateDescription}
            </p>
            <div className="hero-actions">
              <WorkbenchEntryLinks
                {...surfaceCopy.emptyStateLinks}
                currentHref={currentWorkflowCreateHref}
              />
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-label">当前应用类型</div>
            <div className="panel-value">{activeTrackPresentation.label}</div>
            <p className="panel-text">
              {activeTrackPresentation.summary}
            </p>
            <p className="panel-text">
              搜索：<strong>{searchQuery.trim() || "未设置"}</strong>
            </p>
            <p className="panel-text">
              来源治理：<strong>{sourceGovernanceKind ?? "全部"}</strong>
            </p>
            <p className="panel-text">
              follow-up：<strong>{needsFollowUp ? "仅关注热点" : "未启用"}</strong>
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="workflow-create-shell">
      <section className="workflow-create-topbar">
        <div className="workflow-create-topbar-left">
          <Link href={buildWorkspaceHrefFromWorkspaceStarterViewState(workspaceStarterGovernanceScope)}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              className="workflow-create-back-button"
            >
              返回工作台
            </Button>
          </Link>
          <div className="workflow-create-topbar-copy">
            <span>New app</span>
            <strong>选起点后直接进入 Studio</strong>
          </div>
        </div>
        <div className="workflow-create-topbar-summary" aria-label="创建页摘要">
          <span className="workflow-create-inline-chip">{activeTrackPresentation.label}</span>
          <span className="workflow-create-inline-chip muted">{visibleStarters.length} 个 starter</span>
          {workflows.length > 0 ? (
            <span className="workflow-create-inline-chip muted">{workflows.length} 个草稿</span>
          ) : null}
        </div>
      </section>

      <section className="workflow-create-page">
        <WorkflowCreateLauncherPanel
          activeTrack={activeTrack}
          createSignalItems={createSignalItems}
          featuredNodes={featuredNodes}
          hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
          scopedGovernanceBackLinkLabel={surfaceCopy.scopedGovernanceBackLinkLabel}
          scopedGovernanceDescription={surfaceCopy.scopedGovernanceDescription}
          selectedStarterId={selectedStarter.id}
          starterGovernanceHref={starterGovernanceHref}
          starterTracks={starterTracks}
          visibleStarters={visibleStarters}
          onSelectStarter={applyStarterSelection}
          onSelectTrack={handleTrackSelect}
        />

        <WorkflowCreatePreviewPanel
          governanceDisclosureStatus={governanceDisclosureStatus}
          isCreating={isCreating}
          message={message}
          messageTone={messageTone}
          recentDrafts={recentDrafts}
          recentWorkflowHref={recentWorkflowLink?.href ?? null}
          selectedStarter={selectedStarter}
          selectedStarterFactPills={selectedStarterFactPills}
          selectedStarterMissingToolBlockingSurface={selectedStarterMissingToolBlockingSurface}
          selectedStarterNextStepSurface={selectedStarterNextStepSurface}
          selectedStarterPreviewNodes={selectedStarterPreviewNodes}
          selectedStarterPreviewOverflow={selectedStarterPreviewOverflow}
          selectedStarterSandboxBadges={selectedStarterSandboxBadges}
          selectedStarterSandboxDependencySummary={selectedStarterSandboxDependencySummary}
          selectedStarterSourceGovernancePresenter={selectedStarterSourceGovernancePresenter}
          selectedStarterTrackLabel={selectedStarterTrackPresentation.label}
          shouldDisableCreate={Boolean(selectedStarterMissingToolBlockingSurface)}
          shouldRenderSelectedStarterNextStep={shouldRenderSelectedStarterNextStep}
          shouldRenderSelectedStarterSourceGovernance={shouldRenderSelectedStarterSourceGovernance}
          starterGovernanceHref={starterGovernanceHref}
          surfaceCopy={surfaceCopy}
          totalWorkflows={workflows.length}
          workflowName={workflowName}
          onCreateWorkflow={handleCreateWorkflow}
          onWorkflowNameChange={handleWorkflowNameChange}
        />
      </section>
    </main>
  );
}

type WorkspaceStarterSourceGovernanceSurfaceTemplate = Parameters<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>[0]["template"];

type WorkspaceStarterSourceGovernanceSurface = ReturnType<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>;

type WorkflowCreateStarterNextStepSurface = {
  label: string;
  detail: string;
  primaryResourceSummary?: string | null;
  workflowGovernanceHandoff?: WorkflowGovernanceHandoff | null;
  href: string | null;
  hrefLabel: string | null;
};

type WorkflowCreateStarterMissingToolBlockingSurface = {
  blockedMessage: string;
};

function toWorkspaceStarterGovernanceTemplate(
  starter: WorkflowStarterTemplate
): WorkspaceStarterSourceGovernanceSurfaceTemplate {
  const governance = starter.sourceGovernance;

  return {
    id: starter.id,
    name: starter.name,
    archived: starter.archived,
    created_from_workflow_id: starter.createdFromWorkflowId ?? governance?.sourceWorkflowId ?? null,
    source_governance: governance
      ? {
          kind: governance.kind,
          status_label: governance.statusLabel,
          summary: governance.summary,
          source_workflow_id: governance.sourceWorkflowId ?? null,
          source_workflow_name: governance.sourceWorkflowName ?? null,
          template_version: governance.templateVersion ?? null,
          source_version: governance.sourceVersion ?? null,
          action_decision: governance.actionDecision ?? null,
          outcome_explanation: governance.outcomeExplanation ?? null
        }
      : null
  };
}

function buildWorkflowCreateStarterNextStepSurface({
  missingToolGovernanceSurface,
  legacyAuthWorkflowGovernanceHandoff,
  starter,
  sourceGovernanceSurface,
  starterGovernanceHref,
  surfaceCopy
}: {
  missingToolGovernanceSurface: WorkspaceStarterFollowUpSurface | null;
  legacyAuthWorkflowGovernanceHandoff: WorkflowGovernanceHandoff | null;
  starter: WorkflowStarterTemplate;
  sourceGovernanceSurface: WorkspaceStarterSourceGovernanceSurface | null;
  starterGovernanceHref: string;
  surfaceCopy: WorkflowCreateWizardSurfaceCopy;
}): WorkflowCreateStarterNextStepSurface {
  if (missingToolGovernanceSurface) {
    return {
      label: missingToolGovernanceSurface.label,
      detail: missingToolGovernanceSurface.detail,
      primaryResourceSummary: missingToolGovernanceSurface.primaryResourceSummary,
      workflowGovernanceHandoff: missingToolGovernanceSurface.workflowGovernanceHandoff,
      href: missingToolGovernanceSurface.entryOverride?.href ?? null,
      hrefLabel: missingToolGovernanceSurface.entryOverride?.label ?? null
    };
  }

  const presenter = sourceGovernanceSurface?.presenter ?? null;
  const recommendedNextStep = sourceGovernanceSurface?.recommendedNextStep ?? null;
  const shouldLinkToStarterGovernance =
    starter.origin === "workspace" ||
    Boolean(starter.createdFromWorkflowId) ||
    Boolean(starter.sourceGovernance);

  if (
    recommendedNextStep &&
    (recommendedNextStep.action === "refresh" || recommendedNextStep.action === "rebase")
  ) {
    return {
      label: recommendedNextStep.label,
      detail: recommendedNextStep.detail,
      primaryResourceSummary: recommendedNextStep.primaryResourceSummary,
      workflowGovernanceHandoff:
        recommendedNextStep.workflowGovernanceHandoff ?? legacyAuthWorkflowGovernanceHandoff,
      href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
      hrefLabel: shouldLinkToStarterGovernance
        ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
        : null
    };
  }

  if (presenter?.needsAttention) {
    return {
      label: presenter.actionStatusLabel ?? presenter.statusLabel,
      detail: presenter.followUp ?? presenter.summary,
      primaryResourceSummary: sourceGovernanceSurface?.recommendedNextStep?.primaryResourceSummary,
      workflowGovernanceHandoff:
        sourceGovernanceSurface?.recommendedNextStep?.workflowGovernanceHandoff ??
        legacyAuthWorkflowGovernanceHandoff,
      href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
      hrefLabel: shouldLinkToStarterGovernance
        ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
        : null
    };
  }

  return {
    label: surfaceCopy.createWorkflowRecommendedNextStepLabel,
    detail: starter.recommendedNextStep,
    primaryResourceSummary: null,
    workflowGovernanceHandoff: legacyAuthWorkflowGovernanceHandoff,
    href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
    hrefLabel: shouldLinkToStarterGovernance
      ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
      : null
  };
}

function buildWorkflowCreateStarterMissingToolBlockingSurface({
  starter
}: {
  starter: WorkflowStarterTemplate;
}): WorkflowCreateStarterMissingToolBlockingSurface | null {
  const missingToolIds = Array.from(
    new Set(starter.missingToolIds.map((toolId) => toolId.trim()).filter(Boolean))
  );

  if (missingToolIds.length === 0) {
    return null;
  }

  const sourceWorkflowId =
    starter.sourceGovernance?.sourceWorkflowId?.trim() || starter.createdFromWorkflowId?.trim();
  const renderedToolSummary = formatCatalogGapToolSummary(missingToolIds) ?? "unknown tool";
  const blockedMessage =
    `当前 starter 仍有 catalog gap（${renderedToolSummary}）；` +
    "如果现在创建，API 会直接拒绝该草稿。先补 tool binding，再沿上面的治理入口完成治理，最后回来创建草稿。";

  return {
    blockedMessage
  };
}

function buildWorkflowCreateStarterLegacyAuthWorkflowGovernanceHandoff({
  starter,
  legacyAuthGovernanceSnapshot,
  workspaceStarterGovernanceScope
}: {
  starter: WorkflowStarterTemplate;
  legacyAuthGovernanceSnapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workspaceStarterGovernanceScope: WorkspaceStarterGovernanceQueryScope;
}): WorkflowGovernanceHandoff | null {
  const sourceWorkflowId =
    starter.sourceGovernance?.sourceWorkflowId?.trim() || starter.createdFromWorkflowId?.trim();

  if (!sourceWorkflowId || legacyAuthGovernanceSnapshot === null) {
    return null;
  }

  const workflow = legacyAuthGovernanceSnapshot.workflows.find(
    (item) => item.workflow_id === sourceWorkflowId
  );

  if (workflow === undefined || getWorkflowLegacyPublishAuthBacklogCount(workflow) <= 0) {
    return null;
  }

  const workflowDetailLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
    workflowId: workflow.workflow_id,
    viewState: workspaceStarterGovernanceScope,
    variant: "source"
  });

  return buildWorkflowGovernanceHandoff({
    workflowId: workflow.workflow_id,
    workflowDetailHref: workflowDetailLink.href,
    toolGovernance: workflow.tool_governance,
    legacyAuthGovernance: legacyAuthGovernanceSnapshot
  });
}

function getWorkflowCreateSourceLabel(origin: WorkflowStarterTemplate["origin"]) {
  if (origin === "workspace") {
    return "团队模板";
  }

  return "官方模板";
}
