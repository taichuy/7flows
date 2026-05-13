import { ArrowLeftOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Result,
  Space,
  Typography
} from 'antd';

import { useAuthStore } from '../../../../state/auth-store';
import { DebugConversationPane } from '../../../agent-flow/components/debug-console/conversation/DebugConversationPane';
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

function RunConversation({ detail }: { detail: ApplicationRunDetail }) {
  return (
    <section aria-label="AI 对话" className="application-run-detail__section">
      <div className="application-run-detail__section-header">
        <Typography.Title level={5}>AI 对话</Typography.Title>
      </div>
      <div className="application-run-detail__conversation-pane">
        <DebugConversationPane
          messages={buildConversationMessages(detail)}
          runContext={buildRunContext(detail)}
          showComposer={false}
          status={mapRunStatusToSessionStatus(detail.flow_run.status)}
          stopping={false}
          onChangeQuery={() => {}}
          onStopRun={() => {}}
          onSubmitPrompt={() => {}}
        />
      </div>
    </section>
  );
}

function renderDetail(detail: ApplicationRunDetail) {
  return (
    <div className="application-run-detail__content">
      <RunConversation detail={detail} />
    </div>
  );
}

export function ApplicationRunDetailPanel({
  applicationId,
  runId,
  onBack
}: {
  applicationId: string;
  runId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const detailQuery = useQuery({
    queryKey: applicationRunDetailQueryKey(applicationId, runId),
    queryFn: () => fetchApplicationRunDetail(applicationId, runId)
  });
  const resumeMutation = useMutation({
    mutationFn: async ({
      checkpointId,
      inputPayload
    }: {
      checkpointId: string;
      inputPayload: Record<string, unknown>;
    }) => {
      if (!csrfToken) {
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
      queryClient.setQueryData(
        applicationRunDetailQueryKey(applicationId, runId),
        detail
      );
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });
    }
  });

  let content = <Result status="info" title="正在加载运行详情" />;

  if (detailQuery.isError) {
    content = <Result status="error" title="运行详情加载失败" />;
  } else if (detailQuery.data) {
    content = (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {renderDetail(detailQuery.data)}
        <ApplicationRunResumeCard
          detail={detailQuery.data}
          onCompleteCallback={(callbackTaskId, responsePayload) =>
            callbackMutation.mutateAsync({ callbackTaskId, responsePayload })
          }
          onResume={(checkpointId, inputPayload) =>
            resumeMutation.mutateAsync({ checkpointId, inputPayload })
          }
        />
      </Space>
    );
  }

  return (
    <div className="application-run-detail">
      <div className="application-run-detail__header">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回日志
        </Button>
        <div>
          <Typography.Title level={4}>运行详情</Typography.Title>
          <Typography.Text type="secondary">{runId}</Typography.Text>
        </div>
      </div>
      {content}
    </div>
  );
}
