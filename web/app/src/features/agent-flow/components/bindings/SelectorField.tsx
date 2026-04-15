import { Cascader, Select } from 'antd';

import {
  decodeSelectorValue,
  encodeSelectorValue,
  type FlowSelectorOption,
  toCascaderSelectorOptions
} from '../../lib/selector-options';

interface SelectorFieldProps {
  ariaLabel: string;
  value: string[] | string[][];
  options: FlowSelectorOption[];
  multiple?: boolean;
  onChange: (value: string[] | string[][]) => void;
}

function isSelectorListValue(value: string[] | string[][]): value is string[][] {
  return value.length === 0 || Array.isArray(value[0]);
}

export function SelectorField({
  ariaLabel,
  value,
  options,
  multiple = false,
  onChange
}: SelectorFieldProps) {
  if (multiple) {
    const selectedValues = isSelectorListValue(value)
      ? value.map((item) => encodeSelectorValue(item))
      : [];

    return (
      <Select
        aria-label={ariaLabel}
        mode="multiple"
        options={options.map((option) => ({
          label: option.displayLabel,
          value: encodeSelectorValue(option.value)
        }))}
        placeholder="选择上游输出"
        value={selectedValues}
        onChange={(nextValues) =>
          onChange(nextValues.map((nextValue) => decodeSelectorValue(String(nextValue))))
        }
      />
    );
  }

  return (
    <Cascader
      allowClear
      aria-label={ariaLabel}
      options={toCascaderSelectorOptions(options)}
      placeholder="选择上游输出"
      value={isSelectorListValue(value) ? [] : value}
      onChange={(nextValue) =>
        onChange(Array.isArray(nextValue) ? nextValue.map(String) : [])
      }
    />
  );
}
