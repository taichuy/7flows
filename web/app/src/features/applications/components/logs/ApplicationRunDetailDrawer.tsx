import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Result,
  Space,
  Table,
  Tag,
  Timeline,
  Typography
} from 'antd';

import {
  completeCallbackTask,
  resumeFlowRun,
  applicationRunDetailQueryKey,
  fetchApplicationRunDetail,
  type ApplicationRunDetail
} from '../../api/runtime';
import { useAuthStore } from '../../../../state/auth-store';
import { ApplicationRunResumeCard } from './ApplicationRunResumeCard';

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'green',
  failed: 'red',
  running: 'blue'
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return '未结束';
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false });
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

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return '空对象';
    }

    return entries
      .map(([key, entryValue]) => `${key}: ${summarizeValue(entryValue)}`)
      .join(' · ');
  }

  return String(value);
}

function payloadItems(payload: Record<string, unknown>) {
  const entries = Object.entries(payload);

  if (entries.length === 0) {
    return [
      {
        key: 'empty',
        label: '内容',
        children: '无'
      }
    ];
  }

  return entries.map(([key, value]) => ({
    key,
    label: key,
    children: summarizeValue(value)
  }));
}

function renderDetail(detail: ApplicationRunDetail) {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Descriptions
        bordered
        column={1}
        items={[
          {
            key: 'run_id',
            label: '运行 ID',
            children: detail.flow_run.id
          },
          {
            key: 'status',
            label: '运行状态',
            children: (
              <Tag color={STATUS_COLOR[detail.flow_run.status] ?? 'default'}>
                {detail.flow_run.status}
              </Tag>
            )
          },
          {
            key: 'mode',
            label: '运行模式',
            children: detail.flow_run.run_mode
          },
          {
            key: 'target',
            label: '目标节点',
            children: detail.flow_run.target_node_id ?? '全流'
          },
          {
            key: 'started_at',
            label: '开始时间',
            children: formatTimestamp(detail.flow_run.started_at)
          },
          {
            key: 'finished_at',
            label: '结束时间',
            children: formatTimestamp(detail.flow_run.finished_at)
          }
        ]}
      />

      <div>
        <Typography.Title level={5}>节点运行</Typography.Title>
        <Table
          rowKey="id"
          pagination={false}
          dataSource={detail.node_runs}
          columns={[
            {
              title: '节点',
              key: 'node',
              render: (_: unknown, run) => `${run.node_alias} (${run.node_id})`
            },
            {
              title: '类型',
              dataIndex: 'node_type',
              width: 120
            },
            {
              title: '状态',
              key: 'status',
              width: 120,
              render: (_: unknown, run) => (
                <Tag color={STATUS_COLOR[run.status] ?? 'default'}>{run.status}</Tag>
              )
            },
            {
              title: '输入摘要',
              key: 'input',
              render: (_: unknown, run) =>
                summarizeValue(run.input_payload as Record<string, unknown>)
            }
          ]}
        />
      </div>

      <div>
        <Typography.Title level={5}>事件时间线</Typography.Title>
        <Timeline
          items={detail.events.map((event) => ({
            children: (
              <Space direction="vertical" size={2}>
                <Typography.Text strong>{event.event_type}</Typography.Text>
                <Typography.Text type="secondary">
                  {formatTimestamp(event.created_at)}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {summarizeValue(event.payload as Record<string, unknown>)}
                </Typography.Text>
              </Space>
            )
          }))}
        />
      </div>

      <div>
        <Typography.Title level={5}>运行输入</Typography.Title>
        <Descriptions bordered column={1} items={payloadItems(detail.flow_run.input_payload)} />
      </div>

      <div>
        <Typography.Title level={5}>运行输出</Typography.Title>
        <Descriptions
          bordered
          column={1}
          items={payloadItems(detail.flow_run.output_payload)}
        />
      </div>

      <Divider style={{ margin: 0 }} />

      <div>
        <Typography.Title level={5}>Checkpoint</Typography.Title>
        {detail.checkpoints.length === 0 ? (
          <Empty description="本次运行没有 checkpoint" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            rowKey="id"
            pagination={false}
            dataSource={detail.checkpoints}
            columns={[
              {
                title: '状态',
                dataIndex: 'status',
                width: 140
              },
              {
                title: '原因',
                dataIndex: 'reason'
              },
              {
                title: '创建时间',
                dataIndex: 'created_at',
                width: 200,
                render: (value: string) => formatTimestamp(value)
              }
            ]}
          />
        )}
      </div>

      {detail.callback_tasks.length > 0 ? (
        <div>
          <Typography.Title level={5}>Callback Tasks</Typography.Title>
          <Table
            rowKey="id"
            pagination={false}
            dataSource={detail.callback_tasks}
            columns={[
              {
                title: '类型',
                dataIndex: 'callback_kind',
                width: 160
              },
              {
                title: '状态',
                dataIndex: 'status',
                width: 140
              },
              {
                title: '创建时间',
                dataIndex: 'created_at',
                width: 200,
                render: (value: string) => formatTimestamp(value)
              }
            ]}
          />
        </div>
      ) : null}
    </Space>
  );
}

export function ApplicationRunDetailDrawer({
  applicationId,
  runId,
  open,
  onClose
}: {
  applicationId: string;
  runId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const detailQuery = useQuery({
    queryKey: applicationRunDetailQueryKey(applicationId, runId ?? 'pending'),
    queryFn: () => fetchApplicationRunDetail(applicationId, runId!),
    enabled: open && Boolean(runId)
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

      return resumeFlowRun(applicationId, runId, checkpointId, inputPayload, csrfToken);
    },
    onSuccess: async (detail) => {
      if (!runId) {
        return;
      }

      queryClient.setQueryData(applicationRunDetailQueryKey(applicationId, runId), detail);
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

      queryClient.setQueryData(applicationRunDetailQueryKey(applicationId, runId), detail);
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });
    }
  });

  let content = <Empty description="请选择一条运行记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  if (detailQuery.isPending) {
    content = <Result status="info" title="正在加载运行详情" />;
  } else if (detailQuery.isError) {
    content = <Result status="error" title="运行详情加载失败" />;
  } else if (detailQuery.data) {
    content = (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {renderDetail(detailQuery.data)}
        <ApplicationRunResumeCard
          detail={detailQuery.data}
          onResume={(checkpointId, inputPayload) =>
            resumeMutation.mutateAsync({ checkpointId, inputPayload })
          }
          onCompleteCallback={(callbackTaskId, responsePayload) =>
            callbackMutation.mutateAsync({ callbackTaskId, responsePayload })
          }
        />
      </Space>
    );
  }

  return (
    <Drawer
      title="运行详情"
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {content}
    </Drawer>
  );
}
