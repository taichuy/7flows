import { Empty, Typography } from 'antd';

import type { AgentFlowVariableGroup } from '../../../api/runtime';

function formatValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

export function DebugVariablesPane({
  groups
}: {
  groups: AgentFlowVariableGroup[];
}) {
  if (groups.length === 0) {
    return (
      <div className="agent-flow-editor__debug-console-pane">
        <Empty description="当前还没有变量快照" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  return (
    <div className="agent-flow-editor__debug-console-pane agent-flow-editor__debug-variables-pane">
      {groups.map((group) => (
        <section
          key={group.title}
          className="agent-flow-editor__debug-variable-group"
        >
          <Typography.Text strong>{group.title}</Typography.Text>
          <div className="agent-flow-editor__debug-variable-list">
            {group.items.map((item) => (
              <div
                key={item.key}
                className="agent-flow-editor__debug-variable-item"
              >
                <Typography.Text type="secondary">{item.label}</Typography.Text>
                <pre>{formatValue(item.value)}</pre>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
