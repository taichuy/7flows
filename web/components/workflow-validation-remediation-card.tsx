import React from "react";

import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildOperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import { buildSandboxReadinessFollowUpCandidate } from "@/lib/system-overview-follow-up-presenters";
import { buildWorkflowValidationRemediation } from "@/lib/workflow-validation-remediation";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

type WorkflowValidationRemediationCardProps = {
  item?: WorkflowValidationNavigatorItem | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  currentHref?: string | null;
};

export function WorkflowValidationRemediationCard({
  item,
  sandboxReadiness,
  currentHref = null
}: WorkflowValidationRemediationCardProps) {
  if (!item) {
    return null;
  }

  const remediation = buildWorkflowValidationRemediation(item, sandboxReadiness);
  const recommendedNextStep = remediation.followUp
    ? buildOperatorRecommendedNextStep({
        execution: buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
        currentHref
      })
    : null;

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
      <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
    </div>
  );
}
