import { Link } from '@tanstack/react-router';
import { Typography } from 'antd';

import {
  applicationWorkspaceLinks,
  currentApplicationWorkspace
} from '../../features/demo-data';
import { StatusPill } from './StatusPill';

interface ApplicationWorkspacePanelProps {
  activeKeys: string[];
}

export function ApplicationWorkspacePanel({
  activeKeys
}: ApplicationWorkspacePanelProps) {
  const statusBadge = {
    running: '处理中',
    waiting: '待复核',
    failed: '阻塞中',
    healthy: '已就绪',
    draft: '草稿',
    selected: '当前页'
  } as const;

  return (
    <section className="application-workspace-panel" role="region" aria-label="当前应用工作区">
      <div className="application-workspace-main">
        <div className="application-workspace-header">
          <div className="demo-list-block">
            <span className="demo-kicker">应用工作区</span>
            <Typography.Title level={4}>{currentApplicationWorkspace.name}</Typography.Title>
            <Typography.Paragraph className="card-paragraph">
              {currentApplicationWorkspace.description}
            </Typography.Paragraph>
            <Typography.Text className="entry-link-note application-workspace-context">
              <span>{currentApplicationWorkspace.team}</span>
              <span aria-hidden="true">·</span>
              <span>{currentApplicationWorkspace.owner}</span>
            </Typography.Text>
          </div>
          <StatusPill status={currentApplicationWorkspace.status}>
            {currentApplicationWorkspace.statusLabel}
          </StatusPill>
        </div>

        <div className="application-workspace-summary">
          <div className="application-workspace-metric">
            <span className="application-workspace-metric-label">当前 Flow</span>
            <strong>{currentApplicationWorkspace.currentFlow}</strong>
          </div>
          <div className="application-workspace-metric">
            <span className="application-workspace-metric-label">发布入口</span>
            <strong>{currentApplicationWorkspace.endpoint}</strong>
          </div>
          <div className="application-workspace-metric">
            <span className="application-workspace-metric-label">状态模型</span>
            <strong>{currentApplicationWorkspace.stateModel}</strong>
          </div>
          <div className="application-workspace-metric">
            <span className="application-workspace-metric-label">最近 revision</span>
            <strong>{currentApplicationWorkspace.lastRevision}</strong>
          </div>
        </div>
      </div>

      <nav className="application-workspace-links" aria-label="应用工作区导航">
        {applicationWorkspaceLinks.map((item) => (
          <Link
            key={item.key}
            to={item.href}
            aria-label={item.label}
            className={`application-workspace-link ${
              activeKeys.includes(item.key) ? 'is-active' : ''
            }`}
          >
            <Typography.Text strong>{item.label}</Typography.Text>
            <StatusPill status={item.status}>{statusBadge[item.status]}</StatusPill>
          </Link>
        ))}
      </nav>
    </section>
  );
}
