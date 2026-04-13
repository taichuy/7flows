import { useQuery } from '@tanstack/react-query';
import { Button, Card, Space, Typography } from 'antd';

import { fetchApiHealth, getDefaultApiBaseUrl } from '@1flowse/api-client';

import { useAppStore } from '../../state/app-store';

export function HomePage() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl(window.location);
  const visitCount = useAppStore((state) => state.visitCount);
  const increment = useAppStore((state) => state.increment);
  const healthQuery = useQuery({
    queryKey: ['api-health', apiBaseUrl],
    queryFn: () => fetchApiHealth(apiBaseUrl)
  });

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="Workspace Bootstrap">
        <Typography.Paragraph>
          Frontend monorepo and backend health endpoint are wired together. The
          light shell direction is previewed in the dedicated theme page.
        </Typography.Paragraph>
        <Typography.Paragraph>Visit count: {visitCount}</Typography.Paragraph>
        <Space wrap>
          <Button type="primary" href="/theme-preview">
            Open Theme Preview
          </Button>
          <Button onClick={increment}>Increment</Button>
        </Space>
      </Card>
      <Card title="API Health">
        <Typography.Paragraph>
          {healthQuery.isPending && 'Loading health status...'}
          {healthQuery.isError && 'Health request failed.'}
          {healthQuery.data &&
            `${healthQuery.data.service} ${healthQuery.data.status} (${healthQuery.data.version})`}
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}
