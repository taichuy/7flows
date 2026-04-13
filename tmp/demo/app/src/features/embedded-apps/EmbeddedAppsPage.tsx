import { useState } from 'react';

import { Card, Descriptions, Drawer, Table } from 'antd';

import { subsystems } from '../demo-data';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

export function EmbeddedAppsPage() {
  const [activeSubsystemId, setActiveSubsystemId] = useState<string | null>(null);
  const activeSubsystem = activeSubsystemId
    ? subsystems.find((item) => item.id === activeSubsystemId) ?? null
    : null;

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="子系统管理"
        title="子系统"
        description="这里集中查看所有已接入入口的挂载路由、访问上下文和待办事项，确认每个业务前台都落在统一宿主边界内。"
      />

      <Card title="已接入子系统" className="demo-card">
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
                  aria-label={`查看 ${value} 详情`}
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
              render: (_, record) => <StatusPill status={record.status}>{record.statusLabel}</StatusPill>
            }
          ]}
        />
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
                  children: activeSubsystem.mountMode
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
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
