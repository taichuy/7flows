import { Button, Input } from 'antd';

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
  onChange: (value: NamedBindingValue[]) => void;
}

export function NamedBindingsField({
  ariaLabel,
  value,
  options,
  onChange
}: NamedBindingsFieldProps) {
  return (
    <div className="agent-flow-binding-list">
      {value.map((entry, index) => (
        <div key={`${entry.name}-${index}`} className="agent-flow-binding-row">
          <Input
            aria-label={`${ariaLabel}-${index}-name`}
            placeholder="变量名"
            value={entry.name}
            onChange={(event) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, name: event.target.value } : item
                )
              )
            }
          />
          <SelectorField
            ariaLabel={`${ariaLabel}-${index}-selector`}
            options={options}
            value={entry.selector}
            onChange={(nextValue) =>
              onChange(
                value.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, selector: nextValue as string[] } : item
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
        onClick={() => onChange([...value, { name: '', selector: [] }])}
      >
        新增变量
      </Button>
    </div>
  );
}
