import {
  CopyOutlined,
  EyeOutlined,
  PartitionOutlined
} from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { useState } from 'react';

import type { AgentFlowDebugMessage } from '../../../api/runtime';
import { DebugTraceSummary } from './DebugTraceSummary';

function statusColor(status: AgentFlowDebugMessage['status']) {
  switch (status) {
    case 'completed':
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

function statusLabel(status: AgentFlowDebugMessage['status']) {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已停止';
    case 'waiting_callback':
      return '等待回调';
    case 'waiting_human':
      return '等待人工';
    default:
      return '运行中';
  }
}

function fallbackContent(message: AgentFlowDebugMessage) {
  if (message.status === 'running') {
    return '运行中...';
  }

  if (message.status === 'waiting_human') {
    return '等待人工介入。';
  }

  if (message.status === 'waiting_callback') {
    return '等待外部回调。';
  }

  if (message.status === 'cancelled') {
    return '已停止运行。';
  }

  if (message.status === 'failed') {
    return '调试运行失败。';
  }

  return '暂无输出。';
}

export function DebugAssistantMessage({
  message,
  onViewTrace,
  onSelectTraceNode
}: {
  message: AgentFlowDebugMessage;
  onViewTrace: () => void;
  onSelectTraceNode: (nodeId: string) => void;
}) {
  const [showRawOutput, setShowRawOutput] = useState(false);

  async function handleCopyOutput() {
    if (!message.content) {
      return;
    }

    await navigator.clipboard.writeText(message.content);
  }

  return (
    <article className="agent-flow-editor__debug-message agent-flow-editor__debug-message--assistant">
      <div className="agent-flow-editor__debug-message-header">
        <Typography.Text strong>Assistant</Typography.Text>
        <Tag color={statusColor(message.status)}>{statusLabel(message.status)}</Tag>
      </div>
      <DebugTraceSummary
        items={message.traceSummary}
        onSelectNode={(nodeId) => {
          onViewTrace();
          onSelectTraceNode(nodeId);
        }}
      />
      <Typography.Paragraph className="agent-flow-editor__debug-message-content">
        {message.content || fallbackContent(message)}
      </Typography.Paragraph>
      <Space size={8} wrap>
        <Button
          disabled={!message.content}
          icon={<CopyOutlined />}
          size="small"
          onClick={() => {
            void handleCopyOutput();
          }}
        >
          复制输出
        </Button>
        <Button
          disabled={message.traceSummary.length === 0}
          icon={<PartitionOutlined />}
          size="small"
          onClick={onViewTrace}
        >
          查看 Trace
        </Button>
        <Button
          disabled={!message.rawOutput}
          icon={<EyeOutlined />}
          size="small"
          onClick={() => setShowRawOutput((current) => !current)}
        >
          查看 Raw Output
        </Button>
      </Space>
      {showRawOutput && message.rawOutput ? (
        <pre className="agent-flow-editor__debug-raw-output">
          {JSON.stringify(message.rawOutput, null, 2)}
        </pre>
      ) : null}
    </article>
  );
}
