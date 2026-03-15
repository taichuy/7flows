import type { RunEvidenceView } from "@/lib/get-run-views";

import { SummaryCard } from "@/components/run-diagnostics-execution/shared";

export function RunDiagnosticsEvidenceOverview({
  evidenceView
}: {
  evidenceView: RunEvidenceView | null;
}) {
  if (!evidenceView) {
    return <p className="empty-state">Evidence view is unavailable for this run.</p>;
  }

  if (evidenceView.nodes.length === 0) {
    return (
      <p className="empty-state">
        This run has no evidence nodes yet, so there is no distilled assistant context to show.
      </p>
    );
  }

  return (
    <>
      <div className="summary-strip">
        <SummaryCard label="Evidence nodes" value={evidenceView.summary.node_count} />
        <SummaryCard label="Supporting artifacts" value={evidenceView.summary.artifact_count} />
        <SummaryCard label="Tool calls" value={evidenceView.summary.tool_call_count} />
        <SummaryCard label="Assistant calls" value={evidenceView.summary.assistant_call_count} />
      </div>

      <div className="event-type-strip">
        {evidenceView.nodes.map((node) => (
          <span className="event-chip" key={node.node_run_id}>
            {node.node_name} · {node.status}
          </span>
        ))}
      </div>
    </>
  );
}
