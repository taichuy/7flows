import {
  CheckCircleFilled,
  DownOutlined,
  LoadingOutlined,
  RightOutlined,
  WarningFilled
} from '@ant-design/icons';
import { Tag, Typography } from 'antd';
import type { ReactNode } from 'react';

import type { AgentFlowTraceItem } from '../../../api/runtime';
import { getAgentFlowNodeTypeIcon } from '../../../lib/node-type-icons';
import { nodeDisplayName } from './debug-workflow-trace-utils';
import './debug-message.css';

function statusTone(status: string) {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    case 'waiting_human':
    case 'waiting_callback':
      return 'warning';
    default:
      return 'running';
  }
}

function readOutputTotalTokens(outputPayload: unknown) {
  if (
    !outputPayload ||
    typeof outputPayload !== 'object' ||
    Array.isArray(outputPayload)
  ) {
    return null;
  }

  const usage = (outputPayload as Record<string, unknown>).usage;

  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null;
  }

  const totalTokens = (usage as Record<string, unknown>).total_tokens;
  return typeof totalTokens === 'number' ? totalTokens : null;
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1000;
  const roundedSeconds = Math.round(seconds * 10) / 10;
  return `${Number.isInteger(roundedSeconds) ? roundedSeconds.toFixed(0) : roundedSeconds.toFixed(1)} s`;
}

function metricText(item: AgentFlowTraceItem) {
  const tokens = readOutputTotalTokens(item.outputPayload);
  const duration =
    item.durationMs == null ? null : formatDuration(item.durationMs);

  if (typeof tokens === 'number' && duration) {
    return `${tokens} tokens · ${duration}`;
  }

  if (typeof tokens === 'number') {
    return `${tokens} tokens`;
  }

  if (duration) {
    return duration;
  }

  return '进行中';
}

export function StatusIcon({ status }: { status: string }) {
  const tone = statusTone(status);

  if (tone === 'running') {
    return (
      <LoadingOutlined
        aria-label={`${status} 状态`}
        className="agent-flow-editor__debug-workflow-status-icon"
        spin
      />
    );
  }

  if (tone === 'error' || tone === 'warning') {
    return (
      <WarningFilled
        aria-label={`${status} 状态`}
        className={`agent-flow-editor__debug-workflow-status-icon agent-flow-editor__debug-workflow-status-icon--${tone}`}
      />
    );
  }

  return (
    <CheckCircleFilled
      aria-label={`${status} 状态`}
      className={`agent-flow-editor__debug-workflow-status-icon agent-flow-editor__debug-workflow-status-icon--${tone}`}
    />
  );
}

export function NodeTypeIcon({ nodeType }: { nodeType: string }) {
  return (
    <span
      aria-label={`${nodeType} 节点类型`}
      className="agent-flow-editor__debug-workflow-node-icon"
      role="img"
    >
      {getAgentFlowNodeTypeIcon(nodeType)}
    </span>
  );
}

export function DebugWorkflowNodeRow({ item }: { item: AgentFlowTraceItem }) {
  return (
    <span
      className="agent-flow-editor__debug-workflow-row"
      data-testid="debug-workflow-node-row"
    >
      <NodeTypeIcon nodeType={item.nodeType} />
      <span className="agent-flow-editor__debug-workflow-node-main">
        <Typography.Text strong>{nodeDisplayName(item)}</Typography.Text>
        <Typography.Text
          className="agent-flow-editor__debug-workflow-metric"
          type="secondary"
        >
          {metricText(item)}
        </Typography.Text>
      </span>
      <Tag className="agent-flow-editor__debug-workflow-node-type">
        {item.nodeType}
      </Tag>
      <StatusIcon status={item.status} />
    </span>
  );
}

export function DebugWorkflowNodeItem({
  item,
  expanded,
  selected = false,
  children,
  onToggle
}: {
  item: AgentFlowTraceItem;
  expanded: boolean;
  selected?: boolean;
  children: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div
      className="agent-flow-editor__debug-workflow-node-item"
      data-expanded={expanded ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        aria-expanded={expanded}
        className="agent-flow-editor__debug-workflow-node-trigger"
        onClick={onToggle}
        type="button"
      >
        <DebugWorkflowNodeRow item={item} />
        {expanded ? (
          <DownOutlined className="agent-flow-editor__debug-workflow-collapse" />
        ) : (
          <RightOutlined className="agent-flow-editor__debug-workflow-collapse" />
        )}
      </button>
      {expanded ? children : null}
    </div>
  );
}
