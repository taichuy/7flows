import { useQuery } from '@tanstack/react-query';
import { Grid, Result } from 'antd';

import { ApiClientError } from '@1flowbase/api-client';
import { PermissionDeniedState } from '../../../shared/ui/PermissionDeniedState';
import {
  fetchNodeContributions,
  nodeContributionsQueryKey
} from '../api/node-contributions';
import {
  fetchOrchestrationState,
  orchestrationQueryKey
} from '../api/orchestration';
import { AgentFlowEditorShell } from '../components/editor/AgentFlowEditorShell';

export function AgentFlowEditorPage({
  applicationId,
  applicationName
}: {
  applicationId: string;
  applicationName: string;
}) {
  const screens = Grid.useBreakpoint();
  const orchestrationQuery = useQuery({
    queryKey: orchestrationQueryKey(applicationId),
    queryFn: () => fetchOrchestrationState(applicationId)
  });
  const nodeContributionsQuery = useQuery({
    queryKey: nodeContributionsQueryKey(applicationId),
    queryFn: () => fetchNodeContributions(applicationId),
    enabled: screens.lg !== false
  });

  if (screens.lg === false) {
    return (
      <Result
        status="info"
        title="请使用桌面端编辑"
        subTitle="移动端只提供受限查看，不开放完整画布编辑。"
      />
    );
  }

  if (orchestrationQuery.isPending || nodeContributionsQuery.isPending) {
    return <Result status="info" title="正在加载编排" />;
  }

  if (orchestrationQuery.isError || nodeContributionsQuery.isError) {
    const error = orchestrationQuery.isError
      ? orchestrationQuery.error
      : nodeContributionsQuery.error;

    if (error instanceof ApiClientError && error.status === 403) {
      return <PermissionDeniedState />;
    }

    if (error instanceof ApiClientError && error.status === 404) {
      return <Result status="404" title="编排主体不存在" />;
    }

    return <Result status="error" title="编排加载失败" />;
  }

  const state = orchestrationQuery.data;
  const nodeContributions = nodeContributionsQuery.data;

  return (
    <AgentFlowEditorShell
      applicationId={applicationId}
      applicationName={applicationName}
      initialState={state}
      nodeContributions={nodeContributions}
    />
  );
}
