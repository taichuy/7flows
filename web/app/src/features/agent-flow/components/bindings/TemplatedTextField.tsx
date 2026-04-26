import { Button, Typography } from 'antd';
import { ThunderboltTwoTone } from '@ant-design/icons';
import { useRef } from 'react';

import {
  type FlowSelectorOption
} from '../../lib/selector-options';
import {
  LexicalTemplatedTextEditor,
  type LexicalTemplatedTextEditorHandle,
} from './template-editor/LexicalTemplatedTextEditor';

interface TemplatedTextFieldProps {
  label: string;
  ariaLabel: string;
  placeholder?: string;
  options?: FlowSelectorOption[];
  value: string;
  onChange: (value: string) => void;
}

export function TemplatedTextField({
  label,
  ariaLabel,
  placeholder,
  options = [],
  value,
  onChange
}: TemplatedTextFieldProps) {
  const editorRef = useRef<LexicalTemplatedTextEditorHandle | null>(null);

  return (
    <div className="agent-flow-templated-text-field">
      <div className="agent-flow-templated-text-field__toolbar">
        <Typography.Text strong className="agent-flow-templated-text-field__label">
          {label}
        </Typography.Text>
        <Button
          type="text"
          size="small"
          icon={<ThunderboltTwoTone />}
          disabled={options.length === 0}
          aria-label="插入变量"
          onClick={() => editorRef.current?.openVariablePicker()}
        />
      </div>
      <LexicalTemplatedTextEditor
        ref={editorRef}
        value={value}
        options={options}
        ariaLabel={ariaLabel}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  );
}
