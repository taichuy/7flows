import { Card, Descriptions } from 'antd';

import type { NodeLastRun } from '../../../api/runtime';

function formatTimestamp(value: string | null) {
  if (!value) {
    return '未结束';
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function summarizeMetric(value: unknown) {
  if (value === null || value === undefined) {
    return '无';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '已记录';
}

export function NodeRunMetadataCard({
  lastRun
}: {
  lastRun: NodeLastRun;
}) {
  return (
    <Card title="元数据">
      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: 'node_alias',
            label: '节点',
            children: `${lastRun.node_run.node_alias} (${lastRun.node_run.node_id})`
          },
          {
            key: 'node_type',
            label: '节点类型',
            children: lastRun.node_run.node_type
          },
          {
            key: 'actor',
            label: '执行人',
            children: lastRun.flow_run.created_by
          },
          {
            key: 'started_at',
            label: '开始时间',
            children: formatTimestamp(lastRun.node_run.started_at)
          },
          {
            key: 'finished_at',
            label: '结束时间',
            children: formatTimestamp(lastRun.node_run.finished_at)
          },
          {
            key: 'plan_id',
            label: 'Compiled Plan',
            children: lastRun.flow_run.compiled_plan_id
          },
          {
            key: 'metrics',
            label: '输出契约数',
            children: summarizeMetric(
              lastRun.node_run.metrics_payload.output_contract_count
            )
          }
        ]}
      />
    </Card>
  );
}
