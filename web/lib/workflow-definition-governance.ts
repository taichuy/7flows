import type {
  WorkflowDefinitionPreflightIssue,
  WorkflowListItem
} from "@/lib/get-workflows";
import type {
  WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem
} from "@/lib/workflow-publish-types";

type WorkflowLegacyAuthGovernanceSummaryLike = NonNullable<
  WorkflowListItem["legacy_auth_governance"]
>;
type WorkflowLegacyAuthGovernanceSnapshotLike = WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot;
type WorkflowLegacyAuthGovernanceWorkflowItemLike =
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem;
type WorkflowLegacyAuthGovernanceValueLike =
  | WorkflowLegacyAuthGovernanceSummaryLike
  | WorkflowLegacyAuthGovernanceSnapshotLike
  | WorkflowLegacyAuthGovernanceWorkflowItemLike;
type WorkflowLegacyAuthGovernanceLike = {
  id?: string | null;
  workflow_id?: string | null;
  binding_count?: number;
  draft_candidate_count?: number;
  published_blocker_count?: number;
  offline_inventory_count?: number;
  definition_issues?: WorkflowDefinitionPreflightIssue[];
  legacy_auth_governance?: WorkflowLegacyAuthGovernanceValueLike | null;
};
type WorkflowMissingToolGovernanceLike = {
  tool_governance?: WorkflowListItem["tool_governance"] | null;
};
export type WorkflowLibraryGovernanceLike = WorkflowLegacyAuthGovernanceLike &
  WorkflowMissingToolGovernanceLike;
type WorkflowToolReferenceIssueLike = Pick<WorkflowDefinitionPreflightIssue, "message">;

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readLegacyAuthGovernanceCounts(
  legacyAuthGovernance: WorkflowLegacyAuthGovernanceValueLike | null | undefined
) {
  if (!legacyAuthGovernance) {
    return null;
  }

  if ("summary" in legacyAuthGovernance) {
    return {
      bindingCount: legacyAuthGovernance.binding_count,
      draftCandidateCount: legacyAuthGovernance.summary.draft_candidate_count,
      publishedBlockerCount: legacyAuthGovernance.summary.published_blocker_count,
      offlineInventoryCount: legacyAuthGovernance.summary.offline_inventory_count
    };
  }

  return {
    bindingCount: legacyAuthGovernance.binding_count,
    draftCandidateCount: legacyAuthGovernance.draft_candidate_count,
    publishedBlockerCount: legacyAuthGovernance.published_blocker_count,
    offlineInventoryCount: legacyAuthGovernance.offline_inventory_count
  };
}

function readWorkflowItemLegacyAuthGovernanceCounts(
  workflow: WorkflowLegacyAuthGovernanceLike
) {
  if ((workflow.binding_count ?? 0) <= 0) {
    return null;
  }

  return {
    bindingCount: workflow.binding_count ?? 0,
    draftCandidateCount: workflow.draft_candidate_count ?? 0,
    publishedBlockerCount: workflow.published_blocker_count ?? 0,
    offlineInventoryCount: workflow.offline_inventory_count ?? 0
  };
}

type ResolvedLegacyAuthGovernanceCounts = NonNullable<
  ReturnType<typeof readLegacyAuthGovernanceCounts>
> & {
  sourceKind:
    | "workflow_item"
    | "legacy_auth_summary"
    | "snapshot_workflow"
    | "snapshot_summary";
};

function resolveWorkflowLegacyAuthGovernanceCounts(
  workflow: WorkflowLegacyAuthGovernanceLike
): ResolvedLegacyAuthGovernanceCounts | null {
  const legacyAuthGovernance = workflow.legacy_auth_governance;
  if (!legacyAuthGovernance) {
    const workflowItemCounts = readWorkflowItemLegacyAuthGovernanceCounts(workflow);
    return workflowItemCounts
      ? {
          ...workflowItemCounts,
          sourceKind: "workflow_item"
        }
      : null;
  }

  if ("summary" in legacyAuthGovernance) {
    const workflowId = normalizeText(workflow.workflow_id) ?? normalizeText(workflow.id);
    const workflowSummary = workflowId
      ? (legacyAuthGovernance.workflows.find((item) => item.workflow_id === workflowId) ?? null)
      : legacyAuthGovernance.workflows.length === 1
        ? legacyAuthGovernance.workflows[0] ?? null
        : null;
    const resolvedCounts = readLegacyAuthGovernanceCounts(workflowSummary ?? legacyAuthGovernance);

    return resolvedCounts
      ? {
          ...resolvedCounts,
          sourceKind: workflowSummary ? "snapshot_workflow" : "snapshot_summary"
        }
      : null;
  }

  const resolvedCounts = readLegacyAuthGovernanceCounts(legacyAuthGovernance);
  return resolvedCounts
    ? {
        ...resolvedCounts,
        sourceKind: "legacy_auth_summary"
      }
    : null;
}

