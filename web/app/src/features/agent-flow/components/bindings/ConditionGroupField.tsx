import { Button, Input, Select } from 'antd';

import type { FlowSelectorOption } from '../../lib/selector-options';
import { SelectorField } from './SelectorField';

interface ConditionGroupFieldValue {
  operator: 'and' | 'or';
  conditions: Array<{
    left: string[];
    comparator: 'exists' | 'equals' | 'contains';
    right?: string | string[];
  }>;
}

interface ConditionGroupFieldProps {
  ariaLabel: string;
  value: ConditionGroupFieldValue;
  options: FlowSelectorOption[];
  onChange: (value: ConditionGroupFieldValue) => void;
}

export function ConditionGroupField({
  ariaLabel,
  value,
  options,
  onChange
}: ConditionGroupFieldProps) {
  return (
    <div className="agent-flow-binding-list">
      <Select
        aria-label={`${ariaLabel}-operator`}
        options={[
          { label: 'AND', value: 'and' },
          { label: 'OR', value: 'or' }
        ]}
        value={value.operator}
        onChange={(operator) =>
          onChange({
            ...value,
            operator: operator as 'and' | 'or'
          })
        }
      />
      {value.conditions.map((condition, index) => (
        <div key={`${condition.comparator}-${index}`} className="agent-flow-binding-row">
          <SelectorField
            ariaLabel={`${ariaLabel}-${index}-left`}
            options={options}
            value={condition.left}
            onChange={(nextValue) =>
              onChange({
                ...value,
                conditions: value.conditions.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, left: nextValue as string[] }
                    : item
                )
              })
            }
          />
          <Select
            aria-label={`${ariaLabel}-${index}-comparator`}
            options={[
              { label: 'Exists', value: 'exists' },
              { label: 'Equals', value: 'equals' },
              { label: 'Contains', value: 'contains' }
            ]}
            value={condition.comparator}
            onChange={(comparator) =>
              onChange({
                ...value,
                conditions: value.conditions.map((item, itemIndex) =>
                  itemIndex === index
                    ? {
                        ...item,
                        comparator: comparator as 'exists' | 'equals' | 'contains'
                      }
                    : item
                )
              })
            }
          />
          {condition.comparator === 'exists' ? null : (
            <Input
              aria-label={`${ariaLabel}-${index}-right`}
              placeholder="比较值"
              value={
                Array.isArray(condition.right)
                  ? condition.right.join(' / ')
                  : (condition.right ?? '')
              }
              onChange={(event) =>
                onChange({
                  ...value,
                  conditions: value.conditions.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, right: event.target.value }
                      : item
                  )
                })
              }
            />
          )}
          <Button
            danger
            type="text"
            onClick={() =>
              onChange({
                ...value,
                conditions: value.conditions.filter((_, itemIndex) => itemIndex !== index)
              })
            }
          >
            删除
          </Button>
        </div>
      ))}
      <Button
        type="dashed"
        onClick={() =>
          onChange({
            ...value,
            conditions: [
              ...value.conditions,
              { left: [], comparator: 'exists' }
            ]
          })
        }
      >
        新增条件
      </Button>
    </div>
  );
}
