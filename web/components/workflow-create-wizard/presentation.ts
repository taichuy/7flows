import {
  buildWorkspaceStarterMissingToolGovernanceSurface,
  buildWorkspaceStarterSourceGovernanceSurface
} from "@/components/workspace-starter-library/shared";
import { appendWorkflowLibraryViewState } from "@/lib/workflow-library-query";
import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  describeWorkflowDefinitionSandboxDependency
} from "@/lib/workflow-definition-sandbox-governance";
import {
  formatCatalogGapToolSummary,
  getWorkflowLegacyPublishAuthBacklogCount
} from "@/lib/workflow-definition-governance";
import type { WorkflowNodeCatalogItem } from "@/lib/get-workflow-library";
import type { WorkflowListItem } from "@/lib/get-workflows";
import {
  buildWorkflowGovernanceHandoff,
  type WorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-types";
import {
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkspaceHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import {
  buildWorkflowCreateWizardSurfaceCopy,
  type WorkflowCreateWizardSurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import type { WorkflowStarterTemplate } from "@/lib/workflow-starters";

export type WorkflowCreateFeaturedNode = {
  type: WorkflowNodeCatalogItem["type"];
  label: string;
  supportStatus: WorkflowNodeCatalogItem["supportStatus"];
};

export type WorkflowCreateStarterNextStepSurface = {
  label: string;
  detail: string;
  primaryResourceSummary?: string | null;
  workflowGovernanceHandoff?: WorkflowGovernanceHandoff | null;
  href: string | null;
  hrefLabel: string | null;
};

export type WorkflowCreateStarterMissingToolBlockingSurface = {
  blockedMessage: string;
};

export type WorkflowCreateRecentDraftItem = {
  href: string;
  id: string;
  missingToolSummary: string | null;
  name: string;
  nodeCount: number;
  statusLabel: string;
  version: string;
};

export type WorkflowCreateSourceGovernancePresenter = {
  chips: string[];
  primarySignal: string | null;
  summary: string;
  tagLabel: string;
};

export type WorkflowCreateWizardPresentation = {
  currentWorkflowCreateHref: string;
  featuredNodes: WorkflowCreateFeaturedNode[];
  governanceDisclosureStatus: string | null;
  hasScopedWorkspaceStarterFilters: boolean;
  recentDrafts: WorkflowCreateRecentDraftItem[];
  recentWorkflowHref: string | null;
  selectedStarterFactPills: string[];
  selectedStarterMissingToolBlockingSurface: WorkflowCreateStarterMissingToolBlockingSurface | null;
  selectedStarterNextStepSurface: WorkflowCreateStarterNextStepSurface | null;
  selectedStarterPreviewNodes: string[];
  selectedStarterPreviewOverflow: number;
  selectedStarterSandboxBadges: string[];
  selectedStarterSandboxDependencySummary: string | null;
  selectedStarterSourceGovernancePresenter: WorkflowCreateSourceGovernancePresenter | null;
  shouldRenderSelectedStarterNextStep: boolean;
  shouldRenderSelectedStarterSourceGovernance: boolean;
  starterGovernanceHref: string;
  surfaceCopy: WorkflowCreateWizardSurfaceCopy;
  workspaceHref: string;
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

type WorkspaceStarterSourceGovernanceSurfaceTemplate = Parameters<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>[0]["template"];

type WorkspaceStarterSourceGovernanceSurface = ReturnType<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>;

export function buildWorkflowCreateWizardPresentation({
  legacyAuthGovernanceSnapshot,
  nodeCatalog,
  selectedStarter,
  workflows,
  workspaceStarterGovernanceScope
}: {
  legacyAuthGovernanceSnapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  nodeCatalog: WorkflowNodeCatalogItem[];
  selectedStarter: WorkflowStarterTemplate | null;
  workflows: WorkflowListItem[];
  workspaceStarterGovernanceScope: WorkspaceStarterGovernanceQueryScope;
}): WorkflowCreateWizardPresentation {
  const currentWorkflowCreateHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const workspaceHref = buildWorkspaceHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const starterGovernanceHref = buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const surfaceCopy = buildWorkflowCreateWizardSurfaceCopy({
    starterGovernanceHref
  });
  const sourceWorkflowSummariesById = Object.fromEntries(
    workflows.map((workflow) => [workflow.id, workflow] as const)
  );
  const selectedStarterSourceGovernance = selectedStarter?.sourceGovernance ?? null;
  const selectedStarterSourceGovernanceSurface = selectedStarter
    ? buildWorkspaceStarterSourceGovernanceSurface({
        template: toWorkspaceStarterGovernanceTemplate(selectedStarter)
      })
    : null;
  const selectedStarterSourcePresenter = selectedStarterSourceGovernanceSurface?.presenter ?? null;
  const selectedStarterSourceChips = selectedStarterSourcePresenter?.factChips ?? [];
  const selectedStarterSourcePrimarySignal =
    selectedStarter?.sourceGovernance?.outcomeExplanation?.primary_signal ?? null;
  const shouldRenderSelectedStarterSourceGovernance = Boolean(
    selectedStarter &&
      (selectedStarter.origin === "workspace" ||
        selectedStarter.createdFromWorkflowId ||
        selectedStarterSourceGovernance)
  );
  const selectedStarterMissingToolGovernanceSurface = selectedStarter
    ? buildWorkspaceStarterMissingToolGovernanceSurface({
        template: toWorkspaceStarterGovernanceTemplate(selectedStarter),
        missingToolIds: selectedStarter.missingToolIds,
        sourceWorkflowSummariesById,
        workspaceStarterGovernanceQueryScope: workspaceStarterGovernanceScope
      })
    : null;
  const selectedStarterMissingToolBlockingSurface = selectedStarter
    ? buildWorkflowCreateStarterMissingToolBlockingSurface({
        starter: selectedStarter
      })
    : null;
  const selectedStarterLegacyAuthWorkflowGovernanceHandoff = selectedStarter
    ? buildWorkflowCreateStarterLegacyAuthWorkflowGovernanceHandoff({
        starter: selectedStarter,
        legacyAuthGovernanceSnapshot,
        workspaceStarterGovernanceScope
      })
    : null;
  const selectedStarterNextStepSurface = selectedStarter
    ? buildWorkflowCreateStarterNextStepSurface({
        missingToolGovernanceSurface: selectedStarterMissingToolGovernanceSurface,
        legacyAuthWorkflowGovernanceHandoff: selectedStarterLegacyAuthWorkflowGovernanceHandoff,
        starter: selectedStarter,
        sourceGovernanceSurface: selectedStarterSourceGovernanceSurface,
        starterGovernanceHref,
        surfaceCopy
      })
    : null;
  const shouldRenderSelectedStarterNextStep = Boolean(
    selectedStarterNextStepSurface?.workflowGovernanceHandoff ||
      selectedStarterNextStepSurface?.primaryResourceSummary ||
      selectedStarterNextStepSurface?.href
  );
  const selectedStarterSandboxBadges = selectedStarter
    ? buildWorkflowDefinitionSandboxGovernanceBadges(selectedStarter.sandboxGovernance)
    : [];
  const selectedStarterSandboxDependencySummary = selectedStarter
    ? describeWorkflowDefinitionSandboxDependency(selectedStarter.sandboxGovernance)
    : null;
  const selectedStarterPreviewNodes = (selectedStarter?.definition.nodes ?? [])
    .slice(0, 4)
    .map((node) => {
      const catalogLabel = nodeCatalog.find((item) => item.type === node.type)?.label;
      return node.name?.trim() || catalogLabel || node.type;
    });
  const selectedStarterPreviewOverflow = Math.max(
    0,
    (selectedStarter?.definition.nodes?.length ?? 0) - selectedStarterPreviewNodes.length
  );
  const selectedStarterFactPills = selectedStarter
    ? [
        getWorkflowCreateSourceLabel(selectedStarter.origin),
        `${selectedStarter.nodeCount} 个节点`,
        selectedStarter.governedToolCount > 0
          ? `${selectedStarter.governedToolCount} 个工具`
          : "无工具依赖"
      ]
    : [];
  const governanceDisclosureStatus =
    selectedStarterSourcePresenter?.actionStatusLabel ??
    selectedStarterSourcePresenter?.statusLabel ??
    (selectedStarterNextStepSurface ? "按需展开" : null);
  const recentDrafts = workflows.slice(0, 2).map((workflow) => ({
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
  }));
  const recentWorkflowHref = workflows[0]
    ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
        workflowId: workflows[0].id,
        viewState: workspaceStarterGovernanceScope,
        variant: "recent"
      }).href
    : null;
  const selectedStarterSourceGovernancePresenter = selectedStarterSourcePresenter
    ? {
        chips: selectedStarterSourceChips,
        primarySignal: selectedStarterSourcePrimarySignal,
        summary: selectedStarterSourcePresenter.followUp ?? selectedStarterSourcePresenter.summary,
        tagLabel:
          selectedStarterSourcePresenter.actionStatusLabel ??
          selectedStarterSourcePresenter.statusLabel
      }
    : null;
  const featuredNodes = WORKFLOW_CREATE_FEATURED_NODE_TYPES.map((type) =>
    nodeCatalog.find((item) => item.type === type)
  )
    .filter((item): item is WorkflowNodeCatalogItem => Boolean(item))
    .map((item) => ({
      type: item.type,
      label: item.label,
      supportStatus: item.supportStatus
    }));

  return {
    currentWorkflowCreateHref,
    featuredNodes,
    governanceDisclosureStatus,
    hasScopedWorkspaceStarterFilters: hasScopedWorkspaceStarterGovernanceFilters(
      workspaceStarterGovernanceScope
    ),
    recentDrafts,
    recentWorkflowHref,
    selectedStarterFactPills,
    selectedStarterMissingToolBlockingSurface,
    selectedStarterNextStepSurface,
    selectedStarterPreviewNodes,
    selectedStarterPreviewOverflow,
    selectedStarterSandboxBadges,
    selectedStarterSandboxDependencySummary,
    selectedStarterSourceGovernancePresenter,
    shouldRenderSelectedStarterNextStep,
    shouldRenderSelectedStarterSourceGovernance,
    starterGovernanceHref,
    surfaceCopy,
    workspaceHref
  };
}

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
  missingToolGovernanceSurface: ReturnType<typeof buildWorkspaceStarterMissingToolGovernanceSurface>;
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
