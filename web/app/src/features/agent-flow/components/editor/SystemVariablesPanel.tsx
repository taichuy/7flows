import { CloseOutlined } from '@ant-design/icons';
import { Button, Tag, Typography } from 'antd';

import { agentFlowSystemVariables } from '../../lib/system-variables';

interface SystemVariablesPanelProps {
  onClose: () => void;
}

export function SystemVariablesPanel({ onClose }: SystemVariablesPanelProps) {
  return (
    <section
      aria-label="系统变量"
      className="agent-flow-editor__system-variables-panel"
    >
      <header className="agent-flow-editor__system-variables-header">
        <div className="agent-flow-editor__system-variables-heading">
          <Typography.Title level={3}>系统变量</Typography.Title>
          <Typography.Text type="secondary">
            系统变量是全局只读变量，可被画布内任意节点引用。
          </Typography.Text>
        </div>
        <Button
          aria-label="关闭系统变量"
          icon={<CloseOutlined />}
          type="text"
          onClick={onClose}
        />
      </header>
      <div className="agent-flow-editor__system-variables-list">
        {agentFlowSystemVariables.map((variable) => (
          <article
            className="agent-flow-editor__system-variable-row"
            key={variable.key}
          >
            <div className="agent-flow-editor__system-variable-main">
              <Typography.Text code>{variable.title}</Typography.Text>
              <Tag bordered={false}>{variable.valueType}</Tag>
            </div>
            <Typography.Text type="secondary">
              {variable.description}
            </Typography.Text>
          </article>
        ))}
      </div>
    </section>
  );
}
