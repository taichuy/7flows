import React from "react";

import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

import type { WorkflowEditorPublishValidationIssue } from "./workflow-editor-publish-form-validation";

type WorkflowEditorPublishFormValidationSummaryProps = {
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  genericValidationIssues: WorkflowEditorPublishValidationIssue[];
  genericValidationRemediationItem: WorkflowValidationNavigatorItem | null;
  remainingGenericValidationIssues: WorkflowEditorPublishValidationIssue[];
  publishLegacyAuthValidationItem: WorkflowValidationNavigatorItem | null;
};

export function WorkflowEditorPublishFormValidationSummary({
  currentHref = null,
  sandboxReadiness = null,
  genericValidationIssues,
  genericValidationRemediationItem,
  remainingGenericValidationIssues,
  publishLegacyAuthValidationItem
}: WorkflowEditorPublishFormValidationSummaryProps) {
  if (genericValidationIssues.length === 0 && !publishLegacyAuthValidationItem) {
    return null;
  }

  return (
    <>
      {genericValidationRemediationItem ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={genericValidationRemediationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}
      {remainingGenericValidationIssues.length > 0 ? (
        <div className="sync-message error">
          <p>当前 publish draft 里还有这些字段级问题：</p>
          <ul className="roadmap-list compact-list">
            {remainingGenericValidationIssues.map((issue) => (
              <li key={issue.key}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {publishLegacyAuthValidationItem ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={publishLegacyAuthValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}
    </>
  );
}
