import { Button, Card } from 'antd';
import { useNavigate } from '@tanstack/react-router';

import {
  contracts,
  embedRuntimeSnapshot,
  embeddedArtifacts,
  getRun,
  overviewFocusItems,
  overviewRunSummaries,
  repoReality,
  workspaceMeta
} from '../../../data/workspace-data';
import { useWorkspaceStore } from '../../../state/workspace-store';
import { StatusBadge } from '../components/StatusBadge';
import { WorkspacePulse } from '../components/WorkspacePulse';

export function OverviewView() {
  const navigate = useNavigate();
  const openRun = useWorkspaceStore((state) => state.openRun);
  const setRunFilter = useWorkspaceStore((state) => state.setRunFilter);
  const setContractMode = useWorkspaceStore((state) => state.setContractMode);

  const openOverviewRun = (runId: string) => {
    const run = getRun(runId);

    if (!run) {
      return;
    }

    setRunFilter(run.status);
    openRun(run.id);
    void navigate({ to: '/logs' });
  };

  const openFocusItem = (focusId: string) => {
    const focusItem = overviewFocusItems.find((item) => item.id === focusId);

    if (!focusItem) {
      return;
    }

    if (focusItem.actionView === 'logs' && focusItem.runId) {
      openOverviewRun(focusItem.runId);
      return;
    }

    if (focusItem.actionView === 'api' && focusItem.contractMode) {
      setContractMode(focusItem.contractMode);
    }

    void navigate({ to: `/${focusItem.actionView}` });
  };

  return (
    <section className="view-stack">
      <Card className="hero-card" variant="borderless">
        <div className="hero-layout">
          <div className="hero-main">
            <p className="section-label">应用概览</p>
            <div className="hero-title-row">
              <h2>{workspaceMeta.name}</h2>
              <span className="hero-kicker">Workspace demo</span>
            </div>
            <p className="hero-copy">
              首屏先确认 flow 卡在哪里、published exposure 是否稳定，以及 embedded host gap
              还有多远。
            </p>
            <div className="action-row overview-actions">
              <Button
                type="primary"
                onClick={() => {
                  void navigate({ to: '/orchestration' });
                }}
              >
                进入编排
              </Button>
            </div>
            <WorkspacePulse />
          </div>

          <div className="hero-side hero-focus-card">
            <div className="hero-focus-list">
              <div className="hero-focus-header">
                <p className="section-label">当前焦点</p>
                <p className="hero-focus-caption">
                  右侧只回答为什么值得去看，以及应该去哪处理。
                </p>
              </div>
              {overviewFocusItems.map((item) => (
                <article key={item.id} className="hero-focus-row">
                  <div className="hero-focus-copy">
                    <div className="badge-row">
                      <StatusBadge status={item.status} label={item.statusLabel} />
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.note}</p>
                  </div>
                  <Button
                    className="focus-action-button"
                    onClick={() => {
                      openFocusItem(item.id);
                    }}
                  >
                    {item.actionLabel}
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="content-grid content-grid-overview">
        <Card
          className="panel"
          title={<span role="heading" aria-level={2}>最近运行摘要</span>}
        >
          <div className="stack-list">
            {overviewRunSummaries.map((item) => {
              const run = getRun(item.runId);

              if (!run) {
                return null;
              }

              return (
                <article key={run.id} className="stack-row">
                  <div>
                    <div className="badge-row">
                      <StatusBadge status={run.status} label={run.statusLabel} />
                      <span className="meta-chip">{run.currentNode}</span>
                    </div>
                    <strong>{run.title}</strong>
                    <p>{item.note}</p>
                  </div>
                  <Button
                    onClick={() => {
                      openOverviewRun(run.id);
                    }}
                  >
                    {item.actionLabel}
                  </Button>
                </article>
              );
            })}
          </div>
        </Card>

        <Card className="panel" title="Published 与 Draft 明确分层">
          <div className="stack-list">
            <article className="stack-row">
              <div>
                <strong>Published contract</strong>
                <p>{contracts.openai.draftNote}</p>
              </div>
              <StatusBadge
                status={contracts.openai.status}
                label={contracts.openai.statusLabel}
              />
            </article>
            <article className="stack-row">
              <div>
                <strong>Current draft</strong>
                <p>
                  Classifier 阈值、Approval gate 文案与 Reply composer 输出仍等待下一次发布。
                </p>
              </div>
              <StatusBadge status="draft" label="3 changes" />
            </article>
          </div>
        </Card>

        <Card className="panel" title="真实路由成熟度">
          <div className="stack-list">
            {repoReality.map((item) => (
              <article key={item.title} className="stack-row">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.note}</p>
                </div>
                <StatusBadge status={item.status} label={item.statusLabel} />
              </article>
            ))}
          </div>
        </Card>

        <Card className="panel" title="Embedded runtime snapshot">
          <div className="stack-list">
            {embeddedArtifacts.map((artifact) => (
              <article key={artifact.appId} className="stack-row">
                <div>
                  <strong>{artifact.name}</strong>
                  <p>
                    {artifact.routePrefix} · {artifact.version}
                  </p>
                </div>
                <StatusBadge status="draft" label="Manifest staged" />
              </article>
            ))}
          </div>

          <div className="info-block">
            <h3>Host context</h3>
            <p>
              {embedRuntimeSnapshot.applicationId} · {embedRuntimeSnapshot.teamId}
            </p>
          </div>
        </Card>
      </div>
    </section>
  );
}
