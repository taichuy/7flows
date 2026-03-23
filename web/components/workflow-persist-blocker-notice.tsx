import React from "react";

import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import { buildWorkflowPersistBlockerRecommendedNextStep } from "@/components/workflow-editor-workbench/persist-blockers";

type WorkflowPersistBlockerNoticeProps = {
  title: string;
  summary?: string | null;
  blockers: WorkflowPersistBlocker[];
  sandboxReadiness?: SandboxReadinessCheck | null;
  currentHref?: string | null;
  hideRecommendedNextStep?: boolean;
  limit?: number;
};

export function WorkflowPersistBlockerNotice({
  title,
  summary = null,
  blockers,
  sandboxReadiness = null,
  currentHref = null,
  hideRecommendedNextStep = false,
  limit = 4
}: WorkflowPersistBlockerNoticeProps) {
  if (blockers.length === 0) {
    return null;
  }

  const recommendedNextStep = buildWorkflowPersistBlockerRecommendedNextStep(
    blockers,
    sandboxReadiness,
    currentHref
  );

  return (
    <div className="sync-message error">
      <strong>{title}</strong>
      {summary ? <p className="section-copy entry-copy">{summary}</p> : null}
      {hideRecommendedNextStep ? null : (
        <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
      )}
      <ul className="event-list compact-list">
        {blockers.slice(0, limit).map((blocker) => (
          <li key={blocker.id}>
            <strong>{blocker.label}</strong>：{blocker.detail} {blocker.nextStep}
          </li>
        ))}
      </ul>
    </div>
  );
}
