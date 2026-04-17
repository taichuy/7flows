import { Card, Descriptions, Divider, Typography } from 'antd';

import type { NodeLastRun } from '../../../api/runtime';

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

export function NodeRunIOCard({
  lastRun
}: {
  lastRun: NodeLastRun;
}) {
  return (
    <Card title="节点输入输出">
      <Typography.Text strong>输入</Typography.Text>
      <Descriptions
        column={1}
        size="small"
        style={{ marginTop: 12 }}
        items={payloadItems(lastRun.node_run.input_payload)}
      />
      <Divider />
      <Typography.Text strong>输出</Typography.Text>
      <Descriptions
        column={1}
        size="small"
        style={{ marginTop: 12 }}
        items={payloadItems(lastRun.node_run.output_payload)}
      />
    </Card>
  );
}
