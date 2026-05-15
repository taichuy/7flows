import { Tag } from 'antd';

import type { DataTableColumn } from '../../../../shared/ui/data-table/DataTable';
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

export const APPLICATION_RUNS_TABLE_COLUMNS: Array<
  DataTableColumn<ApplicationRunSummary>
> = [
  {
    key: 'title',
    title: '标题',
    dataIndex: 'title',
    width: 240,
    ellipsis: true,
    render: (value) => (value ? `${value}` : '-')
  },
  {
    key: 'expand_id',
    title: 'expand_id',
    dataIndex: 'expand_id',
    width: 180,
    ellipsis: true,
    render: (value) => (value ? `${value}` : '-')
  },
  {
    key: 'authorized_account',
    title: '授权人',
    dataIndex: 'authorized_account',
    width: 160,
    ellipsis: true,
    render: (value) => (value ? `${value}` : '-')
  },
  {
    key: 'id',
    title: '运行 ID',
    dataIndex: 'id',
    width: 180,
    ellipsis: true
  },
  {
    key: 'run_mode',
    title: '模式',
    dataIndex: 'run_mode',
    width: 180
  },
  {
    key: 'target_node_id',
    title: '目标节点',
    dataIndex: 'target_node_id',
    width: 160,
    render: (value) => (typeof value === 'string' && value ? value : '全流')
  },
  {
    key: 'status',
    title: '状态',
    width: 120,
    render: (_: unknown, run) => (
      <Tag color={STATUS_COLOR[run.status] ?? 'default'}>{run.status}</Tag>
    )
  },
  {
    key: 'started_at',
    title: '开始时间',
    dataIndex: 'started_at',
    width: 200,
    render: (value) => formatTimestamp(typeof value === 'string' ? value : null)
  },
  {
    key: 'updated_at',
    title: '更新时间',
    dataIndex: 'updated_at',
    width: 200,
    render: (value) => formatTimestamp(typeof value === 'string' ? value : null)
  },
  {
    key: 'action',
    title: '操作',
    width: 140
  }
];
