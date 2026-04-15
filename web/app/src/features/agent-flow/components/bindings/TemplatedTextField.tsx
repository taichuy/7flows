import { Input } from 'antd';

interface TemplatedTextFieldProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
}

export function TemplatedTextField({
  ariaLabel,
  value,
  onChange
}: TemplatedTextFieldProps) {
  return (
    <Input.TextArea
      aria-label={ariaLabel}
      autoSize={{ minRows: 3, maxRows: 8 }}
      placeholder="输入模板内容"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
