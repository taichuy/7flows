import { Input, InputNumber, Space, Switch, Tag, Typography } from 'antd';

import type { AgentFlowRunContext } from '../../api/runtime';

function renderFieldInput(
  field: AgentFlowRunContext['fields'][number],
  onChange: (value: unknown) => void
) {
  switch (field.valueType) {
    case 'boolean':
      return <Switch checked={Boolean(field.value)} onChange={onChange} />;
    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          value={typeof field.value === 'number' ? field.value : 0}
          onChange={(value) => onChange(value ?? 0)}
        />
      );
    case 'array':
    case 'json':
    case 'unknown':
      return (
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 4 }}
          value={
            typeof field.value === 'string'
              ? field.value
              : JSON.stringify(field.value ?? {}, null, 2)
          }
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'string':
    default:
      return (
        <Input
          value={typeof field.value === 'string' ? field.value : String(field.value ?? '')}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

export function RunContextPanel({
  runContext,
  onChangeValue
}: {
  runContext: AgentFlowRunContext;
  onChangeValue: (nodeId: string, key: string, value: unknown) => void;
}) {
  return (
    <section className="agent-flow-editor__debug-console-section">
      <div className="agent-flow-editor__debug-console-section-header">
        <Space direction="vertical" size={2}>
          <Typography.Text strong>Run Context</Typography.Text>
          <Typography.Text type="secondary">
            运行前输入与当前调试环境。
          </Typography.Text>
        </Space>
        <Space size={8} wrap>
          <Tag color="blue">draft</Tag>
          <Tag color={runContext.remembered ? 'green' : 'default'}>
            {runContext.remembered ? '复用上次输入' : '当前草稿默认值'}
          </Tag>
        </Space>
      </div>
      <div className="agent-flow-editor__debug-console-field-grid">
        {runContext.fields.map((field) => (
          <label
            key={`${field.nodeId}.${field.key}`}
            className="agent-flow-editor__debug-console-field"
          >
            <Typography.Text type="secondary">{field.title}</Typography.Text>
            {renderFieldInput(field, (value) =>
              onChangeValue(field.nodeId, field.key, value)
            )}
          </label>
        ))}
      </div>
    </section>
  );
}