function getLegacyAuthGovernanceBacklogCount(
  legacyAuthGovernance: ResolvedLegacyAuthGovernanceCounts,
  draftCleanupCount: number
): number {
  const nonPublishedBacklogCount =
    draftCleanupCount > 0 ? draftCleanupCount : legacyAuthGovernance.offlineInventoryCount;

  return nonPublishedBacklogCount + legacyAuthGovernance.publishedBlockerCount;
}

function resolveWorkflowLegacyPublishAuthBacklogCounts(
  workflow: WorkflowLegacyAuthGovernanceLike
) {
  const currentPublishDraftIssueCount = getWorkflowLegacyPublishAuthIssues(workflow).length;
  const legacyAuthGovernance = resolveWorkflowLegacyAuthGovernanceCounts(workflow);

  if (!legacyAuthGovernance || legacyAuthGovernance.bindingCount <= 0) {
    return {
      backlogCount: currentPublishDraftIssueCount,
      followUpCount: currentPublishDraftIssueCount,
      draftCleanupCount: currentPublishDraftIssueCount,
      publishedBlockerCount: 0,
      offlineInventoryCount: 0,
      hasPersistedLegacyBindings: false
    };
  }

  const draftCleanupCount = Math.max(
    currentPublishDraftIssueCount,
    legacyAuthGovernance.draftCandidateCount
  );
  const publishedBlockerCount = legacyAuthGovernance.publishedBlockerCount;
  const offlineInventoryCount = legacyAuthGovernance.offlineInventoryCount;
  const backlogCount = getLegacyAuthGovernanceBacklogCount(
    legacyAuthGovernance,
    draftCleanupCount
  );

  return {
    backlogCount,
    followUpCount: backlogCount,
    draftCleanupCount,
    publishedBlockerCount,
    offlineInventoryCount,
    hasPersistedLegacyBindings: true
  };
}

export function isLegacyPublishAuthModeIssue(
  issue: WorkflowDefinitionPreflightIssue
): boolean {
  return issue.category === "publish_draft" && issue.field === "authMode";
}

export function getWorkflowLegacyPublishAuthIssues(
  workflow: { definition_issues?: WorkflowDefinitionPreflightIssue[] | null }
): WorkflowDefinitionPreflightIssue[] {
  return (workflow.definition_issues ?? []).filter(isLegacyPublishAuthModeIssue);
}

export function getWorkflowLegacyPublishAuthBacklogCount(
  workflow: WorkflowLegacyAuthGovernanceLike
): number {
  return resolveWorkflowLegacyPublishAuthBacklogCounts(workflow).backlogCount;
}

export function getWorkflowLegacyPublishAuthFollowUpCount(
  workflow: WorkflowLegacyAuthGovernanceLike
): number {
  return resolveWorkflowLegacyPublishAuthBacklogCounts(workflow).followUpCount;
}

export const getWorkflowLegacyPublishAuthBlockerCount =
  getWorkflowLegacyPublishAuthBacklogCount;

export function getWorkflowLegacyPublishAuthStatusLabel(
  workflow: WorkflowLegacyAuthGovernanceLike
): "publish auth blocker" | "legacy auth cleanup" | null {
  const backlogCounts = resolveWorkflowLegacyPublishAuthBacklogCounts(workflow);

  if (backlogCounts.followUpCount <= 0) {
    return null;
  }

  return backlogCounts.draftCleanupCount > 0 || backlogCounts.publishedBlockerCount > 0
    ? "publish auth blocker"
    : "legacy auth cleanup";
}

export function formatWorkflowLegacyPublishAuthBacklogSummary(
  workflow: WorkflowLegacyAuthGovernanceLike
): string | null {
  const backlogCounts = resolveWorkflowLegacyPublishAuthBacklogCounts(workflow);

  if (backlogCounts.followUpCount <= 0) {
    return null;
  }

  if (backlogCounts.hasPersistedLegacyBindings) {
    return [
      `${backlogCounts.draftCleanupCount} 条 draft cleanup`,
      `${backlogCounts.publishedBlockerCount} 条 published blocker`,
      `${backlogCounts.offlineInventoryCount} 条 offline inventory`
    ]
      .filter((value): value is string => Boolean(value))
      .join("、");
  }

  return `${backlogCounts.followUpCount} 个 publish draft`;
}

export function hasWorkflowLegacyPublishAuthIssues(
  workflow: WorkflowLegacyAuthGovernanceLike
): boolean {
  return getWorkflowLegacyPublishAuthBacklogCount(workflow) > 0;
}

export function hasOnlyLegacyPublishAuthModeIssues(
  issues: WorkflowDefinitionPreflightIssue[]
): boolean {
  return issues.length > 0 && issues.every(isLegacyPublishAuthModeIssue);
}

export function getWorkflowMissingToolIds(
  workflow: WorkflowMissingToolGovernanceLike
): string[] {
  return normalizeCatalogGapToolIds(workflow.tool_governance?.missing_tool_ids ?? []);
}

