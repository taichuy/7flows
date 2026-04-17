import { Typography } from 'antd';
import { HomeOutlined, PlusOutlined } from '@ant-design/icons';

import {
  getDirectDownstreamNodes
} from '../../../lib/document/relations';
import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';
import { useNodeInteractions } from '../../../hooks/interactions/use-node-interactions';

export function NodeRelationsCard() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const { openNodePicker } = useNodeInteractions();

  if (!selectedNodeId) {
    return null;
  }

  const downstreamNodes = getDirectDownstreamNodes(document, selectedNodeId);

  return (
    <div className="agent-flow-node-detail__section">
      <Typography.Title level={5} className="agent-flow-node-detail__section-title">
        下一步
      </Typography.Title>
      <Typography.Text className="agent-flow-node-detail__section-subtitle">
        添加此工作流程中的下一个节点
      </Typography.Text>

      <div className="agent-flow-node-detail__relation-list" style={{ marginTop: 12 }}>
        <div className="agent-flow-node-detail__relation-source">
          <HomeOutlined />
        </div>
        <div className="agent-flow-node-detail__relation-line" />
        <div className="agent-flow-node-detail__relation-nodes">
          {downstreamNodes.map((node) => (
            <div key={node.id} className="agent-flow-node-detail__relation-item">
              <div className="agent-flow-node-detail__relation-item-icon">
                <HomeOutlined style={{ fontSize: 12 }} />
              </div>
              {node.alias}
            </div>
          ))}
          <div 
            className="agent-flow-node-detail__relation-add"
            onClick={() => openNodePicker(selectedNodeId)}
          >
            <PlusOutlined /> 添加并行节点
          </div>
        </div>
      </div>
    </div>
  );
}
