import { CloseOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Result, Typography } from 'antd';

import { useAuthStore } from '../../../../state/auth-store';
import { AgentFlowDebugConsole } from '../../../agent-flow/components/debug-console/AgentFlowDebugConsole';
import type {
  AgentFlowDebugMessage,
  AgentFlowDebugMessageStatus,
  AgentFlowRunContext
} from '../../../agent-flow/api/runtime';
import {
  extractAssistantOutputText,
  mapRunDetailToTrace
} from '../../../agent-flow/lib/debug-console/run-detail-mapper';
import type { AgentFlowDebugSessionStatus } from '../../../agent-flow/hooks/runtime/useAgentFlowDebugSession';
import {
  applicationRunDetailQueryKey,
  completeCallbackTask,
  fetchApplicationRunDetail,
  resumeFlowRun,
  type ApplicationRunDetail
} from '../../api/runtime';
import { ApplicationRunResumeCard } from './ApplicationRunResumeCard';
import './application-run-detail-panel.css';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '无';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length === 0
      ? '空列表'
      : value.map((entry) => summarizeValue(entry)).join('、');
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return '空对象';
    }

    return entries
      .map(([key, entryValue]) => `${key}: ${summarizeValue(entryValue)}`)
      .join(' · ');
  }

  return String(value);
}

function findFirstString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedValue = findFirstString(entry);

      if (nestedValue) {
        return nestedValue;
      }
    }

    return null;
  }

  if (isRecord(value)) {
    for (const nestedValue of Object.values(value)) {
      const firstString = findFirstString(nestedValue);

      if (firstString) {
        return firstString;
      }
    }
  }

  return null;
}

function findNamedString(
  value: unknown,
  preferredKeys: readonly string[]
): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nestedValue = findNamedString(entry, preferredKeys);

      if (nestedValue) {
        return nestedValue;
      }
    }

    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (
      typeof entryValue === 'string' &&
      preferredKeys.some((preferredKey) => key.includes(preferredKey)) &&
      entryValue.trim().length > 0
    ) {
      return entryValue;
    }
  }

  for (const entryValue of Object.values(value)) {
    const nestedValue = findNamedString(entryValue, preferredKeys);

    if (nestedValue) {
      return nestedValue;
    }
  }

  return null;
}

function mapRunStatusToMessageStatus(
  status: string
): AgentFlowDebugMessageStatus {
  switch (status) {
    case 'succeeded':
      return 'completed';
    case 'waiting_callback':
      return 'waiting_callback';
    case 'waiting_human':
      return 'waiting_human';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    default:
      return 'running';
  }
}

function mapRunStatusToSessionStatus(
  status: string
): AgentFlowDebugSessionStatus {
  switch (status) {
    case 'succeeded':
      return 'completed';
    case 'waiting_callback':
      return 'waiting_callback';
    case 'waiting_human':
      return 'waiting_human';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
      return 'failed';
    case 'running':
      return 'running';
    default:
      return 'completed';
  }
}

function buildRunContext(detail: ApplicationRunDetail): AgentFlowRunContext {
  return {
    environmentLabel: 'draft',
    remembered: false,
    fields: [
      {
        nodeId: detail.flow_run.target_node_id ?? 'flow-run',
        nodeLabel: '运行输入',
        key: 'query',
        title: '输入',
        valueType: 'string',
        value:
          findNamedString(detail.flow_run.input_payload, [
            'query',
            'question',
            'prompt',
            'message',
            'input'
          ]) ?? ''
      }
    ]
  };
}

function buildConversationMessages(
  detail: ApplicationRunDetail
): AgentFlowDebugMessage[] {
  const userContent =
    findNamedString(detail.flow_run.input_payload, [
      'query',
      'question',
      'prompt',
      'message',
      'input'
    ]) ?? summarizeValue(detail.flow_run.input_payload);
  const assistantContent =
    extractAssistantOutputText(detail) ||
    findFirstString(detail.flow_run.output_payload) ||
    '暂无输出';
  const rawOutput =
    Object.keys(detail.flow_run.output_payload).length > 0
      ? detail.flow_run.output_payload
      : null;

  return [
    {
      id: `user-${detail.flow_run.id}`,
      role: 'user',
      content: userContent,
      status: 'completed',
      runId: detail.flow_run.id,
      rawOutput: null,
      traceSummary: []
    },
    {
      id: `assistant-${detail.flow_run.id}`,
      role: 'assistant',
      content: assistantContent,
      status: mapRunStatusToMessageStatus(detail.flow_run.status),
      runId: detail.flow_run.id,
      rawOutput,
      traceSummary: mapRunDetailToTrace(detail)
    }
  ];
}

