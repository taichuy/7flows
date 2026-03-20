import React from "react";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildWorkflowValidationRemediation } from "@/lib/workflow-validation-remediation";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

type WorkflowValidationRemediationCardProps = {
  item?: WorkflowValidationNavigatorItem | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function WorkflowValidationRemediationCard({
  item,
  sandboxReadiness
}: WorkflowValidationRemediationCardProps) {
  if (!item) {
    return null;
  }

  const remediation = buildWorkflowValidationRemediation(item, sandboxReadiness);

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
    </div>
  );
}
