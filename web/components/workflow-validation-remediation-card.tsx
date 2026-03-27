import React from "react";

import { LegacyPublishAuthContractCard } from "@/components/legacy-publish-auth-contract-card";
import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildOperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import { buildSandboxReadinessFollowUpCandidate } from "@/lib/system-overview-follow-up-presenters";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
import { buildWorkflowValidationRemediation } from "@/lib/workflow-validation-remediation";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

type WorkflowValidationRemediationCardProps = {
  item?: WorkflowValidationNavigatorItem | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  currentHref?: string | null;
};

function buildValidationWorkflowGovernanceHandoff(
  item: WorkflowValidationNavigatorItem,
  currentHref?: string | null
) {
  const catalogGapToolIds = Array.from(new Set(item.catalogGapToolIds ?? []));

  if (catalogGapToolIds.length === 0) {
    return null;
  }

  const toolGovernance = {
    referenced_tool_ids: catalogGapToolIds,
    missing_tool_ids: catalogGapToolIds,
    governed_tool_count: 0,
    strong_isolation_tool_count: 0
  };

  return buildWorkflowGovernanceHandoff({
    workflowDetailHref: currentHref ?? null,
    toolGovernance,
    workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
      toolGovernance,
      subjectLabel: "这条字段级问题",
      returnDetail: "先回到当前 workflow 编辑器补齐 binding / LLM Agent tool policy，再继续处理这条校验。"
    })
  });
}

export function WorkflowValidationRemediationCard({
  item,
  sandboxReadiness,
  currentHref = null
}: WorkflowValidationRemediationCardProps) {
  if (!item) {
    return null;
  }

  const remediation = buildWorkflowValidationRemediation(item, sandboxReadiness);
  const workflowGovernanceHandoff = buildValidationWorkflowGovernanceHandoff(
    item,
    currentHref
  );
  const recommendedNextStep = remediation.followUp
    ? buildOperatorRecommendedNextStep({
        execution: buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
        currentHref
      })
    : null;
  const showLegacyAuthContract =
    item.hasLegacyPublishAuthModeIssues ??
    (item.target.scope === "publish" && item.target.fieldPath === "authMode");

  return (
    <div className="sync-message error">
      <p>
        <strong>{remediation.title}</strong>
      </p>
      <p className="section-copy entry-copy">{remediation.issue}</p>
      <p className="binding-meta">下一步：{remediation.suggestion}</p>
      {remediation.followUp ? (
        <p className="binding-meta">Live sandbox readiness：{remediation.followUp}</p>
      ) : null}
      <WorkflowGovernanceHandoffCards
        workflowCatalogGapSummary={workflowGovernanceHandoff?.workflowCatalogGapSummary}
        workflowCatalogGapDetail={workflowGovernanceHandoff?.workflowCatalogGapDetail}
        workflowCatalogGapHref={workflowGovernanceHandoff?.workflowCatalogGapHref}
        workflowGovernanceHref={workflowGovernanceHandoff?.workflowGovernanceHref}
        legacyAuthHandoff={workflowGovernanceHandoff?.legacyAuthHandoff}
        cardClassName="entry-card compact-card"
        currentHref={currentHref}
      />
      {showLegacyAuthContract ? <LegacyPublishAuthContractCard /> : null}
      <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
    </div>
  );
}
