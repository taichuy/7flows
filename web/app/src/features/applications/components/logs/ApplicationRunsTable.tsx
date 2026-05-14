import { Button, Table, Tag } from 'antd';

import type { ApplicationRunSummary } from '../../api/runtime';

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'green',
  failed: 'red',
  running: 'blue',
  waiting_human: 'gold',
  waiting_callback: 'orange'
};

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function ApplicationRunsTable({
  loading = false,
  page,
  pageSize,
  total,
  runs,
  selectedRunId,
  onPageChange,
  onSelectRun
}: {
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  runs: ApplicationRunSummary[];
  selectedRunId?: string | null;
  onPageChange: (page: number) => void;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <Table<ApplicationRunSummary>
      rowKey="id"
      dataSource={runs}
      loading={loading}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: false,
        showTotal: (paginationTotal) => `共 ${paginationTotal} 条`,
        onChange: onPageChange
      }}
      rowClassName={(record) =>
        record.id === selectedRunId ? 'application-runs-table__row--active' : ''
      }
      columns={[
        {
          title: '标题',
          dataIndex: 'title',
          width: 220,
          ellipsis: true,
          render: (value: string | null | undefined) => value ?? '-'
        },
        {
          title: 'expand_id',
          dataIndex: 'expand_id',
          width: 180,
          ellipsis: true,
          render: (value: string | null) => value ?? '-'
        },
        {
          title: '授权人',
          dataIndex: 'authorized_account',
          width: 160,
          ellipsis: true,
          render: (value: string | null) => value ?? '-'
        },
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
          title: '更新时间',
          dataIndex: 'updated_at',
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
