import { Card, List, Typography } from 'antd';

const placeholderApps = [
  'Static build zip upload',
  'Versioned artifact history',
  'Login-state reuse via same-origin requests'
];

export function EmbeddedAppsPage() {
  return (
    <Card title="Embedded Apps">
      <Typography.Paragraph>
        Placeholder management surface for independently maintained embedded
        front-end systems.
      </Typography.Paragraph>
      <List
        dataSource={placeholderApps}
        renderItem={(item) => <List.Item>{item}</List.Item>}
      />
    </Card>
  );
}
