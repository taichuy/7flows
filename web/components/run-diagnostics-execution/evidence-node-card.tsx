import type { RunEvidenceNodeItem } from "@/lib/get-run-views";
import { formatDurationMs, formatJsonPayload } from "@/lib/runtime-presenters";

import {
  ArtifactPreviewList,
  PayloadPreview,
  StringListRow
} from "@/components/run-diagnostics-execution/shared";

export function EvidenceNodeCard({ node }: { node: RunEvidenceNodeItem }) {
  return (
    <article className="timeline-row">
      <div className="activity-header">
        <div>
          <h3>{node.node_name}</h3>
          <p className="timeline-meta">
            {node.node_type} · node {node.node_id}
          </p>
        </div>
        <span className={`health-pill ${node.status}`}>{node.status}</span>
      </div>

      <p className="activity-copy">
        Phase {node.phase ?? "n/a"} · Confidence {node.confidence ?? "n/a"} · node run {node.node_run_id}
      </p>

      <div className="payload-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">Evidence summary</span>
        </div>
        {node.summary ? (
          <p>{node.summary}</p>
        ) : (
          <p className="empty-state compact">This evidence node does not have a distilled summary yet.</p>
        )}
      </div>

      <StringListRow title="Key points" items={node.key_points} emptyCopy="No key points recorded." />
      <StringListRow title="Conflicts" items={node.conflicts} emptyCopy="No conflicts recorded." />
      <StringListRow title="Unknowns" items={node.unknowns} emptyCopy="No unknowns recorded." />
      <StringListRow
        title="Recommended focus"
        items={node.recommended_focus}
        emptyCopy="No follow-up focus recorded."
      />

      {node.evidence.length > 0 ? (
        <div className="event-list">
          {node.evidence.map((item, index) => (
            <article className="event-row compact-card" key={`${node.node_run_id}-${index}`}>
              <div className="event-meta">
                <span>{item.title || "evidence"}</span>
                <span>{item.source_ref ?? "no source ref"}</span>
              </div>
              <pre>{formatJsonPayload(item)}</pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.assistant_calls.length > 0 ? (
        <div className="event-list">
          {node.assistant_calls.map((aiCall) => (
            <article className="event-row compact-card" key={aiCall.id}>
              <div className="event-meta">
                <span>{aiCall.role}</span>
                <span>{formatDurationMs(aiCall.latency_ms)}</span>
              </div>
              <pre>
                {formatJsonPayload({
                  provider: aiCall.provider,
                  model_id: aiCall.model_id,
                  output_summary: aiCall.output_summary
                })}
              </pre>
            </article>
          ))}
        </div>
      ) : null}

      {node.tool_calls.length > 0 ? (
        <div className="event-list">
          {node.tool_calls.map((toolCall) => (
            <article className="event-row compact-card" key={toolCall.id}>
              <div className="event-meta">
                <span>{toolCall.tool_name}</span>
                <span>{toolCall.status}</span>
              </div>
              <pre>
                {formatJsonPayload({
                  response_summary: toolCall.response_summary,
                  response_content_type: toolCall.response_content_type,
                  response_meta: toolCall.response_meta,
                  raw_ref: toolCall.raw_ref
                })}
              </pre>
            </article>
          ))}
        </div>
      ) : null}

      <PayloadPreview
        title="Decision output"
        value={node.decision_output}
        emptyCopy="No final decision payload recorded."
      />
      <ArtifactPreviewList artifacts={node.supporting_artifacts} />
    </article>
  );
}
