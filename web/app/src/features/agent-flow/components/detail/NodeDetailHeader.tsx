import { CloseOutlined } from '@ant-design/icons';
import { Button, Space, Typography } from 'antd';

import { nodeDefinitions } from '../../lib/node-definitions';
import { useNodeDetailActions } from '../../hooks/interactions/use-node-detail-actions';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';
import { NodeActionMenu } from './NodeActionMenu';
import { NodeRunButton } from './NodeRunButton';

export function NodeDetailHeader({
  onClose,
  onRunNode
}: {
  onClose: () => void;
  onRunNode?: (() => void) | undefined;
}) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const definition = selectedNode ? nodeDefinitions[selectedNode.type] ?? null : null;
  const detailActions = useNodeDetailActions();

  if (!selectedNode || !definition) {
    return null;
  }

  return (
    <header className="agent-flow-node-detail__header">
      <div className="agent-flow-node-detail__header-main">
        <Typography.Title level={4}>{definition.label}</Typography.Title>
        <Typography.Text type="secondary">{selectedNode.alias}</Typography.Text>
      </div>
      <Space size={4}>
        <NodeRunButton onRunNode={onRunNode} />
        <NodeActionMenu
          onLocate={detailActions.locateSelectedNode}
          onCopy={detailActions.duplicateSelectedNode}
        />
        <Button
          aria-label="关闭节点详情"
          icon={<CloseOutlined />}
          type="text"
          onClick={onClose}
        />
      </Space>
    </header>
  );
}
