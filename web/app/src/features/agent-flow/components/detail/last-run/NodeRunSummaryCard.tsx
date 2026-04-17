import { Card, Descriptions, Tag } from 'antd';

import type { NodeLastRun } from '../../../api/runtime';

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'green',
  failed: 'red',
  running: 'blue'
};

function formatDuration(startedAt: string, finishedAt: string | null) {
  if (!finishedAt) {
    return '进行中';
  }

  const durationMs =
    new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  return `${Math.max(durationMs, 0)} ms`;
}

export function NodeRunSummaryCard({
  lastRun
}: {
  lastRun: NodeLastRun;
}) {
  return (
    <Card title="运行摘要">
      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: 'status',
            label: '状态',
            children: (
              <Tag color={STATUS_COLOR[lastRun.flow_run.status] ?? 'default'}>
                {lastRun.flow_run.status}
              </Tag>
            )
          },
          {
            key: 'mode',
            label: '运行模式',
            children: lastRun.flow_run.run_mode
          },
          {
            key: 'target',
            label: '目标节点',
            children: lastRun.flow_run.target_node_id ?? lastRun.node_run.node_id
          },
          {
            key: 'duration',
            label: '运行时间',
            children: formatDuration(
              lastRun.flow_run.started_at,
              lastRun.flow_run.finished_at
            )
          },
          {
            key: 'events',
            label: '事件数',
            children: lastRun.events.length
          }
        ]}
      />
    </Card>
  );
}
