import React from "react";

import {
  formatCredentialGovernanceLevelLabel,
  formatCredentialGovernanceStatusLabel,
  getCredentialGovernanceSummary,
  type ResourceWithCredentialGovernance
} from "@/lib/credential-governance";

type CredentialGovernanceSummaryCardProps = {
  resource?: ResourceWithCredentialGovernance | null;
  title?: string;
};

export function CredentialGovernanceSummaryCard({
  resource,
  title = "Credential governance"
}: CredentialGovernanceSummaryCardProps) {
  const governance = getCredentialGovernanceSummary(resource);

  if (!governance) {
    return null;
  }

  return (
    <div className="entry-card compact-card">
      <p className="entry-card-title">{title}</p>
      <div className="tool-badge-row">
        <span className="event-chip">credential {governance.credential_name}</span>
        <span className="event-chip">type {governance.credential_type}</span>
        <span className="event-chip">{formatCredentialGovernanceLevelLabel(governance)}</span>
        <span className="event-chip">
          {formatCredentialGovernanceStatusLabel(governance.credential_status)}
        </span>
      </div>
      <p className="section-copy entry-copy">{governance.summary}</p>
      <p className="binding-meta">{governance.credential_ref}</p>
    </div>
  );
}
