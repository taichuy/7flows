import { useQuery } from '@tanstack/react-query';
import { Button, Result, Space, Typography } from 'antd';

import { ApiClientError } from '@1flowse/api-client';
import { PermissionDeniedState } from '../../../shared/ui/PermissionDeniedState';
import {
  fetchOrchestrationState,
  orchestrationQueryKey
} from '../api/orchestration';

export function AgentFlowEditorPage({
  applicationId,
  applicationName,
  apiCapabilityStatus
}: {
  applicationId: string;
  applicationName: string;
  apiCapabilityStatus: string;
}) {
  const orchestrationQuery = useQuery({
    queryKey: orchestrationQueryKey(applicationId),
    queryFn: () => fetchOrchestrationState(applicationId)
  });

  if (orchestrationQuery.isPending) {
    return <Result status="info" title="正在加载编排" />;
  }

  if (orchestrationQuery.isError) {
    const error = orchestrationQuery.error;

    if (error instanceof ApiClientError && error.status === 403) {
      return <PermissionDeniedState />;
    }

    if (error instanceof ApiClientError && error.status === 404) {
      return <Result status="404" title="编排主体不存在" />;
    }

    return <Result status="error" title="编排加载失败" />;
  }

  const state = orchestrationQuery.data;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center" size="middle">
        <Typography.Text strong>30 秒自动保存</Typography.Text>
        <Button type="default">Issues</Button>
        <Button type="default">历史版本</Button>
        <Button disabled={apiCapabilityStatus !== 'ready'}>发布配置</Button>
      </Space>
      <Typography.Title level={4} style={{ margin: 0 }}>
        {applicationName}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        当前 Flow ID：{state.flow_id}
      </Typography.Paragraph>
      <Result
        status="info"
        title="AgentFlow Editor 正在初始化"
        subTitle="Task 4 会在这里挂载完整画布、overlay、Issues 和右侧 Inspector。"
      />
    </Space>
  );
}
