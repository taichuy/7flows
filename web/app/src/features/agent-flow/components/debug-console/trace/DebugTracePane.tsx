import { CloseOutlined } from '@ant-design/icons';
import { Button, Empty, Space, Tag, Typography } from 'antd';

import type { AgentFlowTraceItem } from '../../../api/runtime';

function statusColor(status: string) {
  switch (status) {
    case 'succeeded':
      return 'green';
    case 'failed':
      return 'red';
    case 'cancelled':
      return 'default';
    case 'waiting_callback':
      return 'cyan';
    case 'waiting_human':
      return 'gold';
    default:
      return 'blue';
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'cancelled':
      return 'cancelled';
    default:
      return status;
  }
}

export function DebugTracePane({
  flowStatus,
  traceItems,
  activeNodeFilter,
  onSelectNode
}: {
  flowStatus: string;
  traceItems: AgentFlowTraceItem[];
  activeNodeFilter: string | null;
  onSelectNode: (nodeId: string | null) => void;
}) {
  if (traceItems.length === 0) {
    return (
      <div className="agent-flow-editor__debug-console-pane">
        <Empty description="当前还没有 Trace 数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div className="agent-flow-editor__debug-console-pane agent-flow-editor__debug-trace-pane">
      <div className="agent-flow-editor__debug-trace-filter">
        <Space size={8}>
          <Tag color={statusColor(flowStatus)}>{statusLabel(flowStatus)}</Tag>
        </Space>
      </div>
      {activeNodeFilter ? (
        <div className="agent-flow-editor__debug-trace-filter">
          <Space size={8}>
            <Tag color="blue">{activeNodeFilter}</Tag>
            <Button
              icon={<CloseOutlined />}
              size="small"
              onClick={() => onSelectNode(null)}
            >
              清除筛选
            </Button>
          </Space>
        </div>
      ) : null}
      <div className="agent-flow-editor__debug-trace-list">
        {traceItems.map((item) => (
          <button
            key={`${item.nodeId}-${item.startedAt}`}
            className="agent-flow-editor__debug-trace-item"
            type="button"
            onClick={() => onSelectNode(item.nodeId)}
          >
            <div className="agent-flow-editor__debug-trace-item-main">
              <Space size={8} wrap>
                <Typography.Text strong>{item.nodeAlias}</Typography.Text>
                <Tag>{item.nodeType}</Tag>
                <Tag color={statusColor(item.status)}>{statusLabel(item.status)}</Tag>
              </Space>
              <Typography.Text type="secondary">
                {item.durationMs == null ? '进行中' : `${item.durationMs} ms`}
              </Typography.Text>
            </div>
            <Typography.Text type="secondary">
              {item.startedAt}
            </Typography.Text>
          </button>
        ))}
      </div>
    </div>
  );
}
