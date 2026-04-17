import { Button, Table, Tag } from 'antd';

import type { ApplicationRunSummary } from '../../api/runtime';

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'green',
  failed: 'red',
  running: 'blue',
  waiting_human: 'gold',
  waiting_callback: 'orange'
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function ApplicationRunsTable({
  runs,
  selectedRunId,
  onSelectRun
}: {
  runs: ApplicationRunSummary[];
  selectedRunId?: string | null;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <Table<ApplicationRunSummary>
      rowKey="id"
      dataSource={runs}
      pagination={false}
      rowClassName={(record) =>
        record.id === selectedRunId ? 'application-runs-table__row--active' : ''
      }
      columns={[
        {
          title: '运行 ID',
          dataIndex: 'id',
          ellipsis: true
        },
        {
          title: '模式',
          dataIndex: 'run_mode',
          width: 180
        },
        {
          title: '目标节点',
          dataIndex: 'target_node_id',
          width: 160,
          render: (value: string | null) => value ?? '全流'
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
          title: '开始时间',
          dataIndex: 'started_at',
          width: 200,
          render: (value: string) => formatTimestamp(value)
        },
        {
          title: '操作',
          key: 'action',
          width: 140,
          render: (_: unknown, run) => (
            <Button type="link" onClick={() => onSelectRun(run.id)}>
              查看运行详情
            </Button>
          )
        }
      ]}
    />
  );
}
