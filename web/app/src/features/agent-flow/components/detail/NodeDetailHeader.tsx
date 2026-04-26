import { BookOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Divider, Space } from 'antd';

import type { CanvasNodeSchema } from '../../../../shared/schema-ui/contracts/canvas-node-schema';
import { SchemaRenderer } from '../../../../shared/schema-ui/runtime/SchemaRenderer';
import type { SchemaAdapter } from '../../../../shared/schema-ui/registry/create-renderer-registry';

import { agentFlowRendererRegistry } from '../../schema/agent-flow-renderer-registry';
import { useNodeDetailActions } from '../../hooks/interactions/use-node-detail-actions';
import { NodeActionMenu } from './NodeActionMenu';
import { NodeRunButton } from './NodeRunButton';
import { getAgentFlowNodeTypeIcon } from '../../lib/node-type-icons';

function findHeaderField(
  schema: CanvasNodeSchema,
  path: string
) {
  return schema.detail.header.blocks.find(
    (block) => block.kind === 'field' && block.path === path
  );
}

export function NodeDetailHeader({
  schema,
  adapter,
  onClose,
  onRunNode,
  runLoading = false
}: {
  schema: CanvasNodeSchema;
  adapter: SchemaAdapter;
  onClose: () => void;
  onRunNode?: (() => void) | undefined;
  runLoading?: boolean;
}) {
  const definitionMeta = adapter.getDerived('definitionMeta') as
    | { helpHref?: string | null }
    | null
    | undefined;
  const node = adapter.getDerived('node') as
    | { type?: string | null }
    | null
    | undefined;
  const nodeTypeIcon = node?.type ? getAgentFlowNodeTypeIcon(node.type) : null;
  const detailActions = useNodeDetailActions();
  const aliasField = findHeaderField(schema, 'alias');
  const descriptionField = findHeaderField(schema, 'description');

  return (
    <header
      className="agent-flow-node-detail__header"
      data-testid="node-detail-header"
    >
      <div className="agent-flow-node-detail__header-top">
        <div className="agent-flow-node-detail__title-section">
          <div className="agent-flow-node-detail__icon-wrapper">
            {nodeTypeIcon}
          </div>
          {aliasField ? (
            <SchemaRenderer
              adapter={adapter}
              blocks={[aliasField]}
              registry={agentFlowRendererRegistry}
            />
          ) : null}
        </div>
        <Space className="agent-flow-node-detail__actions" size={4}>
          <NodeRunButton onRunNode={onRunNode} loading={runLoading} />
          {definitionMeta?.helpHref ? (
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
            onDelete={detailActions.deleteSelectedNode}
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
      {descriptionField ? (
        <SchemaRenderer
          adapter={adapter}
          blocks={[descriptionField]}
          registry={agentFlowRendererRegistry}
        />
      ) : null}
    </header>
  );
}
