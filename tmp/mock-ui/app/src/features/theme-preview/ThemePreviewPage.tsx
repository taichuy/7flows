import {
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  List,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Typography
} from 'antd';

const componentInventory = [
  'Shell header',
  'Navigation links',
  'Primary button',
  'Secondary button',
  'Ghost link button',
  'Danger button',
  'Standard card',
  'Featured card',
  'Status badge',
  'Form controls',
  'Tabs',
  'Table / list / descriptions',
  'Code block'
];

const statusItems = [
  { key: 'running', label: 'Running', note: 'High-signal live execution' },
  { key: 'waiting', label: 'Waiting', note: 'Queued or pending callback' },
  { key: 'failed', label: 'Failed', note: 'Needs attention or retry' },
  { key: 'success', label: 'Success', note: 'Healthy and completed' },
  { key: 'draft', label: 'Draft', note: 'Unpublished or partial state' },
  { key: 'selected', label: 'Selected', note: 'User selection, not runtime' }
];

const releaseRows = [
  {
    key: '1',
    release: 'Spring launch',
    owner: 'Growth ops',
    state: 'Running'
  },
  {
    key: '2',
    release: 'Docs refresh',
    owner: 'Platform',
    state: 'Waiting'
  },
  {
    key: '3',
    release: 'Embed runtime',
    owner: 'Infra',
    state: 'Success'
  }
];

const releaseColumns = [
  {
    title: 'Release',
    dataIndex: 'release',
    key: 'release'
  },
  {
    title: 'Owner',
    dataIndex: 'owner',
    key: 'owner'
  },
  {
    title: 'State',
    dataIndex: 'state',
    key: 'state',
    render: (value: string) => (
      <span
        className={`theme-status-pill ${value.toLowerCase()}`}
        data-status={value.toLowerCase()}
      >
        {value}
      </span>
    )
  }
];

const launchChecklist = [
  'White workspace canvas with restrained emerald signal glow',
  'Neutral cards and borders so data stays legible',
  'One accent family for CTA, focus, selected, and running states'
];

export function ThemePreviewPage() {
  return (
    <Space direction="vertical" size="large" className="theme-preview">
      <Card className="theme-card-featured">
        <div className="theme-kicker">Light Workbench Direction</div>
        <Typography.Title level={1} className="theme-preview-title">
          Light Emerald Theme Preview
        </Typography.Title>
        <Typography.Paragraph className="theme-preview-lede">
          This mock removes the heavy dark-console shell and keeps the bright
          emerald signal language for CTA, focus, running, and selected states.
          The goal is a cleaner white workspace that still feels active.
        </Typography.Paragraph>
        <Space wrap>
          <Button type="primary">Primary CTA</Button>
          <Button>Secondary Button</Button>
          <Button type="link">Ghost / Link</Button>
          <Button danger>Danger Action</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Component Inventory">
            <div className="theme-chip-grid">
              {componentInventory.map((item) => (
                <span key={item} className="theme-chip">
                  {item}
                </span>
              ))}
            </div>
            <Typography.Paragraph className="theme-note">
              These are the shell-layer styles exposed in this mock so you can
              judge the direction quickly.
            </Typography.Paragraph>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Status Semantics">
            <div className="theme-status-grid">
              {statusItems.map((item) => (
                <div key={item.key} className="theme-status-row">
                  <span
                    className={`theme-status-pill ${item.key}`}
                    data-status={item.key}
                  >
                    {item.label}
                  </span>
                  <Typography.Text className="theme-note">
                    {item.note}
                  </Typography.Text>
                </div>
              ))}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Buttons">
            <Space wrap>
              <Button type="primary">Save Workspace</Button>
              <Button>Secondary Action</Button>
              <Button type="link">Review Details</Button>
              <Button danger>Remove Access</Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Surface Cards">
            <div className="theme-surface-grid">
              <div className="theme-mini-card">
                <div className="theme-mini-label">Metric card</div>
                <div className="theme-mini-value">24</div>
                <div className="theme-note">Active runs</div>
              </div>
              <div className="theme-mini-card is-selected">
                <div className="theme-mini-label">Selected card</div>
                <div className="theme-mini-value">3</div>
                <div className="theme-note">Review blockers</div>
              </div>
              <div className="theme-mini-card is-running">
                <div className="theme-mini-label">Running card</div>
                <div className="theme-mini-value">12m</div>
                <div className="theme-note">Current execution</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Forms">
            <div className="theme-form-stack">
              <Input defaultValue="Growth workspace" />
              <Select
                defaultValue="staging"
                options={[
                  { label: 'Staging', value: 'staging' },
                  { label: 'Production', value: 'production' },
                  { label: 'Preview', value: 'preview' }
                ]}
              />
              <Input.TextArea
                rows={4}
                defaultValue="Keep the base surfaces white and let emerald only appear on high-signal interactions."
              />
              <div className="theme-form-inline">
                <Switch defaultChecked />
                <Typography.Text>Enable emerald focus halo</Typography.Text>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Checklist and Notes">
            <List
              dataSource={launchChecklist}
              renderItem={(item) => (
                <List.Item>
                  <span className="theme-list-bullet" aria-hidden="true" />
                  <Typography.Text>{item}</Typography.Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Data Display">
        <Tabs
          items={[
            {
              key: 'table',
              label: 'Table',
              children: (
                <Table
                  className="theme-table"
                  columns={releaseColumns}
                  dataSource={releaseRows}
                  pagination={false}
                  size="small"
                />
              )
            },
            {
              key: 'list',
              label: 'List',
              children: (
                <List
                  dataSource={releaseRows}
                  renderItem={(item) => (
                    <List.Item>
                      <div className="theme-list-row">
                        <div>
                          <div className="theme-list-title">{item.release}</div>
                          <div className="theme-note">{item.owner}</div>
                        </div>
                        <span
                          className={`theme-status-pill ${item.state.toLowerCase()}`}
                          data-status={item.state.toLowerCase()}
                        >
                          {item.state}
                        </span>
                      </div>
                    </List.Item>
                  )}
                />
              )
            },
            {
              key: 'descriptions',
              label: 'Descriptions',
              children: (
                <Descriptions
                  column={1}
                  bordered
                  items={[
                    {
                      key: 'theme',
                      label: 'Theme',
                      children: 'Light workspace + emerald signal'
                    },
                    {
                      key: 'surfaces',
                      label: 'Surface rule',
                      children: 'White cards, warm gray borders, no heavy fog'
                    },
                    {
                      key: 'glow',
                      label: 'Glow rule',
                      children:
                        'Only CTA, focus, running, and selected states keep the halo'
                    }
                  ]}
                />
              )
            }
          ]}
        />
      </Card>

      <Card title="Code / Log Surface">
        <div className="theme-code-block">
          <pre>{`npm run preview
theme.base = light-workbench
theme.primary = #00d992
theme.signal = enabled
shell.surface = #ffffff`}</pre>
        </div>
      </Card>
    </Space>
  );
}
