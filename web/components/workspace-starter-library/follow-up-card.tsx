import type { ReactNode } from "react";

type WorkspaceStarterFollowUpCardProps = {
  title?: string;
  label: string;
  headline?: string | null;
  detail: string;
  primaryResourceSummary?: string | null;
  actions?: ReactNode;
};

export function WorkspaceStarterFollowUpCard({
  title = "Recommended next step",
  label,
  headline = null,
  detail,
  primaryResourceSummary = null,
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
      {actions ? <div className="binding-actions">{actions}</div> : null}
    </div>
  );
}
