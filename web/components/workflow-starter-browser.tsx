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
      <div className="starter-track-bar starter-track-bar-dify" role="tablist" aria-label="Workflow starter tracks">
        {tracks.map((track) => (
          <button
            key={track.id}
            className={`starter-track-chip starter-track-chip-dify ${track.id === activeTrack ? "selected" : ""}`}
            type="button"
            onClick={() => onSelectTrack(track.id)}
          >
            <span>{track.priority}</span>
            <strong>{track.id}</strong>
            <small>{track.starterCount} starters</small>
          </button>
        ))}
      </div>

      <div className="starter-track-summary starter-track-summary-dify">
        <div className="starter-track-summary-copy">
          <p className="eyebrow">Current track</p>
          <h3>{activeTrackMeta.id}</h3>
          <p className="section-copy starter-track-copy">{activeTrackMeta.summary}</p>
        </div>
        <div className="starter-track-summary-side">
          <div className="starter-track-focus-card starter-track-focus-card-dify">
            <span className="status-meta">{activeTrackMeta.priority}</span>
            <p>{activeTrackMeta.focus}</p>
          </div>
          <div className="starter-track-stat-card">
            <span>Templates</span>
            <strong>{starters.length}</strong>
          </div>
        </div>
      </div>

      <div className="summary-strip compact-strip starter-source-strip">
        {sourceLanes.map((lane) => (
          <div className="summary-card starter-source-card" key={`${lane.kind}-${lane.label}`}>
            <span>{lane.label}</span>
            <strong>{lane.count > 0 ? `${lane.count} ready` : lane.status}</strong>
          </div>
        ))}
      </div>

      <div className="starter-grid starter-grid-dify">
        {starters.map((starter) => (
          <button
            key={starter.id}
            className={`starter-card starter-card-dify ${starter.id === selectedStarterId ? "selected" : ""}`}
            type="button"
            onClick={() => onSelectStarter(starter.id)}
          >
            <div className="starter-card-header starter-card-header-dify">
              <div className="starter-card-identity">
                <span aria-hidden="true" className="starter-card-icon">
                  {starter.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <span className="starter-track">{starter.businessTrack}</span>
                  <strong>{starter.name}</strong>
                </div>
              </div>
              <div className="starter-card-header-actions">
                <span className="health-pill">{starter.priority}</span>
                {starter.id === selectedStarterId ? (
                  <span className="starter-selected-pill">当前模板</span>
                ) : null}
              </div>
            </div>
            <p>{starter.description}</p>
            <p className="starter-focus-copy">{starter.workflowFocus}</p>
            <div className="starter-node-row starter-node-row-dify">
              {starter.nodeLabels.slice(0, 4).map((nodeLabel) => (
                <span className="event-chip" key={`${starter.id}-${nodeLabel}`}>
                  {nodeLabel}
                </span>
              ))}
            </div>
            <div className="starter-meta-row starter-meta-row-dify">
              <span>{starter.nodeCount} nodes</span>
              <span>{starter.governedToolCount} governed tools</span>
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
            <div className="starter-card-footer">
              <span>{starter.trackSummary}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
