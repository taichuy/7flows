import { useState } from 'react';
import {
  CheckCircleFilled,
  DownOutlined,
  LoadingOutlined,
  RightOutlined,
  WarningFilled
} from '@ant-design/icons';
import { Collapse, Tag, Typography } from 'antd';

import type { AgentFlowTraceItem } from '../../../api/runtime';
import { NodeRunPayloadSections } from '../../detail/last-run/NodeRunIOCard';
import { getAgentFlowNodeTypeIcon } from '../../../lib/node-type-icons';

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

function workflowStatus(items: AgentFlowTraceItem[]) {
  if (items.some((item) => item.status === 'failed')) {
    return 'failed';
  }

  if (items.some((item) => item.status === 'waiting_human')) {
    return 'waiting_human';
  }

  if (items.some((item) => item.status === 'waiting_callback')) {
    return 'waiting_callback';
  }

  if (items.some((item) => item.status === 'running')) {
    return 'running';
  }

  if (items.every((item) => item.status === 'succeeded')) {
    return 'succeeded';
  }

  return 'running';
}

function nodeDisplayName(item: AgentFlowTraceItem) {
  if (item.nodeType === 'start') {
    return '用户输入';
  }

  if (item.nodeType === 'answer') {
    return '直接回复';
  }

  return item.nodeAlias;
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

function metricText(item: AgentFlowTraceItem) {
  const tokens = readOutputTotalTokens(item.outputPayload);
  const duration = item.durationMs == null ? null : `${item.durationMs} ms`;

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

function StatusIcon({ status }: { status: string }) {
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

function NodeTypeIcon({ nodeType }: { nodeType: string }) {
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

export function DebugWorkflowProcess({
  items,
  onLoadArtifact
}: {
  items: AgentFlowTraceItem[];
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(true);

  if (items.length === 0) {
    return null;
  }

  const status = workflowStatus(items);

  return (
    <div
      aria-label="工作流"
      className="agent-flow-editor__debug-workflow-process"
      role="group"
    >
      <button
        aria-expanded={expanded}
        className="agent-flow-editor__debug-workflow-header"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="agent-flow-editor__debug-workflow-title">
          <StatusIcon status={status} />
          <Typography.Text>工作流</Typography.Text>
        </span>
        {expanded ? (
          <DownOutlined className="agent-flow-editor__debug-workflow-collapse" />
        ) : (
          <RightOutlined className="agent-flow-editor__debug-workflow-collapse" />
        )}
      </button>
      {expanded ? (
        <Collapse
          bordered={false}
          className="agent-flow-editor__debug-workflow-collapse-list"
          expandIconPosition="end"
          items={items.map((item) => {
            return {
              key: item.nodeRunId ?? item.nodeId,
              label: (
                <span className="agent-flow-editor__debug-workflow-row">
                  <NodeTypeIcon nodeType={item.nodeType} />
                  <span className="agent-flow-editor__debug-workflow-node-main">
                    <Typography.Text strong>
                      {nodeDisplayName(item)}
                    </Typography.Text>
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
              ),
              children: (
                <div className="agent-flow-editor__debug-workflow-node-detail">
                  <NodeRunPayloadSections
                    inputPayload={item.inputPayload}
                    debugPayload={item.debugPayload}
                    outputPayload={item.outputPayload}
                    onLoadArtifact={onLoadArtifact}
                  />
                </div>
              )
            };
          })}
        />
      ) : null}
    </div>
  );
}
