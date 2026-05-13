import { useState } from 'react';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import { Typography } from 'antd';

import type { AgentFlowTraceItem } from '../../../api/runtime';
import { NodeRunPayloadSections } from '../../detail/last-run/NodeRunIOCard';
import { DebugWorkflowNodeItem, StatusIcon } from './DebugWorkflowNodeRow';
import { getTraceItemKey } from './debug-workflow-trace-utils';

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

export function DebugWorkflowProcess({
  items,
  onLoadArtifact
}: {
  items: AgentFlowTraceItem[];
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<Set<string>>(
    () => new Set()
  );

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
        <div className="agent-flow-editor__debug-workflow-collapse-list">
          {items.map((item) => {
            const itemKey = getTraceItemKey(item);
            const nodeExpanded = expandedNodeKeys.has(itemKey);

            return (
              <DebugWorkflowNodeItem
                key={itemKey}
                expanded={nodeExpanded}
                item={item}
                onToggle={() => {
                  setExpandedNodeKeys((current) => {
                    const next = new Set(current);

                    if (next.has(itemKey)) {
                      next.delete(itemKey);
                    } else {
                      next.add(itemKey);
                    }

                    return next;
                  });
                }}
              >
                <div className="agent-flow-editor__debug-workflow-node-detail">
                  <NodeRunPayloadSections
                    inputPayload={item.inputPayload}
                    debugPayload={item.debugPayload}
                    outputPayload={item.outputPayload}
                    onLoadArtifact={onLoadArtifact}
                  />
                </div>
              </DebugWorkflowNodeItem>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
