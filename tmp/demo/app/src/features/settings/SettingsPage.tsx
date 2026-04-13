import { useEffect, useMemo, useState } from 'react';

import { Link, useRouterState } from '@tanstack/react-router';
import { Card, Col, Descriptions, List, Menu, Row, Table, Typography } from 'antd';
import type { MenuProps } from 'antd';

import {
  accessMatrix,
  apiDocHighlights,
  apiSurface,
  profileFields,
  settingsFocusItems,
  securityFields,
  securityNotes
} from '../demo-data';
import { ApplicationWorkspacePanel } from '../../shared/ui/ApplicationWorkspacePanel';
import { DemoPageHero } from '../../shared/ui/DemoPageHero';
import { StatusPill } from '../../shared/ui/StatusPill';

type SettingsSectionKey = 'profile' | 'security' | 'access' | 'api';

const settingsItems: MenuProps['items'] = [
  {
    key: 'profile',
    label: '账户资料'
  },
  {
    key: 'security',
    label: '安全设置'
  },
  {
    key: 'access',
    label: '访问控制'
  },
  {
    key: 'api',
    label: 'API 文档'
  }
];

export function SettingsPage() {
  const locationSearch = useRouterState({
    select: (state) => state.location.search
  });
  const searchParams = useMemo(() => new URLSearchParams(locationSearch), [locationSearch]);
  const routeSection = searchParams.get('section');
  const initialSection =
    routeSection === 'security' || routeSection === 'access' || routeSection === 'api'
      ? (routeSection as SettingsSectionKey)
      : 'profile';
  const focusKey = searchParams.get('focus') ?? '';
  const activeFocus = settingsFocusItems[focusKey] ?? null;
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  return (
    <div className="demo-page">
      <DemoPageHero
        kicker="控制台设置"
        title="设置"
        description="设置页负责管理账户资料、安全策略、访问控制与接口文档，保持控制台管理域的入口一致。"
      />

      <ApplicationWorkspacePanel
        activeKeys={activeSection === 'api' ? ['api', 'settings'] : ['settings']}
      />

      <Row gutter={[18, 18]}>
        <Col xs={24} xl={7}>
          <Card className="demo-card settings-nav-card">
            <Menu
              mode="inline"
              selectedKeys={[activeSection]}
              items={settingsItems}
              onClick={(event) => setActiveSection(event.key as SettingsSectionKey)}
            />
          </Card>
        </Col>

        <Col xs={24} xl={17}>
          <Card className="demo-card settings-content-card">
            {activeFocus ? (
              <section className="focus-summary-panel" aria-label="当前治理关注">
                <Typography.Title level={4}>当前治理关注</Typography.Title>
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
              </section>
            ) : null}

            {activeSection === 'profile' ? (
              <Descriptions
                title="账户资料"
                column={1}
                colon={false}
                items={profileFields.map((item) => ({
                  key: item.key,
                  label: item.label,
                  children: item.value
                }))}
              />
            ) : null}

            {activeSection === 'security' ? (
              <div className="settings-stack">
                <Descriptions
                  title="密码与会话"
                  column={1}
                  colon={false}
                  items={securityFields.map((item) => ({
                    key: item.key,
                    label: item.label,
                    children: item.value
                  }))}
                />

                <Card size="small" title="登录风险" className="drawer-timeline-card">
                  <List
                    dataSource={securityNotes}
                    renderItem={(item) => <List.Item>{item}</List.Item>}
                  />
                </Card>
              </div>
            ) : null}

            {activeSection === 'access' ? (
              <div>
                <Typography.Title level={4}>角色矩阵</Typography.Title>
                <Table
                  rowKey="key"
                  pagination={false}
                  dataSource={accessMatrix}
                  columns={[
                    {
                      title: '角色',
                      dataIndex: 'role',
                      key: 'role'
                    },
                    {
                      title: '范围',
                      dataIndex: 'scope',
                      key: 'scope'
                    },
                    {
                      title: '权限',
                      dataIndex: 'permissions',
                      key: 'permissions'
                    }
                  ]}
                />
              </div>
            ) : null}

            {activeSection === 'api' ? (
              <div className="settings-stack">
                <Typography.Title level={4}>API 文档入口</Typography.Title>
                <List
                  dataSource={apiDocHighlights}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
                <Table
                  rowKey="path"
                  pagination={false}
                  dataSource={apiSurface}
                  columns={[
                    {
                      title: 'Method',
                      dataIndex: 'method',
                      key: 'method'
                    },
                    {
                      title: 'Path',
                      dataIndex: 'path',
                      key: 'path'
                    },
                    {
                      title: '说明',
                      dataIndex: 'note',
                      key: 'note'
                    }
                  ]}
                />
              </div>
            ) : null}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
