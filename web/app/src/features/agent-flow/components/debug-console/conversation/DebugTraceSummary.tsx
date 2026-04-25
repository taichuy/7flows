import { Space, Tag, Typography } from 'antd';

import type { AgentFlowTraceItem } from '../../../api/runtime';

function statusColor(status: string) {
  switch (status) {
    case 'succeeded':
      return 'green';
    case 'failed':
      return 'red';
    case 'waiting_human':
      return 'gold';
    default:
      return 'blue';
  }
}

export function DebugTraceSummary({
  items,
  onSelectNode
}: {
  items: AgentFlowTraceItem[];
  onSelectNode: (nodeId: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="agent-flow-editor__debug-trace-summary">
      <Typography.Text strong>Trace Summary</Typography.Text>
      <div className="agent-flow-editor__debug-trace-summary-list">
        {items.map((item) => (
          <button
            key={item.nodeId}
            className="agent-flow-editor__debug-trace-summary-item"
            type="button"
            onClick={() => onSelectNode(item.nodeId)}
          >
            <Space size={8}>
              <Tag color={statusColor(item.status)}>{item.status}</Tag>
              <Typography.Text>{item.nodeAlias}</Typography.Text>
            </Space>
            <Typography.Text type="secondary">
              {item.durationMs == null ? '进行中' : `${item.durationMs} ms`}
            </Typography.Text>
          </button>
        ))}
      </div>
    </div>
  );
}
