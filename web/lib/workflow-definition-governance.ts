import type { WorkflowDefinitionPreflightIssue, WorkflowListItem } from "@/lib/get-workflows";

type WorkflowMissingToolGovernanceLike = Pick<WorkflowListItem, "tool_governance">;

export function isLegacyPublishAuthModeIssue(
  issue: WorkflowDefinitionPreflightIssue
): boolean {
  return issue.category === "publish_draft" && issue.field === "authMode";
}

export function getWorkflowLegacyPublishAuthIssues(
  workflow: Pick<WorkflowListItem, "definition_issues">
): WorkflowDefinitionPreflightIssue[] {
  return (workflow.definition_issues ?? []).filter(isLegacyPublishAuthModeIssue);
}

export function hasWorkflowLegacyPublishAuthIssues(
  workflow: Pick<WorkflowListItem, "definition_issues">
): boolean {
  return getWorkflowLegacyPublishAuthIssues(workflow).length > 0;
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

function normalizeCatalogGapToolIds(toolIds: readonly unknown[]): string[] {
  return Array.from(
    new Set(
      toolIds
        .map((toolId) => normalizeString(toolId))
        .filter((toolId): toolId is string => toolId !== null)
    )
  );
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