export function hasWorkflowMissingToolIssues(
  workflow: WorkflowMissingToolGovernanceLike
): boolean {
  return getWorkflowMissingToolIds(workflow).length > 0;
}

export function formatWorkflowMissingToolSummary(
  workflow: WorkflowMissingToolGovernanceLike,
  maxVisibleToolIds = 2
): string | null {
  return formatCatalogGapSummary(getWorkflowMissingToolIds(workflow), maxVisibleToolIds);
}

export function formatCatalogGapToolSummary(
  toolIds: readonly unknown[],
  maxVisibleToolIds = 2
): string | null {
  const normalizedToolIds = normalizeCatalogGapToolIds(toolIds);
  if (normalizedToolIds.length === 0) {
    return null;
  }

  if (normalizedToolIds.length <= maxVisibleToolIds) {
    return normalizedToolIds.join("、");
  }

  return `${normalizedToolIds.slice(0, maxVisibleToolIds).join("、")} 等 ${normalizedToolIds.length} 个 tool`;
}

export function formatCatalogGapSummary(
  toolIds: readonly unknown[],
  maxVisibleToolIds = 2
): string | null {
  const toolSummary = formatCatalogGapToolSummary(toolIds, maxVisibleToolIds);
  return toolSummary ? `catalog gap · ${toolSummary}` : null;
}

export function formatCatalogGapResourceSummary(
  resourceLabel: string | null | undefined,
  toolIds: readonly unknown[],
  maxVisibleToolIds = 2
): string | null {
  const normalizedResourceLabel = normalizeString(resourceLabel);
  const catalogGapSummary = formatCatalogGapSummary(toolIds, maxVisibleToolIds);
  const summaryParts = [normalizedResourceLabel, catalogGapSummary].filter(
    (value): value is string => Boolean(value)
  );

  return summaryParts.length > 0 ? summaryParts.join(" · ") : null;
}

export function getToolReferenceMissingToolIds(
  issues: readonly WorkflowToolReferenceIssueLike[]
): string[] {
  return normalizeCatalogGapToolIds(
    issues.flatMap((issue) => extractToolReferenceMissingToolIds(issue.message))
  );
}

export function formatToolReferenceIssueSummary(
  issues: readonly WorkflowToolReferenceIssueLike[],
  {
    fallbackLabel = "tool catalog reference",
    maxVisibleToolIds = 2
  }: {
    fallbackLabel?: string;
    maxVisibleToolIds?: number;
  } = {}
): string | null {
  if (issues.length === 0) {
    return null;
  }

  const catalogGapSummary = formatCatalogGapSummary(
    getToolReferenceMissingToolIds(issues),
    maxVisibleToolIds
  );
  if (catalogGapSummary) {
    return catalogGapSummary;
  }

  const descriptions = Array.from(
    new Set(
      issues
        .map((issue) => normalizeString(issue.message))
        .filter((message): message is string => message !== null)
    )
  );

  if (descriptions.length === 0) {
    return fallbackLabel;
  }

  const visibleDescriptions = descriptions.slice(0, 2);
  const suffix =
    descriptions.length > visibleDescriptions.length
      ? `；另有 ${descriptions.length - visibleDescriptions.length} 项同类问题`
      : "";
  return `${fallbackLabel}：${visibleDescriptions.join("；")}${suffix}`;
}

function normalizeCatalogGapToolIds(toolIds: readonly unknown[]): string[] {
  return Array.from(
    new Set(
      toolIds
        .map((toolId) => normalizeString(toolId))
        .filter((toolId): toolId is string => toolId !== null)
    )
  );
}

function extractToolReferenceMissingToolIds(message: string): string[] {
  const normalizedMessage = normalizeString(message);
  if (!normalizedMessage) {
    return [];
  }

  const singularMissingCatalogMatch = normalizedMessage.match(
    /(?:catalog tool|catalog tools) '?([a-z0-9_.:-]+)'?/i
  );
  if (singularMissingCatalogMatch) {
    const toolId = normalizeString(singularMissingCatalogMatch[1]);
    return toolId ? [toolId] : [];
  }

  const missingCatalogMatch = normalizedMessage.match(/\bmissing catalog tools?:\s*(.+)$/i);
  if (missingCatalogMatch) {
    return missingCatalogMatch[1]
      .split(/[，,、]/)
      .map((toolId) => normalizeString(toolId.replace(/[.。]$/, "")))
      .filter((toolId): toolId is string => toolId !== null);
  }

  const localizedMissingCatalogMatch = normalizedMessage.match(/不存在的工具[:：]?\s*(.+)$/);
  if (localizedMissingCatalogMatch) {
    return localizedMissingCatalogMatch[1]
      .split(/[，,、]/)
      .map((toolId) => normalizeString(toolId.replace(/\.$/, "")))
      .filter((toolId): toolId is string => toolId !== null);
  }

  return [];
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}
