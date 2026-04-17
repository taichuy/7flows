import { useQuery } from '@tanstack/react-query';
import { Empty, Result, Space, Typography } from 'antd';
import { useState } from 'react';

import {
  applicationRunsQueryKey,
  fetchApplicationRuns
} from '../api/runtime';
import { ApplicationRunDetailDrawer } from '../components/logs/ApplicationRunDetailDrawer';
import { ApplicationRunsTable } from '../components/logs/ApplicationRunsTable';

export function ApplicationLogsPage({
  applicationId
}: {
  applicationId: string;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const runsQuery = useQuery({
    queryKey: applicationRunsQueryKey(applicationId),
    queryFn: () => fetchApplicationRuns(applicationId)
  });

  if (runsQuery.isPending) {
    return <Result status="info" title="正在加载运行日志" />;
  }

  if (runsQuery.isError) {
    return <Result status="error" title="运行日志加载失败" />;
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={4}>运行日志</Typography.Title>
          <Typography.Paragraph type="secondary">
            这里展示应用级 flow run、节点运行摘要和关键事件时间线。
          </Typography.Paragraph>
        </div>

        {runsQuery.data.length === 0 ? (
          <Empty
            description="当前应用还没有运行记录"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <ApplicationRunsTable
            runs={runsQuery.data}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
          />
        )}
      </Space>

      <ApplicationRunDetailDrawer
        applicationId={applicationId}
        runId={selectedRunId}
        open={Boolean(selectedRunId)}
        onClose={() => setSelectedRunId(null)}
      />
    </>
  );
}
