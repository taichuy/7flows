import { Button } from 'antd';
import { useNavigate } from '@tanstack/react-router';

import {
  overviewPulseSignals,
  overviewPulseStages
} from '../../../data/workspace-data';
import { useWorkspaceStore } from '../../../state/workspace-store';
import { StatusBadge } from './StatusBadge';

export function WorkspacePulse() {
  const navigate = useNavigate();
  const focusNodeAndFilter = useWorkspaceStore((state) => state.focusNodeAndFilter);

  return (
    <section className="workspace-pulse" aria-label="Workspace pulse">
      <div className="pulse-header">
        <div>
          <p className="section-label">Workspace pulse</p>
          <p className="pulse-copy">首屏先暴露 flow 证据，再决定去哪个任务域处理。</p>
        </div>
        <span className="meta-chip">run_2048 active</span>
      </div>

      <div className="pulse-flow" role="list" aria-label="当前 flow 阶段">
        {overviewPulseStages.map((stage, index) => (
          <article
            key={stage.nodeId}
            className={`pulse-stage ${stage.isCurrent ? 'is-current' : ''}`}
            role="listitem"
          >
            <span className="pulse-stage-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="pulse-stage-copy">
              <div className="badge-row">
                <StatusBadge status={stage.status} label={stage.statusLabel} />
              </div>
              <strong>{stage.title}</strong>
              <p>{stage.note}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="pulse-signal-grid">
        {overviewPulseSignals.map((signal) => (
          <article key={signal.id} className="pulse-signal-card">
            <div className="badge-row">
              <StatusBadge status={signal.status} label={signal.statusLabel} />
              <span className="meta-chip">{signal.meta}</span>
            </div>
            <strong>{signal.title}</strong>
            <p>{signal.note}</p>
          </article>
        ))}
      </div>

      <div className="action-row overview-pulse-actions">
        <Button
          onClick={() => {
            focusNodeAndFilter('approval');
            void navigate({ to: '/orchestration' });
          }}
        >
          定位审批断点
        </Button>
      </div>
    </section>
  );
}
