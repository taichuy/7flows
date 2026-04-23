import type { CSSProperties } from 'react';

import { Select, Typography } from 'antd';

type EmptyMode = 'text' | 'select';

export function CachedModelSelect({
  modelIds,
  ariaLabel,
  className,
  style,
  placeholder = '缓存模型',
  value,
  values,
  defaultValue,
  onChange,
  emptyMode = 'text',
  disabled = false
}: {
  modelIds: string[];
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
  value?: string;
  values?: string[];
  defaultValue?: string;
  onChange?: (value: string | null) => void;
  emptyMode?: EmptyMode;
  disabled?: boolean;
}) {
  const options = modelIds.map((modelId) => ({
    value: modelId,
    label: modelId
  }));

  if (options.length === 0 && emptyMode === 'text') {
    return <Typography.Text type="secondary">暂无缓存模型</Typography.Text>;
  }

  return (
    <Select
      aria-label={ariaLabel}
      className={className}
      style={style}
      mode={values ? 'multiple' : undefined}
      value={values ?? value}
      defaultValue={defaultValue}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      filterOption={(input, option) =>
        String(option?.label ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      optionFilterProp="label"
      popupMatchSelectWidth={false}
      showSearch={!disabled}
      allowClear={Boolean(onChange)}
      onChange={(nextValue) => onChange?.(typeof nextValue === 'string' ? nextValue : null)}
    />
  );
}