function RunConversation({
  detail,
  onClose,
  onOpenMessageLog
}: {
  detail: ApplicationRunDetail;
  onClose: () => void;
  onOpenMessageLog?: (message: AgentFlowDebugMessage) => void;
}) {
  const runContext = buildRunContext(detail);

  return (
    <div className="application-run-detail__conversation-pane">
      <AgentFlowDebugConsole
        ariaLabel="运行详情预览"
        closeLabel="关闭运行详情"
        composerUiOnly
        messages={buildConversationMessages(detail)}
        runContext={runContext}
        showClearAction={false}
        showComposer
        status={mapRunStatusToSessionStatus(detail.flow_run.status)}
        stopping={false}
        subtitle={detail.flow_run.id}
        title="运行详情"
        onChangeRunContextValue={() => {}}
        onClearSession={() => {}}
        onClose={onClose}
        onOpenMessageLog={onOpenMessageLog}
        onStopRun={() => {}}
        onSubmitPrompt={() => {}}
      />
    </div>
  );
}

function renderDetail({
  detail,
  onClose,
  onOpenMessageLog
}: {
  detail: ApplicationRunDetail;
  onClose: () => void;
  onOpenMessageLog?: (message: AgentFlowDebugMessage) => void;
}) {
  return (
    <div className="application-run-detail__content">
      <RunConversation
        detail={detail}
        onClose={onClose}
        onOpenMessageLog={onOpenMessageLog}
      />
    </div>
  );
}

export function ApplicationRunDetailPanel({
  applicationId,
  onClose,
  onOpenMessageLog,
  runId
}: {
  applicationId: string;
  onClose: () => void;
  onOpenMessageLog?: (message: AgentFlowDebugMessage) => void;
  runId: string | null;
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const detailQuery = useQuery({
    queryKey: applicationRunDetailQueryKey(applicationId, runId ?? 'pending'),
    queryFn: () => fetchApplicationRunDetail(applicationId, runId!),
    enabled: Boolean(runId)
  });
  const resumeMutation = useMutation({
    mutationFn: async ({
      checkpointId,
      inputPayload
    }: {
      checkpointId: string;
      inputPayload: Record<string, unknown>;
    }) => {
      if (!runId || !csrfToken) {
        throw new Error('missing runtime resume context');
      }

      return resumeFlowRun(
        applicationId,
        runId,
        checkpointId,
        inputPayload,
        csrfToken
      );
    },
    onSuccess: async (detail) => {
      if (!runId) {
        return;
      }

      queryClient.setQueryData(
        applicationRunDetailQueryKey(applicationId, runId),
        detail
      );
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });
    }
  });
  const callbackMutation = useMutation({
    mutationFn: async ({
      callbackTaskId,
      responsePayload
    }: {
      callbackTaskId: string;
      responsePayload: Record<string, unknown>;
    }) => {
      if (!csrfToken) {
        throw new Error('missing callback context');
      }

      return completeCallbackTask(
        applicationId,
        callbackTaskId,
        responsePayload,
        csrfToken
      );
    },
    onSuccess: async (detail) => {
      if (!runId) {
        return;
      }

      queryClient.setQueryData(
        applicationRunDetailQueryKey(applicationId, runId),
        detail
      );
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });
    }
  });

  if (!runId) {
    return null;
  }

  let content = <Result status="info" title="正在加载运行详情" />;

  if (runId && detailQuery.isPending) {
    content = <Result status="info" title="正在加载运行详情" />;
  } else if (runId && detailQuery.isError) {
    content = <Result status="error" title="运行详情加载失败" />;
  } else if (runId && detailQuery.data) {
    content = (
      <div className="application-run-detail__body">
        {renderDetail({
          detail: detailQuery.data,
          onClose,
          onOpenMessageLog
        })}
        <ApplicationRunResumeCard
          detail={detailQuery.data}
          onCompleteCallback={(callbackTaskId, responsePayload) =>
            callbackMutation.mutateAsync({ callbackTaskId, responsePayload })
          }
          onResume={(checkpointId, inputPayload) =>
            resumeMutation.mutateAsync({ checkpointId, inputPayload })
          }
        />
      </div>
    );
  }

  return (
    <aside
      aria-label="运行详情"
      className={[
        'application-run-detail',
        detailQuery.data ? 'application-run-detail--loaded' : null
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {detailQuery.data ? null : (
        <div className="application-run-detail__header">
          <div>
            <Typography.Title level={4}>运行详情</Typography.Title>
            <Typography.Text type="secondary">{runId}</Typography.Text>
          </div>
          <Button
            aria-label="关闭运行详情"
            icon={<CloseOutlined />}
            onClick={onClose}
            type="text"
          />
        </div>
      )}
      {content}
    </aside>
  );
}
