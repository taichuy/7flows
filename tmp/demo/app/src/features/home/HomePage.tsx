import { useMemo, useState } from 'react';

import { Link } from '@tanstack/react-router';
import { Card, Descriptions, Drawer, List, Space, Typography } from 'antd';

import {
  consoleEntries,
  demoRuns,
  governanceNotes,
  homeActionQueue,
  workbenchMetrics,
  workspaceSnapshot
} from '../demo-data';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

type HomeDrawerState =
  | {
      kind: 'queue';
      id: string;
    }
  | {
      kind: 'run';
      id: string;
    }
  | null;

export function HomePage() {
  const [activePanel, setActivePanel] = useState<HomeDrawerState>(null);

  const activeQueueItem = useMemo(
    () =>
      activePanel?.kind === 'queue'
        ? homeActionQueue.find((item) => item.id === activePanel.id) ?? null
        : null,
    [activePanel]
  );

  const activeRun = useMemo(
    () =>
      activePanel?.kind === 'run'
        ? demoRuns.find((item) => item.id === activePanel.id) ?? null
        : null,
    [activePanel]
  );

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="控制台概览"
        title="工作台"
        description="在这里先看平台健康、行动队列和最近运行，再继续进入流程编排、子系统接入与工具台。"
        actions={
          <>
            <Link to="/studio" className="demo-cta-link demo-cta-link-primary">
              进入流程编排
            </Link>
            <Link to="/subsystems" className="demo-cta-link">
              查看子系统接入
            </Link>
            <Link to="/tools" className="demo-cta-link">
              查看工具台
            </Link>
          </>
        }
        aside={
          <Card size="small" title="当前工作区" className="shell-summary-card">
            <Descriptions
              column={1}
              colon={false}
              items={workspaceSnapshot.map((item) => ({
                key: item.key,
                label: item.label,
                children: item.value
              }))}
            />
          </Card>
        }
      />

      <div className="metric-grid">
        {workbenchMetrics.map((item) => (
          <Card key={item.label} className="metric-card">
            <StatusPill status={item.status}>{item.label}</StatusPill>
            <Typography.Title level={2}>{item.value}</Typography.Title>
            <Typography.Paragraph>{item.note}</Typography.Paragraph>
          </Card>
        ))}
      </div>

      <div className="demo-grid-columns">
        <div className="demo-two-column section-stack">
          <Card title="行动队列" className="demo-card">
            <div className="run-list">
              {homeActionQueue.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="run-row-button"
                  aria-label={`查看 ${item.title}`}
                  onClick={() => setActivePanel({ kind: 'queue', id: item.id })}
                >
                  <div className="run-row-title">
                    <span>{item.title}</span>
                    <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
                  </div>
                  <Typography.Paragraph className="run-row-note">{item.summary}</Typography.Paragraph>
                  <div className="row-meta-line">
                    <span>{item.area}</span>
                    <span>{item.owner}</span>
                    <span>{item.dueAt}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card title="常用入口" className="demo-card">
            <div className="entry-grid">
              {consoleEntries.map((entry) => (
                <Link key={entry.title} to={entry.href} className="entry-link-card">
                  <div className="entry-link-header">
                    <Typography.Text strong>{entry.title}</Typography.Text>
                    <StatusPill status={entry.status}>{entry.badge}</StatusPill>
                  </div>
                  <Typography.Paragraph>{entry.description}</Typography.Paragraph>
                  <Typography.Text className="entry-link-note">{entry.note}</Typography.Text>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <div className="demo-two-column section-stack">
          <Card title="最近运行" className="demo-card">
            <div className="run-list">
              {demoRuns.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="run-row-button"
                  aria-label={`查看 ${item.flow}`}
                  onClick={() => setActivePanel({ kind: 'run', id: item.id })}
                >
                  <div className="run-row-title">
                    <span>{item.flow}</span>
                    <StatusPill status={item.status}>{item.summary}</StatusPill>
                  </div>
                  <Typography.Paragraph className="run-row-note">
                    {item.id} · {item.owner} · {item.startedAt}
                  </Typography.Paragraph>
                </button>
              ))}
            </div>
          </Card>

          <Card title="治理提醒" className="demo-card">
            <List
              dataSource={governanceNotes}
              renderItem={(item) => (
                <List.Item>
                  <div className="demo-list-block">
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <Typography.Paragraph>{item.detail}</Typography.Paragraph>
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </div>
      </div>

      <Drawer
        open={Boolean(activeQueueItem || activeRun)}
        title={activeQueueItem?.title ?? activeRun?.flow}
        width={440}
        onClose={() => setActivePanel(null)}
      >
        {activeQueueItem ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Typography.Paragraph>{activeQueueItem.detail}</Typography.Paragraph>
            <Descriptions
              column={1}
              colon={false}
              items={[
                {
                  key: 'area',
                  label: '治理域',
                  children: activeQueueItem.area
                },
                {
                  key: 'owner',
                  label: '负责人',
                  children: activeQueueItem.owner
                },
                {
                  key: 'dueAt',
                  label: '处理时点',
                  children: activeQueueItem.dueAt
                },
                {
                  key: 'nextAction',
                  label: '下一步',
                  children: activeQueueItem.nextAction
                }
              ]}
            />
            <Card size="small" title="建议处理顺序" className="drawer-timeline-card">
              <List
                dataSource={activeQueueItem.followUps}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
            <Link to={activeQueueItem.href} className="demo-cta-link demo-cta-link-primary">
              前往对应页面
            </Link>
          </Space>
        ) : null}

        {activeRun ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Typography.Paragraph>{activeRun.detail}</Typography.Paragraph>
            <Descriptions
              column={1}
              colon={false}
              items={[
                {
                  key: 'flow',
                  label: '流程',
                  children: activeRun.flow
                },
                {
                  key: 'owner',
                  label: '负责人',
                  children: activeRun.owner
                },
                {
                  key: 'startedAt',
                  label: '开始时间',
                  children: activeRun.startedAt
                }
              ]}
            />
            <Card size="small" title="事件时间线" className="drawer-timeline-card">
              <List
                dataSource={activeRun.events}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
