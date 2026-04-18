import { Button, Input, Select, Space, Typography } from 'antd';

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

export function OutputContractDefinitionField({
  value,
  onChange
}: {
  value: FlowNodeDocument['outputs'];
  onChange: (value: FlowNodeDocument['outputs']) => void;
}) {
  return (
    <div className="agent-flow-output-contract-editor">
      <Space direction="vertical" size={12}>
        {value.map((output, index) => (
          <Space
            key={`${output.key}-${index}`}
            align="start"
            className="agent-flow-output-contract-editor__row"
          >
            <div>
              <Typography.Text strong>变量名</Typography.Text>
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
            </div>
            <div>
              <Typography.Text strong>显示名</Typography.Text>
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
            </div>
            <div>
              <Typography.Text strong>类型</Typography.Text>
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
            </div>
          </Space>
        ))}
        <Button onClick={() => onChange([...value, { key: '', title: '', valueType: 'string' }])}>
          新增输出变量
        </Button>
      </Space>
    </div>
  );
}
