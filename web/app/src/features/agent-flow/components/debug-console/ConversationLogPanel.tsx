import { useEffect, useState } from 'react';
import { Descriptions, Empty, Space, Tabs, Typography } from 'antd';

import type { AgentFlowDebugMessage } from '../../api/runtime';
import { AgentFlowDockPanel } from '../editor/AgentFlowDockPanel';
import { NodeRunPayloadSections } from '../detail/last-run/NodeRunIOCard';
import {
  DebugWorkflowNodeItem,
  NodeTypeIcon
} from './conversation/DebugWorkflowNodeRow';
import {
  getTraceItemKey,
  nodeDisplayName
} from './conversation/debug-workflow-trace-utils';
import './conversation-log-panel.css';

function buildDetailInput(message: AgentFlowDebugMessage) {
  const firstTraceItem = message.traceSummary[0];

  if (firstTraceItem && Object.keys(firstTraceItem.inputPayload).length > 0) {
    return firstTraceItem.inputPayload;
  }

  if (firstTraceItem && Object.keys(firstTraceItem.outputPayload).length > 0) {
    return firstTraceItem.outputPayload;
  }

  return {};
}

function buildDetailOutput(message: AgentFlowDebugMessage) {
  if (message.rawOutput) {
    return message.rawOutput;
  }

  const lastTraceItem = message.traceSummary.at(-1);

  if (lastTraceItem && Object.keys(lastTraceItem.outputPayload).length > 0) {
    return lastTraceItem.outputPayload;
  }

  return {
    answer: message.content
  };
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function ConversationLogDetail({
  message,
  onLoadArtifact
}: {
  message: AgentFlowDebugMessage;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
}) {
  const firstTraceItem = message.traceSummary[0] ?? null;
  const lastTraceItem = message.traceSummary.at(-1) ?? null;

  return (
    <div className="agent-flow-editor__conversation-log-tab">
      <div className="agent-flow-editor__conversation-log-json-list">
        <NodeRunPayloadSections
          debugPayload={{}}
          includeDebugPayload={false}
          inputPayload={buildDetailInput(message)}
          outputPayload={buildDetailOutput(message)}
          onLoadArtifact={onLoadArtifact}
        />
      </div>
      <section
        aria-label="元数据"
        className="agent-flow-editor__conversation-log-metadata"
      >
        <Typography.Text strong>元数据</Typography.Text>
        <Descriptions
          column={1}
          items={[
            {
              key: 'runId',
              label: '运行 ID',
              children: message.runId ?? '—'
            },
            {
              key: 'status',
              label: '状态',
              children: message.status
            },
            {
              key: 'nodeCount',
              label: '节点数',
              children: `${message.traceSummary.length}`
            },
            {
              key: 'startedAt',
              label: '开始时间',
              children: formatTimestamp(firstTraceItem?.startedAt)
            },
            {
              key: 'finishedAt',
              label: '结束时间',
              children: formatTimestamp(lastTraceItem?.finishedAt)
            }
          ]}
          size="small"
        />
      </section>
    </div>
  );
}

function ConversationTrace({
  message,
  onLoadArtifact
}: {
  message: AgentFlowDebugMessage;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
}) {
  const [expandedNodeKey, setExpandedNodeKey] = useState<string | null>(null);

  useEffect(() => {
    setExpandedNodeKey(null);
  }, [message.id]);

  if (message.traceSummary.length === 0) {
    return (
      <div className="agent-flow-editor__conversation-log-empty">
        <Empty
          description="暂无追踪记录"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <div className="agent-flow-editor__conversation-log-trace">
      <div
        aria-label="追踪节点"
        className="agent-flow-editor__conversation-log-node-list"
      >
        {message.traceSummary.map((item) => {
          const itemKey = getTraceItemKey(item);
          const nodeExpanded = itemKey === expandedNodeKey;

          return (
            <DebugWorkflowNodeItem
              key={itemKey}
              expanded={nodeExpanded}
              item={item}
              selected={nodeExpanded}
              onToggle={() =>
                setExpandedNodeKey((current) =>
                  current === itemKey ? null : itemKey
                )
              }
            >
              <section
                aria-label={`${nodeDisplayName(item)} 节点详情`}
                className="agent-flow-editor__conversation-log-node-detail"
              >
                <div className="agent-flow-editor__conversation-log-node-detail-header">
                  <Space size={8}>
                    <NodeTypeIcon nodeType={item.nodeType} />
                    <Typography.Text strong>
                      {nodeDisplayName(item)}
                    </Typography.Text>
                  </Space>
                  <Typography.Text type="secondary">
                    {item.nodeType}
                  </Typography.Text>
                </div>
                <div className="agent-flow-editor__conversation-log-json-list">
                  <NodeRunPayloadSections
                    debugPayload={item.debugPayload ?? {}}
                    inputPayload={item.inputPayload}
                    outputPayload={item.outputPayload}
                    onLoadArtifact={onLoadArtifact}
                  />
                </div>
              </section>
            </DebugWorkflowNodeItem>
          );
        })}
      </div>
    </div>
  );
}

export function ConversationLogPanel({
  message,
  onClose,
  onLoadArtifact
}: {
  message: AgentFlowDebugMessage;
  onClose: () => void;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
}) {
  return (
    <AgentFlowDockPanel
      bodyClassName="agent-flow-editor__conversation-log-body"
      className="agent-flow-editor__conversation-log-panel"
      closeLabel="关闭对话日志"
      title="对话日志"
      onClose={onClose}
    >
      <Tabs
        className="agent-flow-editor__conversation-log-tabs"
        items={[
          {
            key: 'detail',
            label: '详情',
            children: (
              <ConversationLogDetail
                message={message}
                onLoadArtifact={onLoadArtifact}
              />
            )
          },
          {
            key: 'trace',
            label: '追踪',
            children: (
              <ConversationTrace
                message={message}
                onLoadArtifact={onLoadArtifact}
              />
            )
          }
        ]}
      />
    </AgentFlowDockPanel>
  );
}
