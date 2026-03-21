"use client";

import type { WorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import type { WorkflowLibrarySourceLane } from "@/lib/workflow-source-model";
import type {
  WorkflowStarterTemplateId,
  WorkflowStarterTemplate,
  WorkflowStarterTrackItem
} from "@/lib/workflow-starters";

type WorkflowStarterBrowserProps = {
  activeTrack: WorkflowBusinessTrack;
  selectedStarterId: WorkflowStarterTemplateId;
  starters: WorkflowStarterTemplate[];
  tracks: WorkflowStarterTrackItem[];
  sourceLanes: WorkflowLibrarySourceLane[];
  onSelectTrack: (track: WorkflowBusinessTrack) => void;
  onSelectStarter: (starterId: WorkflowStarterTemplateId) => void;
};

export function WorkflowStarterBrowser({
  activeTrack,
  selectedStarterId,
  starters,
  tracks,
  sourceLanes,
  onSelectTrack,
  onSelectStarter
}: WorkflowStarterBrowserProps) {
  const activeTrackMeta = tracks.find((track) => track.id === activeTrack) ?? tracks[0];

  return (
    <>
      <div className="starter-track-bar" role="tablist" aria-label="Workflow starter tracks">
        {tracks.map((track) => (
          <button
            key={track.id}
            className={`starter-track-chip ${track.id === activeTrack ? "selected" : ""}`}
            type="button"
            onClick={() => onSelectTrack(track.id)}
          >
            <span>{track.priority}</span>
            <strong>{track.id}</strong>
            <small>{track.starterCount} starters</small>
          </button>
        ))}
      </div>

      <div className="starter-track-summary">
        <div>
          <p className="eyebrow">Current track</p>
          <h3>{activeTrackMeta.id}</h3>
          <p className="section-copy starter-track-copy">{activeTrackMeta.summary}</p>
        </div>
        <div className="starter-track-focus-card">
          <span className="status-meta">{activeTrackMeta.priority}</span>
          <p>{activeTrackMeta.focus}</p>
        </div>
      </div>

      <div className="summary-strip compact-strip">
        {sourceLanes.map((lane) => (
          <div className="summary-card" key={`${lane.kind}-${lane.label}`}>
            <span>{lane.label}</span>
            <strong>{lane.count > 0 ? `${lane.count} ready` : lane.status}</strong>
          </div>
        ))}
      </div>

      <div className="starter-grid">
        {starters.map((starter) => (
          <button
            key={starter.id}
            className={`starter-card ${starter.id === selectedStarterId ? "selected" : ""}`}
            type="button"
            onClick={() => onSelectStarter(starter.id)}
          >
            <div className="starter-card-header">
              <span className="starter-track">{starter.businessTrack}</span>
              <span className="health-pill">{starter.priority}</span>
            </div>
            <strong>{starter.name}</strong>
            <p>{starter.description}</p>
            <p className="starter-focus-copy">{starter.workflowFocus}</p>
            <div className="starter-node-row">
              {starter.nodeLabels.map((nodeLabel) => (
                <span className="event-chip" key={`${starter.id}-${nodeLabel}`}>
                  {nodeLabel}
                </span>
              ))}
            </div>
            <div className="starter-meta-row">
              <span>{starter.nodeCount} nodes</span>
              <span>{starter.governedToolCount} governed tools</span>
              <span>{starter.strongIsolationToolCount} strong isolation</span>
              <span>{starter.source.shortLabel}</span>
              {starter.sourceGovernance ? <span>{starter.sourceGovernance.statusLabel}</span> : null}
              <span>
                {starter.sandboxGovernance.dependencyModes[0]
                  ? `deps ${starter.sandboxGovernance.dependencyModes[0]}`
                  : starter.sandboxGovernance.sandboxNodeCount > 0
                    ? `${starter.sandboxGovernance.sandboxNodeCount} sandbox`
                    : starter.tags[0] ?? "starter"}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
