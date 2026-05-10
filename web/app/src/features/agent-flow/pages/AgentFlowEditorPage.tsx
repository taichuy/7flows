import { useQuery } from '@tanstack/react-query';
import { Result } from 'antd';

import { ApiClientError } from '@1flowbase/api-client';
import { PermissionDeniedState } from '../../../shared/ui/PermissionDeniedState';
import {
  applicationEnvironmentVariablesQueryKey,
  fetchApplicationEnvironmentVariables
} from '../../applications/api/applications';
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
  const orchestrationQuery = useQuery({
    queryKey: orchestrationQueryKey(applicationId),
    queryFn: () => fetchOrchestrationState(applicationId)
  });
  const nodeContributionsQuery = useQuery({
    queryKey: nodeContributionsQueryKey(applicationId),
    queryFn: () => fetchNodeContributions(applicationId)
  });
  const environmentVariablesQuery = useQuery({
    queryKey: applicationEnvironmentVariablesQueryKey(applicationId),
    queryFn: () => fetchApplicationEnvironmentVariables(applicationId)
  });

  if (
    orchestrationQuery.isPending ||
    nodeContributionsQuery.isPending ||
    environmentVariablesQuery.isPending
  ) {
    return <Result status="info" title="正在加载编排" />;
  }

  if (
    orchestrationQuery.isError ||
    nodeContributionsQuery.isError ||
    environmentVariablesQuery.isError
  ) {
    const error = orchestrationQuery.isError
      ? orchestrationQuery.error
      : nodeContributionsQuery.isError
        ? nodeContributionsQuery.error
        : environmentVariablesQuery.error;

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
      initialEnvironmentVariables={environmentVariablesQuery.data}
      nodeContributions={nodeContributions}
    />
  );
}
