import { Button, Empty, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';

export function NodeOutputContractCard() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;

  if (!selectedNode) {
    return null;
  }

  // Use a customized title for the start node
  const title = selectedNode.type === 'start' ? '输入字段' : '输出变量';
  const subtitle = selectedNode.type === 'start' ? '设置的输入可在工作流程中使用' : '节点产出的数据字段';

  return (
    <div className="agent-flow-node-detail__section">
      <div className="agent-flow-node-detail__section-header">
        <Typography.Title level={5} className="agent-flow-node-detail__section-title">
          {title}
        </Typography.Title>
        <Button type="text" icon={<PlusOutlined />} size="small" />
      </div>
      <Typography.Text className="agent-flow-node-detail__section-subtitle" style={{ display: 'block', textAlign: 'center', marginBottom: 16 }}>
        {subtitle}
      </Typography.Text>
      
      {selectedNode.outputs.length > 0 ? (
        <div className="agent-flow-node-detail__list">
          {selectedNode.outputs.map((output) => (
            <div key={output.key} className="agent-flow-node-detail__list-item">
              <div className="agent-flow-node-detail__list-item-left">
                <span className="agent-flow-node-detail__list-item-icon">{'{x}'}</span>
                <span className="agent-flow-node-detail__list-item-name">{output.key}</span>
              </div>
              <span className="agent-flow-node-detail__list-item-type">{output.valueType}</span>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无字段"
        />
      )}
    </div>
  );
}
