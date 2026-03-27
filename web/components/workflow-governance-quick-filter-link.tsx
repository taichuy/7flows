import Link from "next/link";

import type { WorkflowListItem } from "@/lib/get-workflows";
import {
  formatCatalogGapResourceSummary,
  getWorkflowLegacyPublishAuthStatusLabel
} from "@/lib/workflow-definition-governance";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";

type WorkflowGovernanceQuickFilterIssue = "legacy_publish_auth" | "missing_tool";

type WorkflowGovernanceQuickFilterLinkProps = {
  workflow: WorkflowListItem;
  href: string;
  primaryIssue: WorkflowGovernanceQuickFilterIssue;
};

const QUICK_FILTER_FOLLOW_UP_BY_ISSUE: Record<WorkflowGovernanceQuickFilterIssue, string> = {
  legacy_publish_auth:
    "打开当前 quick filter 后即可继续处理 publish auth contract，并顺手核对同一 workflow 的 catalog gap。",
  missing_tool:
    "打开当前 quick filter 后即可继续补齐 binding / LLM Agent tool policy，并顺手核对同一 workflow 的 publish auth contract。"
};

const QUICK_FILTER_CATALOG_GAP_RETURN_DETAIL =
  "打开当前 quick filter 后先补齐 binding / LLM Agent tool policy，再继续沿同一份 workflow governance handoff 收口。";

function buildPrimarySummary(
  workflow: WorkflowListItem,
  primaryIssue: WorkflowGovernanceQuickFilterIssue
) {
  if (primaryIssue === "legacy_publish_auth") {
    return `${workflow.name} · ${getWorkflowLegacyPublishAuthStatusLabel(workflow) ?? "legacy auth cleanup"}`;
  }

  return (
    formatCatalogGapResourceSummary(workflow.name, workflow.tool_governance?.missing_tool_ids ?? []) ??
    `${workflow.name} · catalog gap`
  );
}

export function WorkflowGovernanceQuickFilterLink({
  workflow,
  href,
  primaryIssue
}: WorkflowGovernanceQuickFilterLinkProps) {
  const workflowGovernanceHandoff = buildWorkflowGovernanceHandoff({
    workflowId: workflow.id,
    workflowName: workflow.name,
    workflowDetailHref: href,
    toolGovernance: workflow.tool_governance ?? null,
    legacyAuthGovernance: workflow.legacy_auth_governance ?? null,
    workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
      toolGovernance: workflow.tool_governance ?? null,
      subjectLabel: workflow.name,
      returnDetail: QUICK_FILTER_CATALOG_GAP_RETURN_DETAIL
    })
  });

  const chipLabels = Array.from(
    new Set(
      [
        workflowGovernanceHandoff.legacyAuthHandoff?.bindingChipLabel ?? null,
        workflowGovernanceHandoff.legacyAuthHandoff?.statusChipLabel ?? null,
        primaryIssue === "legacy_publish_auth"
          ? workflowGovernanceHandoff.workflowCatalogGapSummary
          : null
      ].filter((value): value is string => Boolean(value))
    )
  );

  const orderedFollowUpDetails =
    primaryIssue === "legacy_publish_auth"
      ? [
          workflowGovernanceHandoff.legacyAuthHandoff?.detail ?? null,
          workflowGovernanceHandoff.workflowCatalogGapDetail,
          QUICK_FILTER_FOLLOW_UP_BY_ISSUE[primaryIssue]
        ]
      : [
          workflowGovernanceHandoff.workflowCatalogGapDetail,
          workflowGovernanceHandoff.legacyAuthHandoff?.detail ?? null,
          QUICK_FILTER_FOLLOW_UP_BY_ISSUE[primaryIssue]
        ];

  const followUpDetails = Array.from(
    new Set(orderedFollowUpDetails.filter((detail): detail is string => Boolean(detail)))
  );

  return (
    <Link className="workflow-chip" href={href}>
      <strong className="workflow-chip-title">{buildPrimarySummary(workflow, primaryIssue)}</strong>
      <small>
        {workflow.version} · {workflow.status}
      </small>
      {chipLabels.length > 0 ? (
        <div className="event-type-strip compact-strip">
          {chipLabels.map((chipLabel) => (
            <span className="event-chip" key={chipLabel}>
              {chipLabel}
            </span>
          ))}
        </div>
      ) : null}
      {followUpDetails.length > 0 ? (
        <div className="workflow-chip-follow-up">
          {followUpDetails.map((detail) => (
            <small key={detail}>{detail}</small>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
