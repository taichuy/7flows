import type { FlowNodeDocument } from '@1flowbase/flow-schema';
import { Button, Empty, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { SchemaAdapter } from '../../../../../shared/schema-ui/registry/create-renderer-registry';

import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';

export function NodeOutputContractCard({
  adapter
}: {
  adapter?: SchemaAdapter;
} = {}) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const selectedNode: FlowNodeDocument | null =
    (adapter?.getDerived('node') as FlowNodeDocument | null | undefined) ??
    (selectedNodeId
      ? (document.graph.nodes.find((node) => node.id === selectedNodeId) ??
        null)
      : null);

  if (!selectedNode) {
    return null;
  }

  // Use a customized title for the start node
  const title = selectedNode.type === 'start' ? '输入字段' : '输出变量';
  const outputs =
    (adapter?.getValue('config.output_contract') as
      | FlowNodeDocument['outputs']
      | undefined) ?? selectedNode.outputs;

  return (
    <div className="agent-flow-node-detail__section">
      <div className="agent-flow-node-detail__section-header">
        <Typography.Title
          level={5}
          className="agent-flow-node-detail__section-title"
        >
          {title}
        </Typography.Title>
        <Button type="text" icon={<PlusOutlined />} size="small" />
      </div>
      {outputs.length > 0 ? (
        <div className="agent-flow-node-detail__list">
          {outputs.map((output) => (
            <div key={output.key} className="agent-flow-node-detail__list-item">
              <div className="agent-flow-node-detail__list-item-left">
                <span className="agent-flow-node-detail__list-item-icon">
                  {'{x}'}
                </span>
                <span className="agent-flow-node-detail__list-item-name">
                  {output.key}
                </span>
              </div>
              <span className="agent-flow-node-detail__list-item-type">
                {output.valueType}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无字段" />
      )}
    </div>
  );
}
