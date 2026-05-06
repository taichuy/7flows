import { Button, Input, Select, Typography } from 'antd';

import type { FlowSelectorOption } from '../../lib/selector-options';
import { SelectorField } from './SelectorField';

interface NamedBindingValue {
  name: string;
  selector: string[];
}

interface NamedBindingsFieldProps {
  ariaLabel: string;
  value: NamedBindingValue[];
  options: FlowSelectorOption[];
  nameOptions?: Array<{ value: string; label: string; disabled?: boolean }>;
  namePlaceholder?: string;
  selectorLabel?: string;
  addButtonLabel?: string;
  onChange: (value: NamedBindingValue[]) => void;
}

export function NamedBindingsField({
  ariaLabel,
  value,
  options,
  nameOptions,
  namePlaceholder = '变量名',
  selectorLabel = 'selector',
  addButtonLabel = '新增变量',
  onChange
}: NamedBindingsFieldProps) {
  return (
    <div className="agent-flow-binding-list">
      {value.map((entry, index) => (
        <div key={`${entry.name}-${index}`} className="agent-flow-binding-row">
          {nameOptions ? (
            <Select
              aria-label={`${ariaLabel}-${index}-field`}
              options={nameOptions}
              placeholder={namePlaceholder}
              value={entry.name || undefined}
              onChange={(nextName) =>
                onChange(
                  value.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, name: nextName } : item
                  )
                )
              }
            />
          ) : (
            <Input
              aria-label={`${ariaLabel}-${index}-name`}
              placeholder={namePlaceholder}
              value={entry.name}
              onChange={(event) =>
                onChange(
                  value.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, name: event.target.value }
                      : item
                  )
                )
              }
            />
          )}
          {nameOptions ? (
            <Typography.Text type="secondary">:</Typography.Text>
          ) : null}
          <SelectorField
            ariaLabel={`${ariaLabel}-${index}-${selectorLabel}`}
            options={options}
            value={entry.selector}
            onChange={(nextValue) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, selector: nextValue as string[] }
                    : item
                )
              )
            }
          />
          <Button
            danger
            type="text"
            onClick={() =>
              onChange(value.filter((_, itemIndex) => itemIndex !== index))
            }
          >
            删除
          </Button>
        </div>
      ))}
      <Button
        type="dashed"
        onClick={() => onChange([...value, { name: '', selector: [] }])}
      >
        {addButtonLabel}
      </Button>
    </div>
  );
}
