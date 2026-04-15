import { Button, Input, Select } from 'antd';

import type { FlowSelectorOption } from '../../lib/selector-options';
import { SelectorField } from './SelectorField';

interface StateWriteValue {
  path: string[];
  operator: 'set' | 'append' | 'clear' | 'increment';
  source: string[] | null;
}

interface StateWriteFieldProps {
  ariaLabel: string;
  value: StateWriteValue[];
  options: FlowSelectorOption[];
  onChange: (value: StateWriteValue[]) => void;
}

export function StateWriteField({
  ariaLabel,
  value,
  options,
  onChange
}: StateWriteFieldProps) {
  return (
    <div className="agent-flow-binding-list">
      {value.map((entry, index) => (
        <div key={`${entry.operator}-${index}`} className="agent-flow-binding-row">
          <Input
            aria-label={`${ariaLabel}-${index}-path`}
            placeholder="state.path"
            value={entry.path.join('.')}
            onChange={(event) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        path: event.target.value
                          .split('.')
                          .map((segment) => segment.trim())
                          .filter(Boolean)
                      }
                    : item
                )
              )
            }
          />
          <Select
            aria-label={`${ariaLabel}-${index}-operator`}
            options={[
              { label: 'Set', value: 'set' },
              { label: 'Append', value: 'append' },
              { label: 'Clear', value: 'clear' },
              { label: 'Increment', value: 'increment' }
            ]}
            value={entry.operator}
            onChange={(operator) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        operator: operator as 'set' | 'append' | 'clear' | 'increment'
                      }
                    : item
                )
              )
            }
          />
          <SelectorField
            ariaLabel={`${ariaLabel}-${index}-source`}
            options={options}
            value={entry.source ?? []}
            onChange={(nextValue) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        source:
                          (nextValue as string[]).length > 0
                            ? (nextValue as string[])
                            : null
                      }
                    : item
                )
              )
            }
          />
          <Button
            danger
            type="text"
            onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
          >
            删除
          </Button>
        </div>
      ))}
      <Button
        type="dashed"
        onClick={() =>
          onChange([...value, { path: [], operator: 'set', source: null }])
        }
      >
        新增操作
      </Button>
    </div>
  );
}
