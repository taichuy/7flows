import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Select, Typography } from 'antd';

import type { FlowNodeDocument } from '@1flowbase/flow-schema';

const valueTypeOptions = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'json', label: 'JSON' },
  { value: 'unknown', label: 'Unknown' }
] satisfies Array<{
  value: FlowNodeDocument['outputs'][number]['valueType'];
  label: string;
}>;

function createNextOutput(index: number): FlowNodeDocument['outputs'][number] {
  const key = `output_${index + 1}`;

  return {
    key,
    title: key,
    valueType: 'string'
  };
}

export function OutputContractDefinitionField({
  value,
  onChange
}: {
  value: FlowNodeDocument['outputs'];
  onChange: (value: FlowNodeDocument['outputs']) => void;
}) {
  return (
    <div className="agent-flow-output-contract-editor">
      <div className="agent-flow-output-contract-editor__header">
        <Typography.Text className="agent-flow-node-detail__section-subtitle">
          节点产出的变量可被下游节点引用
        </Typography.Text>
        <Button
          aria-label="新增输出变量"
          icon={<PlusOutlined />}
          size="small"
          type="text"
          onClick={() => onChange([...value, createNextOutput(value.length)])}
        />
      </div>
      {value.length > 0 ? (
        <div className="agent-flow-output-contract-editor__list">
          {value.map((output, index) => (
            <div
              key={`${output.key}-${index}`}
              className="agent-flow-output-contract-editor__row"
            >
              <label className="agent-flow-output-contract-editor__cell">
                <span>变量名</span>
                <Input
                  aria-label={`输出变量名 ${index + 1}`}
                  value={output.key}
                  onChange={(event) =>
                    onChange(
                      value.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, key: event.target.value }
                          : candidate
                      )
                    )
                  }
                />
              </label>
              <label className="agent-flow-output-contract-editor__cell">
                <span>显示名</span>
                <Input
                  aria-label={`输出显示名 ${index + 1}`}
                  value={output.title}
                  onChange={(event) =>
                    onChange(
                      value.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, title: event.target.value }
                          : candidate
                      )
                    )
                  }
                />
              </label>
              <label className="agent-flow-output-contract-editor__cell">
                <span>类型</span>
                <Select
                  aria-label={`输出类型 ${index + 1}`}
                  options={valueTypeOptions}
                  value={output.valueType}
                  onChange={(valueType) =>
                    onChange(
                      value.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, valueType }
                          : candidate
                      )
                    )
                  }
                />
              </label>
              <Button
                aria-label={`删除输出变量 ${output.key || index + 1}`}
                className="agent-flow-output-contract-editor__delete"
                danger
                icon={<DeleteOutlined />}
                size="small"
                type="text"
                onClick={() =>
                  onChange(
                    value.filter((_, outputIndex) => outputIndex !== index)
                  )
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无输出变量"
        />
      )}
    </div>
  );
}
