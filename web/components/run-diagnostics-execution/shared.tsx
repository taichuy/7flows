import type { RunArtifactItem } from "@/lib/get-run-views";
import { formatJsonPayload, formatTimestamp } from "@/lib/runtime-presenters";

export function SummaryCard({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <article className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function MetricChipRow({
  title,
  metrics,
  prefix,
  emptyCopy
}: {
  title?: string;
  metrics: Record<string, number>;
  prefix: string;
  emptyCopy: string;
}) {
  const entries = Object.entries(metrics);

  return (
    <div className="trace-active-filter-row">
      {title ? <span className="status-meta">{title}</span> : null}
      {entries.length === 0 ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        entries.map(([key, value]) => (
          <span className="event-chip" key={`${prefix}-${key}`}>
            {key} · {value}
          </span>
        ))
      )}
    </div>
  );
}

export function StringListRow({
  title,
  items,
  emptyCopy
}: {
  title: string;
  items: string[];
  emptyCopy: string;
}) {
  return (
    <div className="payload-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        <div className="event-type-strip">
          {items.map((item) => (
            <span className="event-chip" key={`${title}-${item}`}>
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArtifactPreviewList({ artifacts }: { artifacts: RunArtifactItem[] }) {
  if (artifacts.length === 0) {
    return null;
  }

  return (
    <div className="event-list">
      {artifacts.map((artifact) => (
        <article className="event-row compact-card" key={artifact.id}>
          <div className="event-meta">
            <span>{artifact.artifact_kind}</span>
            <span>{artifact.content_type}</span>
          </div>
          <p className="event-run">
            {artifact.uri} · {formatTimestamp(artifact.created_at)}
          </p>
          <pre>
            {formatJsonPayload({
              summary: artifact.summary,
              metadata_payload: artifact.metadata_payload
            })}
          </pre>
        </article>
      ))}
    </div>
  );
}

export function PayloadPreview({
  title,
  value,
  emptyCopy
}: {
  title: string;
  value: unknown;
  emptyCopy: string;
}) {
  const isEmptyObject =
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0;

  return (
    <div className="payload-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
      </div>
      {value == null || isEmptyObject ? (
        <p className="empty-state compact">{emptyCopy}</p>
      ) : (
        <pre>{formatJsonPayload(value)}</pre>
      )}
    </div>
  );
}
