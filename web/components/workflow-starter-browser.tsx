"use client";

import {
  getWorkflowBusinessTrackCreateSurface,
  type WorkflowBusinessTrack
} from "@/lib/workflow-business-tracks";
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
  onSelectTrack: (track: WorkflowBusinessTrack) => void;
  onSelectStarter: (starterId: WorkflowStarterTemplateId) => void;
};

export function WorkflowStarterBrowser({
  activeTrack,
  selectedStarterId,
  starters,
  tracks,
  onSelectTrack,
  onSelectStarter
}: WorkflowStarterBrowserProps) {
  const activeTrackMeta = tracks.find((track) => track.id === activeTrack) ?? tracks[0];
  const activeTrackPresentation = getWorkflowBusinessTrackCreateSurface(activeTrackMeta.id);

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
            <span>应用类型</span>
            <strong>{getWorkflowBusinessTrackCreateSurface(track.id).label}</strong>
            <small>{track.starterCount} 个模板</small>
          </button>
        ))}
      </div>

      <div className="starter-browser-toolbar starter-browser-toolbar-dify">
        <div className="starter-browser-toolbar-copy">
          <p className="eyebrow">应用类型</p>
          <h3>选择一个起点</h3>
          <p className="section-copy starter-track-copy">先定模式，再选 starter；右侧只做命名和进入 Studio。</p>
        </div>
        <div className="starter-browser-toolbar-pills">
          <span className="starter-browser-toolbar-pill">{activeTrackPresentation.label}</span>
          <span className="starter-browser-toolbar-pill">{starters.length} 个模板</span>
        </div>
      </div>

      <div className="starter-list" role="list" aria-label="Workflow starter templates">
        {starters.map((starter) => {
          const starterTrackPresentation = getWorkflowBusinessTrackCreateSurface(starter.businessTrack);

          return (
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
                      <span className="starter-track">{starterTrackPresentation.label}</span>
                      <strong>{starter.name}</strong>
                    </div>
                  </div>

                  <div className="starter-card-header-actions starter-list-row-badges">
                    <span className="health-pill">{starter.source.shortLabel}</span>
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
                  <span>{starter.nodeCount} 个节点</span>
                  <span>{starter.governedToolCount > 0 ? `${starter.governedToolCount} 个工具` : "无工具依赖"}</span>
                  {starter.sourceGovernance ? <span>{starter.sourceGovernance.statusLabel}</span> : null}
                  <span>
                    {starter.sandboxGovernance.dependencyModes[0]
                      ? `隔离 ${starter.sandboxGovernance.dependencyModes[0]}`
                      : starter.sandboxGovernance.sandboxNodeCount > 0
                        ? `${starter.sandboxGovernance.sandboxNodeCount} 个隔离节点`
                        : "开箱即用"}
                  </span>
                </div>

                <div className="starter-card-footer starter-list-row-footer">
                  {starter.id === selectedStarterId ? <span>{starter.trackSummary}</span> : null}
                  <span className="starter-card-footer-action">
                    {starter.id === selectedStarterId
                      ? "下一步：右侧命名并进入 Studio"
                      : "选中后在右侧命名"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
