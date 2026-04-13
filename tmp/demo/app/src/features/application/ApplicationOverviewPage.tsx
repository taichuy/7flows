import { Link } from '@tanstack/react-router';
import { Card, Descriptions, List, Typography } from 'antd';

import {
  currentApplicationWorkspace,
  governanceNotes,
  studioReleaseItems,
  workspaceApplications
} from '../demo-data';
import { ApplicationWorkspacePanel } from '../../shared/ui/ApplicationWorkspacePanel';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

const currentApplication = workspaceApplications[0]!;
const studioOverviewHref: string = '/studio?focus=release-gateway&track=checkpoint';

export function ApplicationOverviewPage() {
  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="应用交付容器"
        title="应用概览"
        description="应用是 1Flowse 的稳定交付容器。先确认这次交付的负责人、发布状态和治理焦点，再进入流程编排继续推进当前 Flow。"
        actions={
          <Link to={studioOverviewHref} className="demo-cta-link demo-cta-link-primary">
            进入编排
          </Link>
        }
      />

      <ApplicationWorkspacePanel activeKeys={['overview']} />

      <div className="demo-grid-columns">
        <Card title="基本信息" className="demo-card">
          <Descriptions
            column={1}
            colon={false}
            items={[
              {
                key: 'application',
                label: '应用名称',
                children: currentApplication.name
              },
              {
                key: 'owner',
                label: '主负责人',
                children: currentApplication.owner
              },
              {
                key: 'team',
                label: '当前工作区',
                children: currentApplicationWorkspace.team
              },
              {
                key: 'flow',
                label: '当前 Flow',
                children: currentApplicationWorkspace.currentFlow
              },
              {
                key: 'description',
                label: '应用说明',
                children: currentApplication.description
              }
            ]}
          />
        </Card>

        <Card title="发布状态" className="demo-card">
          <div className="focus-summary-head">
            <div className="demo-list-block">
              <Typography.Text strong>{currentApplicationWorkspace.name}</Typography.Text>
              <Typography.Paragraph className="card-paragraph">
                当前应用仍处于发布治理窗口内，必须先确认 revision、回写窗口和状态模型没有漂移，再继续进入 Flow 处理。
              </Typography.Paragraph>
            </div>
            <StatusPill status={currentApplicationWorkspace.status}>
              {currentApplicationWorkspace.statusLabel}
            </StatusPill>
          </div>

          <Descriptions
            column={1}
            colon={false}
            items={[
              {
                key: 'endpoint',
                label: '发布入口',
                children: currentApplicationWorkspace.endpoint
              },
              {
                key: 'revision',
                label: '最近 revision',
                children: currentApplicationWorkspace.lastRevision
              },
              {
                key: 'stateModel',
                label: '状态模型',
                children: currentApplicationWorkspace.stateModel
              }
            ]}
          />
        </Card>
      </div>

      <div className="demo-grid-columns">
        <Card title="当前治理焦点" className="demo-card">
          <List
            dataSource={governanceNotes}
            renderItem={(item) => (
              <List.Item>
                <div className="overview-focus-item">
                  <div className="focus-summary-head">
                    <Typography.Text strong>{item.title}</Typography.Text>
                    <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
                  </div>
                  <Typography.Paragraph className="card-paragraph">
                    {item.detail}
                  </Typography.Paragraph>
                  <Typography.Text className="entry-link-note">{item.note}</Typography.Text>
                </div>
              </List.Item>
            )}
          />
        </Card>

        <Card title="交付边界" className="demo-card">
          <div className="studio-evidence-list">
            {studioReleaseItems.map((item) => (
              <div key={item.key} className="studio-evidence-item">
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
      </div>
    </div>
  );
}
