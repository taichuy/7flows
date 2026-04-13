import { useEffect, useMemo, useState } from 'react';

import { Link, useRouterState } from '@tanstack/react-router';
import { Card, Descriptions, Drawer, Table, Typography } from 'antd';

import { subsystems, subsystemFocusItems } from '../demo-data';
import { ApplicationWorkspacePanel } from '../../shared/ui/ApplicationWorkspacePanel';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

export function EmbeddedAppsPage() {
  const locationSearch = useRouterState({
    select: (state) => state.location.search
  });
  const searchParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const routeSubsystemId = searchParams.get('subsystem');
  const focusKey = searchParams.get('focus') ?? '';
  const activeFocus = subsystemFocusItems[focusKey] ?? null;
  const [activeSubsystemId, setActiveSubsystemId] = useState<string | null>(routeSubsystemId);

  useEffect(() => {
    setActiveSubsystemId(routeSubsystemId);
  }, [routeSubsystemId]);

  const activeSubsystem = activeSubsystemId
    ? subsystems.find((item) => item.id === activeSubsystemId) ?? null
    : null;
  const drawerAction =
    activeFocus && activeSubsystem?.id === activeFocus.subsystemId
      ? {
          label: activeFocus.actionLabel,
          href: activeFocus.actionHref
        }
      : activeSubsystem
        ? {
            label: activeSubsystem.actionLabel,
            href: activeSubsystem.actionHref
          }
        : null;

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="子系统管理"
        title="子系统"
        description="这里集中查看所有已接入入口的挂载路由、访问上下文和待办事项，确认每个业务前台都落在统一宿主边界内。"
      />

      <ApplicationWorkspacePanel activeKeys={['subsystems']} />

      {activeFocus ? (
        <Card title="当前同步关注" className="demo-card focus-summary-card">
          <div className="focus-summary-head">
            <div className="demo-list-block">
              <Typography.Text strong>{activeFocus.title}</Typography.Text>
              <Typography.Paragraph className="card-paragraph">
                {activeFocus.detail}
              </Typography.Paragraph>
              <Typography.Text className="entry-link-note">{activeFocus.note}</Typography.Text>
            </div>
            <StatusPill status={activeFocus.status}>{activeFocus.statusLabel}</StatusPill>
          </div>
          <Link to={activeFocus.actionHref} className="demo-cta-link">
            {activeFocus.actionLabel}
          </Link>
        </Card>
      ) : null}

      <Card title="已接入子系统" className="demo-card">
        <div className="subsystem-table-shell">
          <Table
            rowKey="id"
            pagination={false}
            dataSource={subsystems}
            columns={[
              {
                title: '应用',
                dataIndex: 'name',
                key: 'name',
                render: (value: string, record) => (
                  <button
                    type="button"
                    className="subsystem-trigger"
                    aria-label={`从表格查看 ${value} 详情`}
                    onClick={() => setActiveSubsystemId(record.id)}
                  >
                    <span className="subsystem-trigger-title">{value}</span>
                    <span className="subsystem-trigger-summary">{record.summary}</span>
                  </button>
                )
              },
              {
                title: '负责人',
                dataIndex: 'owner',
                key: 'owner'
              },
              {
                title: '挂载路径',
                dataIndex: 'routePrefix',
                key: 'routePrefix'
              },
              {
                title: '版本',
                dataIndex: 'version',
                key: 'version'
              },
              {
                title: '状态',
                dataIndex: 'status',
                key: 'status',
                render: (_, record) => (
                  <StatusPill status={record.status}>{record.statusLabel}</StatusPill>
                )
              }
            ]}
          />
        </div>

        <section className="subsystem-card-region" aria-label="子系统卡片列表">
          {subsystems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="subsystem-mobile-card"
              aria-label={`查看 ${item.name} 详情`}
              onClick={() => setActiveSubsystemId(item.id)}
            >
              <div className="subsystem-mobile-card-head">
                <div className="subsystem-mobile-card-title">
                  <span>{item.name}</span>
                  <span className="subsystem-mobile-card-owner">{item.owner}</span>
                </div>
                <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
              </div>
              <p className="subsystem-mobile-card-summary">{item.summary}</p>
              <div className="subsystem-mobile-card-meta">
                <span>{item.routePrefix}</span>
                <span>{item.version}</span>
                <span>{item.mountMode}</span>
              </div>
            </button>
          ))}
        </section>
      </Card>

      <Drawer
        open={Boolean(activeSubsystem)}
        title={activeSubsystem?.name}
        width={420}
        onClose={() => setActiveSubsystemId(null)}
      >
        {activeSubsystem ? (
          <div className="drawer-stack">
            <Descriptions
              column={1}
              colon={false}
              items={[
                {
                  key: 'owner',
                  label: '负责人',
                  children: activeSubsystem.owner
                },
                {
                  key: 'route',
                  label: '挂载路径',
                  children: activeSubsystem.routePrefix
                },
                {
                  key: 'version',
                  label: '版本',
                  children: activeSubsystem.version
                },
                {
                  key: 'mode',
                  label: '挂载方式',
                  children: `${activeSubsystem.mountMode}（${activeSubsystem.mountModeNote}）`
                },
                {
                  key: 'auth',
                  label: '访问上下文',
                  children: activeSubsystem.authScope
                },
                {
                  key: 'updated',
                  label: '最近更新',
                  children: activeSubsystem.lastUpdated
                }
              ]}
            />

            <Card size="small" title="待办事项" className="drawer-timeline-card">
              <ul className="drawer-list">
                {activeSubsystem.pendingActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>

            <Link
              to={drawerAction?.href ?? activeSubsystem.actionHref}
              className="demo-cta-link demo-cta-link-primary"
            >
              {drawerAction?.label ?? activeSubsystem.actionLabel}
            </Link>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
