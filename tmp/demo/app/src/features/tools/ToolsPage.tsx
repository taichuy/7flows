import { useMemo, useState } from 'react';

import { Card, Descriptions, Drawer, Input, List, Segmented, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { apiSurface, monitoringSignals, toolFollowUps, toolIncidents, type ToolIncident } from '../demo-data';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

type IncidentFilterKey = 'all' | 'waiting' | 'running' | 'failed';

const filterOptions: Array<{ label: string; value: IncidentFilterKey }> = [
  {
    label: '全部',
    value: 'all'
  },
  {
    label: '待确认',
    value: 'waiting'
  },
  {
    label: '处理中',
    value: 'running'
  },
  {
    label: '已阻塞',
    value: 'failed'
  }
];

export function ToolsPage() {
  const [activeFilter, setActiveFilter] = useState<IncidentFilterKey>('all');
  const [searchValue, setSearchValue] = useState('');
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);

  const filteredIncidents = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();

    return toolIncidents.filter((item) => {
      const matchesFilter = activeFilter === 'all' ? true : item.status === activeFilter;
      const matchesKeyword =
        keyword.length === 0
          ? true
          : [item.title, item.owner, item.domain, item.relatedSurface]
              .join(' ')
              .toLowerCase()
              .includes(keyword);

      return matchesFilter && matchesKeyword;
    });
  }, [activeFilter, searchValue]);

  const incidentColumns = useMemo<ColumnsType<ToolIncident>>(
    () => [
      {
        title: '事件',
        dataIndex: 'title',
        key: 'title',
        render: (value: string, record) => (
          <button
            type="button"
            className="incident-trigger"
            aria-label={`查看 ${value}`}
            onClick={() => setActiveIncidentId(record.id)}
          >
            <span className="incident-trigger-title">{value}</span>
            <span className="incident-trigger-summary">{record.summary}</span>
          </button>
        )
      },
      {
        title: '治理域',
        dataIndex: 'domain',
        key: 'domain',
        responsive: ['md']
      },
      {
        title: '负责人',
        dataIndex: 'owner',
        key: 'owner'
      },
      {
        title: '最近更新',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        responsive: ['lg']
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        render: (_, record) => <StatusPill status={record.status}>{record.statusLabel}</StatusPill>
      }
    ],
    []
  );

  const activeIncident = activeIncidentId
    ? toolIncidents.find((item) => item.id === activeIncidentId) ?? null
    : null;

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="工具台总览"
        title="工具"
        description="工具台统一承接事件收口、接口治理和运行告警，帮助平台团队在一个页面里明确“先处理什么、为什么处理、去哪里处理”。"
      />

      <div className="metric-grid">
        {monitoringSignals.map((item) => (
          <Card key={item.label} className="metric-card">
            <StatusPill status={item.status}>{item.label}</StatusPill>
            <Typography.Title level={2}>{item.value}</Typography.Title>
            <Typography.Paragraph>{item.note}</Typography.Paragraph>
          </Card>
        ))}
      </div>

      <div className="demo-grid-columns tools-grid">
        <div className="demo-two-column">
          <Card title="事件队列" className="demo-card">
            <div className="tool-filter-bar">
              <Segmented
                options={filterOptions}
                value={activeFilter}
                onChange={(value) => setActiveFilter(value as IncidentFilterKey)}
              />
              <Input
                value={searchValue}
                placeholder="搜索事件或负责人"
                allowClear
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </div>

            <Table
              rowKey="id"
              pagination={false}
              dataSource={filteredIncidents}
              columns={incidentColumns}
              locale={{ emptyText: '当前筛选下没有需要收口的事件。' }}
            />
          </Card>
        </div>

        <div className="demo-two-column section-stack">
          <Card title="接口面摘要" className="demo-card">
            <div className="api-surface-list">
              {apiSurface.map((item) => (
                <div key={item.key} className="api-surface-item">
                  <div className="api-surface-head">
                    <span className="api-surface-method">{item.method}</span>
                    <Typography.Text strong>{item.path}</Typography.Text>
                  </div>
                  <Typography.Paragraph>{item.note}</Typography.Paragraph>
                  <Typography.Text className="entry-link-note">
                    暴露级别：{item.exposure}
                  </Typography.Text>
                </div>
              ))}
            </div>
          </Card>

          <Card title="本轮收口决策" className="demo-card">
            <List
              dataSource={toolFollowUps}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Paragraph>{item}</Typography.Paragraph>
                </List.Item>
              )}
            />
          </Card>
        </div>
      </div>

      <Drawer
        open={Boolean(activeIncident)}
        title={activeIncident?.title}
        width={440}
        onClose={() => setActiveIncidentId(null)}
      >
        {activeIncident ? (
          <div className="drawer-stack">
            <Typography.Paragraph>{activeIncident.detail}</Typography.Paragraph>

            <Descriptions
              column={1}
              colon={false}
              items={[
                {
                  key: 'domain',
                  label: '治理域',
                  children: activeIncident.domain
                },
                {
                  key: 'owner',
                  label: '负责人',
                  children: activeIncident.owner
                },
                {
                  key: 'status',
                  label: '状态',
                  children: <StatusPill status={activeIncident.status}>{activeIncident.statusLabel}</StatusPill>
                },
                {
                  key: 'severity',
                  label: '优先级',
                  children: activeIncident.severity
                },
                {
                  key: 'surface',
                  label: '影响面',
                  children: activeIncident.relatedSurface
                },
                {
                  key: 'endpoint',
                  label: '相关接口',
                  children: activeIncident.relatedEndpoint
                },
                {
                  key: 'nextAction',
                  label: '下一步',
                  children: activeIncident.nextAction
                }
              ]}
            />

            <Card size="small" title="建议处理顺序" className="drawer-timeline-card">
              <List
                dataSource={activeIncident.playbook}
                renderItem={(item) => <List.Item>{item}</List.Item>}
              />
            </Card>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
