type OverviewRow = {
  key: string;
  label: string;
  value: string;
};

export function ModelProviderOverviewSummary({
  rows
}: {
  rows: OverviewRow[];
}) {
  return (
    <section className="model-provider-panel__summary-bar">
      <div className="model-provider-panel__summary-items">
        {rows.map((row) => (
          <div key={row.key} className="model-provider-panel__summary-item">
            <span className="model-provider-panel__summary-label">
              {row.label}
            </span>
            <span className="model-provider-panel__summary-value">
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
