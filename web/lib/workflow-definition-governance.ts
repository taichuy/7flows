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
type WorkflowLegacyAuthGovernanceWorkflowItemLike = WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem;
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

function resolveWorkflowLegacyAuthGovernanceCounts(
  workflow: WorkflowLegacyAuthGovernanceLike
) {
  const legacyAuthGovernance = workflow.legacy_auth_governance;
  if (!legacyAuthGovernance) {
    return readWorkflowItemLegacyAuthGovernanceCounts(workflow);
  }

  if ("summary" in legacyAuthGovernance) {
    const workflowId = normalizeText(workflow.workflow_id) ?? normalizeText(workflow.id);
    const workflowSummary =
      (workflowId
        ? legacyAuthGovernance.workflows.find((item) => item.workflow_id === workflowId)
        : null) ?? legacyAuthGovernance.workflows[0] ?? null;

    return readLegacyAuthGovernanceCounts(workflowSummary ?? legacyAuthGovernance);
  }

  return readLegacyAuthGovernanceCounts(legacyAuthGovernance);
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
  const currentPublishDraftIssueCount = getWorkflowLegacyPublishAuthIssues(workflow).length;
  const legacyAuthGovernance = resolveWorkflowLegacyAuthGovernanceCounts(workflow);

  return legacyAuthGovernance && legacyAuthGovernance.bindingCount > 0
    ? legacyAuthGovernance.bindingCount
    : currentPublishDraftIssueCount;
}

export const getWorkflowLegacyPublishAuthBlockerCount =
  getWorkflowLegacyPublishAuthBacklogCount;

export function getWorkflowLegacyPublishAuthStatusLabel(
  workflow: WorkflowLegacyAuthGovernanceLike
): "publish auth blocker" | "legacy auth cleanup" | null {
  if (getWorkflowLegacyPublishAuthBacklogCount(workflow) <= 0) {
    return null;
  }

  return (resolveWorkflowLegacyAuthGovernanceCounts(workflow)?.publishedBlockerCount ?? 0) > 0
    ? "publish auth blocker"
    : "legacy auth cleanup";
}

export function formatWorkflowLegacyPublishAuthBacklogSummary(
  workflow: WorkflowLegacyAuthGovernanceLike
): string | null {
  const currentPublishDraftIssueCount = getWorkflowLegacyPublishAuthIssues(workflow).length;
  const legacyAuthGovernance = resolveWorkflowLegacyAuthGovernanceCounts(workflow);
  if (legacyAuthGovernance && legacyAuthGovernance.bindingCount > 0) {
    return [
      `${legacyAuthGovernance.draftCandidateCount} 条 draft cleanup`,
      `${legacyAuthGovernance.publishedBlockerCount} 条 published blocker`,
      `${legacyAuthGovernance.offlineInventoryCount} 条 offline inventory`
    ].join("、");
  }

  return currentPublishDraftIssueCount > 0
    ? `${currentPublishDraftIssueCount} 个当前 publish draft`
    : null;
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

  const quotedToolIds = Array.from(
    normalizedMessage.matchAll(/\bmissing catalog tool '([^']+)'/gi),
    (match) => normalizeString(match[1])
  ).filter((toolId): toolId is string => toolId !== null);
  if (quotedToolIds.length > 0) {
    return quotedToolIds;
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
