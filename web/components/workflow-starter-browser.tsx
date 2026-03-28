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
    <div className="starter-browser-list-shell">
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
            <small>{track.starterCount} 个模板</small>
          </button>
        ))}
      </div>

      <div className="starter-browser-toolbar starter-browser-toolbar-dify">
        <div className="starter-browser-toolbar-copy">
          <p className="eyebrow">Current track</p>
          <h3>{activeTrackMeta.id}</h3>
          <p className="section-copy starter-track-copy">{activeTrackMeta.summary}</p>
        </div>
        <div className="starter-browser-toolbar-pills">
          <span className="starter-browser-toolbar-pill">{activeTrackMeta.priority}</span>
          <span className="starter-browser-toolbar-pill">{starters.length} 个模板</span>
          <span className="starter-browser-toolbar-pill starter-browser-toolbar-pill-focus">
            {activeTrackMeta.focus}
          </span>
        </div>
      </div>

      {sourceLanes.length > 0 ? (
        <div className="starter-source-pill-row">
          {sourceLanes.map((lane) => (
            <span className="starter-source-pill" key={`${lane.kind}-${lane.label}`}>
              <strong>{lane.label}</strong>
              <span>{lane.count > 0 ? `${lane.count} ready` : lane.status}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="starter-list" role="list" aria-label="Workflow starter templates">
        {starters.map((starter) => (
          <button
            key={starter.id}
            className={`starter-list-row ${starter.id === selectedStarterId ? "selected" : ""}`}
            type="button"
            onClick={() => onSelectStarter(starter.id)}
          >
            <div className="starter-list-row-main">
              <div className="starter-card-header starter-card-header-dify starter-list-row-header">
                <div className="starter-card-identity">
                  <span aria-hidden="true" className="starter-card-icon">
                    {starter.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <span className="starter-track">{starter.businessTrack}</span>
                    <strong>{starter.name}</strong>
                  </div>
                </div>

                <div className="starter-card-header-actions starter-list-row-badges">
                  <span className="health-pill">{starter.priority}</span>
                  {starter.id === selectedStarterId ? (
                    <span className="starter-selected-pill">当前模板</span>
                  ) : null}
                </div>
              </div>

              <p className="starter-card-description starter-list-row-description">{starter.description}</p>

              <div className="starter-node-row starter-node-row-dify starter-list-row-labels">
                {starter.nodeLabels.slice(0, 4).map((nodeLabel) => (
                  <span className="event-chip" key={`${starter.id}-${nodeLabel}`}>
                    {nodeLabel}
                  </span>
                ))}
              </div>
            </div>

            <div className="starter-list-row-side">
              <div className="starter-meta-row starter-meta-row-dify starter-list-row-meta">
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

              <div className="starter-card-footer starter-list-row-footer">
                <span>{starter.trackSummary}</span>
                <span className="starter-card-footer-action">
                  {starter.id === selectedStarterId ? "已同步到右侧配置" : "选中后在右侧创建"}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
