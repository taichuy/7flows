import { useMemo, useState } from 'react';

import { Link } from '@tanstack/react-router';
import { Card, Descriptions, Drawer, List, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import {
  consoleEntries,
  currentApplicationWorkspace,
  demoRuns,
  governanceNotes,
  homeActionQueue,
  workbenchMetrics,
  workspaceApplications,
  workspaceSnapshot
} from '../demo-data';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

type HomeDrawerState =
  | {
      kind: 'app';
      id: string;
    }
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
  const studioGovernanceHref: string =
    '/studio?focus=release-gateway&track=callback&incident=incident-webhook';
  const toolIncidentHref: string = '/tools?incident=incident-webhook';
  const [activePanel, setActivePanel] = useState<HomeDrawerState>(null);

  const activeApplication = useMemo(
    () =>
      activePanel?.kind === 'app'
        ? workspaceApplications.find((item) => item.id === activePanel.id) ?? null
        : null,
    [activePanel]
  );

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

  const applicationColumns = useMemo<ColumnsType<(typeof workspaceApplications)[number]>>(
    () => [
      {
        title: '应用',
        dataIndex: 'name',
        key: 'name',
        render: (value: string, record) => (
          <button
            type="button"
            className="workspace-app-trigger"
            aria-label={`从表格查看 ${value} 应用详情`}
            onClick={() => setActivePanel({ kind: 'app', id: record.id })}
          >
            <span className="workspace-app-trigger-title">{value}</span>
            <span className="workspace-app-trigger-summary">{record.description}</span>
          </button>
        )
      },
      {
        title: '主负责人',
        dataIndex: 'owner',
        key: 'owner',
        responsive: ['md']
      },
      {
        title: '最近更新',
        dataIndex: 'lastUpdated',
        key: 'lastUpdated',
        responsive: ['lg']
      },
      {
        title: '最近访问',
        dataIndex: 'lastVisited',
        key: 'lastVisited',
        responsive: ['lg']
      },
      {
        title: '发布状态',
        dataIndex: 'releaseStatus',
        key: 'releaseStatus',
        render: (_, record) => (
          <StatusPill status={record.releaseStatus}>{record.releaseLabel}</StatusPill>
        )
      }
    ],
    []
  );

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="控制台概览"
        title="工作台"
        description="在这里先看平台健康、行动队列和最近运行，再继续进入流程编排、子系统接入与工具台。"
        actions={
          <>
            <Link to="/application" className="demo-cta-link demo-cta-link-primary">
              进入当前应用
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

      <Card title="当前交付应用" className="demo-card current-application-card">
        <div className="application-workspace-header">
          <div className="demo-list-block">
            <Typography.Text strong>{currentApplicationWorkspace.name}</Typography.Text>
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

        <div className="current-application-actions">
          <Link to="/application" className="demo-cta-link demo-cta-link-primary">
            进入应用概览
          </Link>
          <Link to={studioGovernanceHref} className="demo-cta-link">
            继续发布闭环
          </Link>
          <Link to={toolIncidentHref} className="demo-cta-link">
            查看阻塞事件
          </Link>
        </div>
      </Card>

      <Card title="应用列表" className="demo-card">
        <div className="workspace-app-table-shell">
          <Table
            rowKey="id"
            pagination={false}
            dataSource={workspaceApplications}
            columns={applicationColumns}
          />
        </div>

        <section className="workspace-app-card-region" aria-label="应用卡片列表">
          {workspaceApplications.map((item) => (
            <button
              key={item.id}
              type="button"
              className="workspace-app-mobile-card"
              aria-label={`查看 ${item.name} 应用详情`}
              onClick={() => setActivePanel({ kind: 'app', id: item.id })}
            >
              <div className="workspace-app-mobile-card-head">
                <div className="workspace-app-mobile-card-title">
                  <span>{item.name}</span>
                  <span className="workspace-app-mobile-card-owner">{item.owner}</span>
                </div>
                <StatusPill status={item.releaseStatus}>{item.releaseLabel}</StatusPill>
              </div>
              <p className="workspace-app-mobile-card-summary">{item.description}</p>
              <div className="workspace-app-mobile-card-meta">
                <span>{item.currentFlow}</span>
                <span>{item.revision}</span>
                <span>{item.lastVisited}</span>
              </div>
            </button>
          ))}
        </section>
      </Card>

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
            <div className="entry-grid">
              {governanceNotes.map((item) => (
                <Link key={item.id} to={item.href} className="entry-link-card">
                  <div className="entry-link-header">
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
                  </div>
                  <Typography.Paragraph>{item.detail}</Typography.Paragraph>
                  <Typography.Text className="entry-link-note">{item.note}</Typography.Text>
                  <Typography.Text className="entry-link-note">{item.actionLabel}</Typography.Text>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Drawer
        open={Boolean(activeApplication || activeQueueItem || activeRun)}
        title={activeApplication?.name ?? activeQueueItem?.title ?? activeRun?.flow}
        width={440}
        onClose={() => setActivePanel(null)}
      >
        {activeApplication ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Typography.Paragraph>{activeApplication.description}</Typography.Paragraph>
            <Descriptions
              column={1}
              colon={false}
              items={[
                {
                  key: 'owner',
                  label: '主负责人',
                  children: activeApplication.owner
                },
                {
                  key: 'flow',
                  label: '当前 Flow',
                  children: activeApplication.currentFlow
                },
                {
                  key: 'revision',
                  label: '最近 revision',
                  children: activeApplication.revision
                },
                {
                  key: 'endpoint',
                  label: '发布入口',
                  children: activeApplication.endpoint
                },
                {
                  key: 'state-model',
                  label: '状态模型',
                  children: activeApplication.stateModel
                },
                {
                  key: 'workspace',
                  label: '当前工作区',
                  children: currentApplicationWorkspace.team
                }
              ]}
            />
            <Card size="small" title="本轮治理焦点" className="drawer-timeline-card">
              <List
                dataSource={activeApplication.tags}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
            <Link to={activeApplication.nextActionHref} className="demo-cta-link demo-cta-link-primary">
              {activeApplication.nextActionLabel}
            </Link>
          </Space>
        ) : null}

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
              {activeQueueItem.actionLabel}
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
