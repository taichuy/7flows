import { Button, Card, Select, Space, Switch } from 'antd';

import { useInspectorInteractions } from '../../../hooks/interactions/use-inspector-interactions';
import { useNodeInteractions } from '../../../hooks/interactions/use-node-interactions';
import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';

export function NodePolicySection() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const { updateField } = useInspectorInteractions();
  const { openNodePicker } = useNodeInteractions();
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;

  if (!selectedNode || !selectedNodeId) {
    return null;
  }

  return (
    <div className="agent-flow-node-detail__policies">
      <Space direction="vertical" size={12}>
        <Card title="失败重试">
          <Switch
            checked={Boolean(selectedNode.config.retry_enabled)}
            onChange={(checked) => updateField('config.retry_enabled', checked)}
          />
        </Card>
        <Card title="异常处理">
          <Select
            options={[
              { value: 'fail', label: '直接失败' },
              { value: 'ignore', label: '忽略并继续' }
            ]}
            value={(selectedNode.config.error_policy as string | undefined) ?? 'fail'}
            onChange={(value) => updateField('config.error_policy', value)}
          />
        </Card>
        <Card title="下一步">
          <Button onClick={() => openNodePicker(selectedNodeId)}>
            添加下一个节点
          </Button>
        </Card>
      </Space>
    </div>
  );
}
