import { useQuery } from '@tanstack/react-query';
import { Empty, Result, Space, Typography } from 'antd';
import { useState } from 'react';

import {
  applicationRunsQueryKey,
  fetchApplicationRuns
} from '../api/runtime';
import { ApplicationRunDetailPanel } from '../components/logs/ApplicationRunDetailPanel';
import { ApplicationRunsTable } from '../components/logs/ApplicationRunsTable';
import './application-logs-page.css';

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
    <div className="application-logs-page">
      <section className="application-logs-page__list">
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={4}>运行日志</Typography.Title>
            <Typography.Paragraph type="secondary">
              这里展示应用运行记录，点击后可在右侧直接查看对话和节点输入输出。
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
      </section>
      <ApplicationRunDetailPanel
        applicationId={applicationId}
        onClose={() => setSelectedRunId(null)}
        runId={selectedRunId}
      />
    </div>
  );
}
