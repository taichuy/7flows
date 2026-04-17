import { Select, Switch, Typography } from 'antd';

import { useInspectorInteractions } from '../../../hooks/interactions/use-inspector-interactions';
import { useAgentFlowEditorStore } from '../../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../../store/editor/selectors';

export function NodePolicySection() {
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const { updateField } = useInspectorInteractions();
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;

  if (!selectedNode || !selectedNodeId) {
    return null;
  }

  const errorPolicyOptions = [
    {
      value: 'none',
      label: '无',
      description: '当发生异常且未处理时，节点将停止运行'
    },
    {
      value: 'default_value',
      label: '默认值',
      description: '当发生异常时，指定默认输出内容。'
    },
    {
      value: 'error_branch',
      label: '异常分支',
      description: '当发生异常时，将执行异常分支'
    }
  ] satisfies Array<{
    value: string;
    label: string;
    description: string;
  }>;

  return (
    <div className="agent-flow-node-detail__policies">
      <div className="agent-flow-node-detail__policy-row" data-testid="node-policy-row">
        <Typography.Text className="agent-flow-node-detail__policy-label">
          失败重试
        </Typography.Text>
        <Switch
          aria-label="失败重试"
          checked={Boolean(selectedNode.config.retry_enabled)}
          className="agent-flow-node-detail__policy-control"
          onChange={(checked) => updateField('config.retry_enabled', checked)}
        />
      </div>
      <div
        className="agent-flow-node-detail__policy-row agent-flow-node-detail__policy-row--stacked"
        data-testid="node-policy-row"
      >
        <Typography.Text className="agent-flow-node-detail__policy-label">
          异常处理
        </Typography.Text>
        <div
          className="agent-flow-node-detail__policy-select-shell"
          data-testid="node-policy-error"
        >
          <Select
            aria-label="异常处理"
            className="agent-flow-node-detail__policy-control agent-flow-node-detail__policy-select"
            options={errorPolicyOptions}
            optionRender={(option) => {
              const policy = option.data as (typeof errorPolicyOptions)[number];

              return (
                <div className="agent-flow-node-detail__policy-option">
                  <div className="agent-flow-node-detail__policy-option-title">
                    {policy.label}
                  </div>
                  <div className="agent-flow-node-detail__policy-option-description">
                    {policy.description}
                  </div>
                </div>
              );
            }}
            classNames={{
              popup: {
                root: 'agent-flow-node-detail__policy-dropdown'
              }
            }}
            popupMatchSelectWidth={false}
            value={(selectedNode.config.error_policy as string | undefined) ?? 'none'}
            onChange={(value) => updateField('config.error_policy', value)}
          />
        </div>
      </div>
    </div>
  );
}
