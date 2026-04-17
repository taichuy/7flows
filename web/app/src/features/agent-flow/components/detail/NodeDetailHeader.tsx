import { BookOutlined, CloseOutlined, HomeOutlined } from '@ant-design/icons';
import { Button, Divider, Input, Space } from 'antd';

import { nodeDefinitions } from '../../lib/node-definitions';
import { useNodeDetailActions } from '../../hooks/interactions/use-node-detail-actions';
import { useInspectorInteractions } from '../../hooks/interactions/use-inspector-interactions';
import { getNodeDefinitionMeta } from '../../lib/node-definitions';
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
  const definitionMeta = selectedNode
    ? getNodeDefinitionMeta(selectedNode.type)
    : null;
  const detailActions = useNodeDetailActions();
  const { updateField } = useInspectorInteractions();

  if (!selectedNode || !definition || !definitionMeta) {
    return null;
  }

  return (
    <header
      className="agent-flow-node-detail__header"
      data-testid="node-detail-header"
    >
      <div className="agent-flow-node-detail__header-top">
        <div className="agent-flow-node-detail__title-section">
          <div className="agent-flow-node-detail__icon-wrapper">
            <HomeOutlined />
          </div>
          <Input
            aria-label="节点别名"
            className="agent-flow-editor__inspector-title-input"
            value={selectedNode.alias}
            onChange={(event) => updateField('alias', event.target.value)}
          />
        </div>
        <Space className="agent-flow-node-detail__actions" size={4}>
          <NodeRunButton onRunNode={onRunNode} />
          {definitionMeta.helpHref ? (
            <Button
              aria-label="帮助文档"
              href={definitionMeta.helpHref}
              icon={<BookOutlined />}
              target="_blank"
              type="text"
            />
          ) : null}
          <NodeActionMenu
            onLocate={detailActions.locateSelectedNode}
            onCopy={detailActions.duplicateSelectedNode}
          />
          <Divider type="vertical" className="agent-flow-node-detail__divider" />
          <Button
            aria-label="关闭节点详情"
            icon={<CloseOutlined />}
            type="text"
            onClick={onClose}
          />
        </Space>
      </div>
      <Input.TextArea
        aria-label="节点简介"
        autoSize={{ minRows: 1, maxRows: 3 }}
        className="agent-flow-editor__inspector-description-input"
        placeholder="添加描述..."
        value={selectedNode.description ?? ''}
        onChange={(event) => updateField('description', event.target.value)}
      />
    </header>
  );
}
