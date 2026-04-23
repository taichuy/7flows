import { Select, Typography } from 'antd';

type EmptyMode = 'text' | 'disabled-select';

export function CachedModelSelect({
  modelIds,
  ariaLabel,
  className,
  placeholder = '缓存模型',
  value,
  defaultValue,
  onChange,
  emptyMode = 'text'
}: {
  modelIds: string[];
  ariaLabel: string;
  className?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string | null) => void;
  emptyMode?: EmptyMode;
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
      value={value}
      defaultValue={defaultValue}
      options={options}
      placeholder={placeholder}
      disabled={options.length === 0}
      filterOption={(input, option) =>
        String(option?.label ?? '')
          .toLowerCase()
          .includes(input.toLowerCase())
      }
      optionFilterProp="label"
      popupMatchSelectWidth={false}
      showSearch
      allowClear={Boolean(onChange)}
      onChange={(nextValue) => onChange?.(typeof nextValue === 'string' ? nextValue : null)}
    />
  );
}
