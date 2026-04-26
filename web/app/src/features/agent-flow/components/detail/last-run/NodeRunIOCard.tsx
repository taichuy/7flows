import { Card, Divider, Typography } from 'antd';

import type { NodeLastRun } from '../../../api/runtime';

function formatJson(payload: Record<string, unknown>) {
  return JSON.stringify(payload, null, 2);
}

function JsonBlock({
  title,
  payload
}: {
  title: string;
  payload: Record<string, unknown>;
}) {
  return (
    <section className="agent-flow-node-run-json">
      <Typography.Text strong>{title}</Typography.Text>
      <pre
        aria-label={`${title} JSON`}
        className="agent-flow-node-run-json__code"
      >
        <code>{formatJson(payload)}</code>
      </pre>
    </section>
  );
}

export function NodeRunIOCard({
  lastRun
}: {
  lastRun: NodeLastRun;
}) {
  return (
    <Card title="节点输入输出">
      <JsonBlock payload={lastRun.node_run.input_payload} title="输入" />
      <Divider />
      <JsonBlock payload={lastRun.node_run.output_payload} title="输出" />
    </Card>
  );
}
