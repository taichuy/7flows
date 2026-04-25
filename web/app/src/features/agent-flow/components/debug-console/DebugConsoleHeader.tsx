import {
  ClearOutlined,
  CloseOutlined,
  PauseCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';

import type { AgentFlowDebugSessionStatus } from '../../hooks/runtime/useAgentFlowDebugSession';

function statusMeta(status: AgentFlowDebugSessionStatus) {
  switch (status) {
    case 'completed':
      return { color: 'green', label: '已完成' };
    case 'failed':
      return { color: 'red', label: '失败' };
    case 'cancelled':
      return { color: 'default', label: '已停止' };
    case 'waiting_callback':
      return { color: 'cyan', label: '等待回调' };
    case 'waiting_human':
      return { color: 'gold', label: '等待人工' };
    case 'running':
      return { color: 'blue', label: '运行中' };
    default:
      return { color: 'default', label: '空闲' };
  }
}

export function DebugConsoleHeader({
  status,
  clearDisabled,
  rerunDisabled,
  stopDisabled,
  onClear,
  onClose,
  onRerun,
  onStop
}: {
  status: AgentFlowDebugSessionStatus;
  clearDisabled: boolean;
  rerunDisabled: boolean;
  stopDisabled: boolean;
  onClear: () => void;
  onClose: () => void;
  onRerun: () => void;
  onStop: () => void;
}) {
  const resolvedStatus = statusMeta(status);

  return (
    <div className="agent-flow-editor__debug-console-header">
      <Space direction="vertical" size={2}>
        <Space size={8} wrap>
          <Typography.Text strong>调试控制台</Typography.Text>
          <Tag color={resolvedStatus.color}>{resolvedStatus.label}</Tag>
        </Space>
        <Typography.Text type="secondary">
          在当前编排页内查看整流输入、运行结果和执行轨迹。
        </Typography.Text>
      </Space>
      <Space size={4} wrap>
        <Button
          disabled={rerunDisabled}
          icon={<ReloadOutlined />}
          size="small"
          onClick={onRerun}
        >
          重新运行
        </Button>
        <Button
          disabled={stopDisabled}
          icon={<PauseCircleOutlined />}
          size="small"
          onClick={onStop}
        >
          停止运行
        </Button>
        <Button
          disabled={clearDisabled}
          icon={<ClearOutlined />}
          size="small"
          onClick={onClear}
        >
          清空
        </Button>
        <Button
          aria-label="关闭调试控制台"
          icon={<CloseOutlined />}
          size="small"
          type="text"
          onClick={onClose}
        />
      </Space>
    </div>
  );
}
