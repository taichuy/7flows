import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import { getToolGovernanceSummary } from "@/lib/tool-governance";

type ToolGovernanceSummaryProps = {
  tool: PluginToolRegistryItem;
  title?: string;
  subtitle?: string | null;
  trailingChip?: string | null;
};

export function ToolGovernanceSummary({
  tool,
  title = "Governance summary",
  subtitle = null,
  trailingChip = null
}: ToolGovernanceSummaryProps) {
  const governance = getToolGovernanceSummary(tool);

  return (
    <div className="payload-card compact-card">
      <div className="payload-card-header">
        <div>
          <span className="status-meta">{title}</span>
          {subtitle ? <p className="binding-meta">{subtitle}</p> : null}
        </div>
        {trailingChip ? <span className="event-chip">{trailingChip}</span> : null}
      </div>
      <div className="tool-badge-row">
        {governance.sensitivityLevel ? (
          <span className="event-chip">sensitivity {governance.sensitivityLevel}</span>
        ) : null}
        {governance.defaultExecutionClass ? (
          <span className="event-chip">default {governance.defaultExecutionClass}</span>
        ) : null}
        {governance.strongestExecutionClass ? (
          <span className="event-chip">strongest {governance.strongestExecutionClass}</span>
        ) : null}
        {governance.governedBySensitivity ? (
          <span className="event-chip">sensitivity-governed</span>
        ) : null}
      </div>
      <p className="section-copy entry-copy">{governance.summary}</p>
      <div className="tool-badge-row">
        {governance.supportedExecutionClasses.map((executionClass) => (
          <span className="event-chip" key={`${tool.id}-${title}-${executionClass}`}>
            supports {executionClass}
          </span>
        ))}
      </div>
    </div>
  );
}
