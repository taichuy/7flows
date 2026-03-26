import React, { type ReactNode } from "react";

import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import type { WorkflowGovernanceHandoff } from "@/lib/workflow-governance-handoff";

type WorkspaceStarterFollowUpCardProps = {
  title?: string;
  label: string;
  headline?: string | null;
  detail: string;
  primaryResourceSummary?: string | null;
  workflowGovernanceHandoff?: WorkflowGovernanceHandoff | null;
  actions?: ReactNode;
};

export function WorkspaceStarterFollowUpCard({
  title = "Recommended next step",
  label,
  headline = null,
  detail,
  primaryResourceSummary = null,
  workflowGovernanceHandoff = null,
  actions
}: WorkspaceStarterFollowUpCardProps) {
  return (
    <div className="entry-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
        <span className="event-chip">{label}</span>
      </div>
      {headline ? <p className="section-copy starter-summary-copy">{headline}</p> : null}
      <p className="section-copy starter-summary-copy">{detail}</p>
      {primaryResourceSummary ? (
        <p className="binding-meta">
          {`Primary governed starter: ${primaryResourceSummary}.`}
        </p>
      ) : null}
      {workflowGovernanceHandoff ? (
        <WorkflowGovernanceHandoffCards
          workflowCatalogGapSummary={workflowGovernanceHandoff.workflowCatalogGapSummary}
          workflowCatalogGapDetail={workflowGovernanceHandoff.workflowCatalogGapDetail}
          workflowCatalogGapHref={workflowGovernanceHandoff.workflowCatalogGapHref}
          workflowGovernanceHref={workflowGovernanceHandoff.workflowGovernanceHref}
          legacyAuthHandoff={workflowGovernanceHandoff.legacyAuthHandoff}
          cardClassName="payload-card compact-card"
        />
      ) : null}
      {actions ? <div className="binding-actions">{actions}</div> : null}
    </div>
  );
}
