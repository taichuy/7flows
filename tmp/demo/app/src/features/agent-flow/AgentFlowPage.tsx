import { useEffect, useMemo, useState } from 'react';

import { Link, useRouterState } from '@tanstack/react-router';
import { Card, Col, Descriptions, List, Row, Space, Typography } from 'antd';

import {
  studioActions,
  studioFocusItems,
  studioNodes,
  studioOverview,
  studioReleaseItems,
  studioRuntimeTrack,
  studioStateItems
} from '../demo-data';
import { ApplicationWorkspacePanel } from '../../shared/ui/ApplicationWorkspacePanel';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

export function AgentFlowPage() {
  const locationSearch = useRouterState({
    select: (state) => state.location.search
  });
  const searchParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const routeFocusNode = searchParams.get('focus');
  const routeIncident = searchParams.get('incident') ?? 'default';
  const activeFocus = studioFocusItems[routeIncident] ?? studioFocusItems.default;
  const highlightedRuntimeKey = searchParams.get('track') ?? activeFocus.runtimeKey;
  const highlightedReleaseKey = activeFocus.releaseKey;
  const [activeNodeId, setActiveNodeId] = useState(() =>
    studioNodes.some((item) => item.id === routeFocusNode) ? routeFocusNode : (studioNodes[0]?.id ?? null)
  );

  useEffect(() => {
    if (routeFocusNode && studioNodes.some((item) => item.id === routeFocusNode)) {
      setActiveNodeId(routeFocusNode);
    }
  }, [routeFocusNode]);

  const activeNode = useMemo(
    () => studioNodes.find((item) => item.id === activeNodeId) ?? studioNodes[0],
    [activeNodeId]
  );

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="工作流主线"
        title="流程编排"
        description="先看执行链路，再确认发布检查、恢复点和状态记忆是否闭环。这里展示的是当前应用的真实交付主线。"
      />

      <ApplicationWorkspacePanel activeKeys={['studio']} />

      <section className="studio-overview-strip" aria-label="当前编排摘要">
        {studioOverview.map((item) => (
          <div key={item.label} className="studio-overview-item">
            <StatusPill status={item.status}>{item.label}</StatusPill>
            <strong className="studio-overview-value">{item.value}</strong>
            <Typography.Paragraph>{item.note}</Typography.Paragraph>
          </div>
        ))}
      </section>

      <Row gutter={[18, 18]} align="top">
        <Col xs={24} xl={15}>
          <div className="section-stack">
            <Card title="执行链路" className="demo-card studio-surface-card">
              <div className="studio-flow-grid">
                {studioNodes.map((item, index) => (
                  <div key={item.id} className="studio-flow-step">
                    <button
                      type="button"
                      className={`studio-node ${item.id === activeNode.id ? 'is-active' : ''}`}
                      onClick={() => setActiveNodeId(item.id)}
                    >
                      <span className="studio-node-kind">
                        {index + 1}. {item.kind}
                      </span>
                      <span className="studio-node-name">{item.name}</span>
                      <span className="studio-node-description">{item.description}</span>
                      <span className="studio-node-meta">
                        <span>{item.owner}</span>
                        <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
                      </span>
                    </button>
                    {index < studioNodes.length - 1 ? (
                      <span className="studio-flow-connector" aria-hidden="true" />
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card title="运行轨道" className="demo-card studio-runtime-card">
              <div className="studio-runtime-list">
                {studioRuntimeTrack.map((item) => (
                  <div
                    key={item.key}
                    className={`studio-runtime-item ${
                      item.key === highlightedRuntimeKey ? 'is-focused' : ''
                    }`}
                  >
                    <div className="studio-runtime-head">
                      <div>
                        <Typography.Text strong>{item.title}</Typography.Text>
                        <Typography.Paragraph className="card-paragraph">
                          {item.note}
                        </Typography.Paragraph>
                      </div>
                      <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
                    </div>
                    <div className="row-meta-line">
                      <span>{item.time}</span>
                      <span>运行时恢复点</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Col>

        <Col xs={24} xl={9}>
          <div className="section-stack">
            <Card title="当前治理链" className="demo-card focus-summary-card">
              <div className="focus-summary-head">
                <div className="demo-list-block">
                  <Typography.Text strong>{activeFocus.title}</Typography.Text>
                  <Typography.Paragraph className="card-paragraph">
                    {activeFocus.detail}
                  </Typography.Paragraph>
                </div>
                <StatusPill status={activeFocus.status}>{activeFocus.statusLabel}</StatusPill>
              </div>
              <Descriptions
                column={1}
                colon={false}
                items={[
                  {
                    key: 'origin',
                    label: '来源',
                    children: activeFocus.origin
                  },
                  {
                    key: 'checkpoint',
                    label: '当前检查点',
                    children: activeFocus.checkpoint
                  },
                  {
                    key: 'nextStep',
                    label: '下一步',
                    children: activeFocus.nextStep
                  }
                ]}
              />
              <Link to={activeFocus.actionHref} className="demo-cta-link demo-cta-link-primary">
                {activeFocus.actionLabel}
              </Link>
            </Card>

            <Card
              title="当前聚焦节点"
              className="demo-card studio-inspector-card"
              role="region"
              aria-label="当前聚焦节点"
            >
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Typography.Title level={4}>{activeNode.name}</Typography.Title>
                  <Typography.Paragraph>{activeNode.description}</Typography.Paragraph>
                </div>
                <Descriptions
                  column={1}
                  colon={false}
                  items={[
                    {
                      key: 'owner',
                      label: '负责人',
                      children: activeNode.owner
                    },
                    {
                      key: 'kind',
                      label: '节点类型',
                      children: activeNode.kind
                    },
                    {
                      key: 'status',
                      label: '状态',
                      children: <StatusPill status={activeNode.status}>{activeNode.statusLabel}</StatusPill>
                    }
                  ]}
                />
                <Card size="small" title="输出摘要">
                  <p className="card-paragraph">{activeNode.output}</p>
                </Card>
                <Link to="/tools" className="demo-cta-link demo-cta-link-primary">
                  打开运行事件
                </Link>
              </Space>
            </Card>

            <Card title="发布检查" className="demo-card">
              <div className="studio-evidence-list">
                {studioReleaseItems.map((item) => (
                  <div
                    key={item.key}
                    className={`studio-evidence-item ${
                      item.key === highlightedReleaseKey ? 'is-focused' : ''
                    }`}
                  >
                    <div className="studio-evidence-head">
                      <Typography.Text strong>{item.label}</Typography.Text>
                      <StatusPill status={item.status}>{item.value}</StatusPill>
                    </div>
                    <Typography.Paragraph className="card-paragraph">
                      {item.note}
                    </Typography.Paragraph>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="状态记忆" className="demo-card">
              <List
                dataSource={studioStateItems}
                renderItem={(item) => (
                  <List.Item>
                    <div className="demo-list-block">
                      <Typography.Text strong>{item.label}</Typography.Text>
                      <Typography.Paragraph>{item.value}</Typography.Paragraph>
                      <Typography.Text className="entry-link-note">{item.note}</Typography.Text>
                    </div>
                  </List.Item>
                )}
              />
            </Card>

            <Card title="关联入口" className="demo-card">
              <div className="entry-grid">
                {studioActions.map((item) => (
                  <Link key={item.key} to={item.href} className="entry-link-card">
                    <div className="entry-link-header">
                      <Typography.Text strong>{item.title}</Typography.Text>
                      <StatusPill status={item.status}>{item.badge}</StatusPill>
                    </div>
                    <Typography.Paragraph>{item.description}</Typography.Paragraph>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </Col>
      </Row>
    </div>
  );
}
