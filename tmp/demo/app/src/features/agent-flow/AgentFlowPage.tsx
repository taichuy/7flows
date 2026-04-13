import { useState } from 'react';

import { Button, Card, Col, Descriptions, Row, Space, Typography } from 'antd';

import { demoRuns, studioNodes } from '../demo-data';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

export function AgentFlowPage() {
  const [activeNodeId, setActiveNodeId] = useState(studioNodes[0]?.id ?? null);
  const activeNode = studioNodes.find((item) => item.id === activeNodeId) ?? studioNodes[0];

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="执行工作区"
        title="流程编排"
        description="编排页保持画布与 inspector 的固定组合，用于继续推进当前流程，而不是承担顶层导航职责。"
      />

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={15}>
          <Card title="画布概览" className="demo-card studio-surface-card">
            <div className="studio-surface">
              {studioNodes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`studio-node ${item.id === activeNode.id ? 'is-active' : ''}`}
                  onClick={() => setActiveNodeId(item.id)}
                >
                  <span className="studio-node-kind">{item.kind}</span>
                  <span className="studio-node-name">{item.name}</span>
                  <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
                </button>
              ))}
            </div>
            <div className="studio-lane">
              {demoRuns.slice(0, 2).map((item) => (
                <div key={item.id} className="studio-lane-row">
                  <span>{item.id}</span>
                  <span>{item.flow}</span>
                  <StatusPill status={item.status}>{item.summary}</StatusPill>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card title="当前聚焦节点" className="demo-card studio-inspector-card">
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
              <Button type="primary">继续发布检查</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
