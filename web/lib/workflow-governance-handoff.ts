import type { WorkflowToolGovernanceSummary } from "@/lib/get-workflows";
import {
  buildLegacyPublishAuthWorkflowHandoff,
  type LegacyPublishAuthWorkflowHandoff
} from "@/lib/legacy-publish-auth-governance-presenters";
import {
  formatCatalogGapToolSummary,
  formatWorkflowMissingToolSummary,
  hasWorkflowLegacyPublishAuthIssues,
  hasWorkflowMissingToolIssues
} from "@/lib/workflow-definition-governance";
import {
  appendWorkflowLibraryViewState,
  appendWorkflowLibraryViewStateForWorkflow,
  readWorkflowLibraryViewState,
  type WorkflowLibraryViewState
} from "@/lib/workflow-library-query";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-types";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

export type WorkflowGovernanceHandoff = {
  workflowId: string | null;
  workflowGovernanceHref: string | null;
  workflowCatalogGapHref: string | null;
  workflowCatalogGapSummary: string | null;
  workflowCatalogGapDetail: string | null;
  legacyAuthHandoff: LegacyPublishAuthWorkflowHandoff | null;
};

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function buildWorkflowCatalogGapDetail({
  toolGovernance,
  subjectLabel,
  returnDetail
}: {
  toolGovernance?: WorkflowToolGovernanceSummary | null;
  subjectLabel: string;
  returnDetail: string;
}) {
  const workflowCatalogGapSummary = toolGovernance
    ? formatWorkflowMissingToolSummary({ tool_governance: toolGovernance })
    : null;
  const workflowCatalogGapToolCopy = formatCatalogGapToolSummary(
    toolGovernance?.missing_tool_ids ?? []
  );

  if (!workflowCatalogGapSummary) {
    return null;
  }

  return workflowCatalogGapToolCopy
    ? `当前 ${subjectLabel} 对应的 workflow 版本仍有 catalog gap（${workflowCatalogGapToolCopy}）；${returnDetail}`
    : `当前 ${subjectLabel} 对应的 workflow 版本仍有 catalog gap；${returnDetail}`;
}

export function buildWorkflowGovernanceHandoff({
  workflowId,
  workflowDetailHref,
  toolGovernance,
  legacyAuthGovernance,
  workflowCatalogGapDetail = null
}: {
  workflowId?: string | null;
  workflowDetailHref?: string | null;
  toolGovernance?: WorkflowToolGovernanceSummary | null;
  legacyAuthGovernance?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workflowCatalogGapDetail?: string | null;
}): WorkflowGovernanceHandoff {
  const resolvedWorkflowId =
    normalizeText(workflowId) ?? normalizeText(legacyAuthGovernance?.workflows[0]?.workflow_id);
  const resolvedWorkflowDetailHref =
    normalizeText(workflowDetailHref) ??
    (resolvedWorkflowId
      ? buildAuthorFacingWorkflowDetailLinkSurface({
          workflowId: resolvedWorkflowId,
          variant: "editor"
        }).href
      : null);
  const workflowCatalogGapSummary = toolGovernance
    ? formatWorkflowMissingToolSummary({ tool_governance: toolGovernance })
    : null;
  const workflowLibraryWorkflow = {
    workflow_id: resolvedWorkflowId,
    definition_issues: [],
    tool_governance: toolGovernance ?? null,
    legacy_auth_governance: legacyAuthGovernance ?? null
  };
  const workflowLibraryViewState: WorkflowLibraryViewState = resolvedWorkflowDetailHref
    ? readWorkflowLibraryViewState(
        new URLSearchParams(resolvedWorkflowDetailHref.split("?")[1] ?? "")
      )
    : { definitionIssue: null };
  const legacyAuthHandoff = resolvedWorkflowId
    ? buildLegacyPublishAuthWorkflowHandoff(legacyAuthGovernance ?? null, resolvedWorkflowId)
    : null;
  const hasWorkflowGovernanceIssues =
    hasWorkflowLegacyPublishAuthIssues(workflowLibraryWorkflow) ||
    hasWorkflowMissingToolIssues(workflowLibraryWorkflow);
  const workflowGovernanceHref = resolvedWorkflowDetailHref
    ? hasWorkflowGovernanceIssues
      ? appendWorkflowLibraryViewStateForWorkflow(
          resolvedWorkflowDetailHref,
          workflowLibraryWorkflow,
          workflowLibraryViewState
        )
      : resolvedWorkflowDetailHref
    : null;
  const workflowCatalogGapHref =
    resolvedWorkflowDetailHref && workflowCatalogGapSummary
      ? appendWorkflowLibraryViewState(
          resolvedWorkflowDetailHref,
          { definitionIssue: "missing_tool" }
        )
      : null;

  return {
    workflowId: resolvedWorkflowId,
    workflowGovernanceHref,
    workflowCatalogGapHref,
    workflowCatalogGapSummary,
    workflowCatalogGapDetail: workflowCatalogGapSummary ? workflowCatalogGapDetail : null,
    legacyAuthHandoff
  };
}
