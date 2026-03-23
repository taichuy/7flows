import { WorkbenchEntryLink, WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import type {
  CrossEntryRiskDigest,
  CrossEntryRiskDigestTone
} from "@/lib/cross-entry-risk-digest";

type CrossEntryRiskDigestPanelProps = {
  digest: CrossEntryRiskDigest;
  eyebrow?: string;
  title?: string;
  intro: string;
};

function getToneClassName(tone: CrossEntryRiskDigestTone) {
  switch (tone) {
    case "blocked":
      return "failed";
    case "degraded":
      return "degraded";
    default:
      return "healthy";
  }
}

function getToneLabel(tone: CrossEntryRiskDigestTone) {
  switch (tone) {
    case "blocked":
      return "blocked";
    case "degraded":
      return "attention";
    default:
      return "healthy";
  }
}

export function CrossEntryRiskDigestPanel({
  digest,
  eyebrow = "Operator overview",
  title = "Cross-entry risk digest",
  intro
}: CrossEntryRiskDigestPanelProps) {
  return (
    <article className="diagnostic-panel panel-span">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className="section-actions">
          <p className="section-copy">{intro}</p>
          <WorkbenchEntryLinks
            keys={digest.entryKeys}
            overrides={digest.entryOverrides}
            primaryKey={digest.primaryEntryKey}
            variant="inline"
          />
        </div>
      </div>

      <div className="summary-strip">
        {digest.metrics.map((metric) => (
          <article className="summary-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </article>
        ))}
      </div>

      <article className="payload-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">Primary follow-up</span>
          <span className={`health-pill ${getToneClassName(digest.tone)}`}>
            {getToneLabel(digest.tone)}
          </span>
        </div>
        <p className="binding-meta">{digest.headline}</p>
        <p className="section-copy entry-copy">{digest.detail}</p>
        <div className="tool-badge-row">
          <WorkbenchEntryLink
            className="inline-link secondary"
            linkKey={digest.primaryFollowUpEntry.entryKey}
            override={digest.primaryFollowUpEntry.entryOverride}
          />
        </div>
      </article>

      <div className="activity-list">
        {digest.focusAreas.map((area) => (
          <article className="activity-row" key={area.id}>
            <div className="activity-header">
              <div>
                <h3>{area.title}</h3>
                <p>{area.summary}</p>
              </div>
              <span className={`health-pill ${getToneClassName(area.tone)}`}>
                {getToneLabel(area.tone)}
              </span>
            </div>
            <p className="activity-copy">{area.nextStep}</p>
            <div className="tool-badge-row">
              <WorkbenchEntryLink
                className="inline-link secondary"
                linkKey={area.entryKey}
                override={area.entryOverride}
              />
            </div>
          </article>
        ))}
      </div>
    </article>
  );
}
