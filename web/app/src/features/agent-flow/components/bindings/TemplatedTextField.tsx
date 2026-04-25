import { Button, Typography } from 'antd';
import { useRef } from 'react';

import {
  type FlowSelectorOption
} from '../../lib/selector-options';
import {
  LexicalTemplatedTextEditor,
  type LexicalTemplatedTextEditorHandle,
} from './template-editor/LexicalTemplatedTextEditor';

interface TemplatedTextFieldProps {
  ariaLabel: string;
  options?: FlowSelectorOption[];
  value: string;
  onChange: (value: string) => void;
}

export function TemplatedTextField({
  ariaLabel,
  options = [],
  value,
  onChange
}: TemplatedTextFieldProps) {
  const editorRef = useRef<LexicalTemplatedTextEditorHandle | null>(null);

  return (
    <div className="agent-flow-templated-text-field">
      <div className="agent-flow-templated-text-field__toolbar">
        <Button
          type="text"
          size="small"
          disabled={options.length === 0}
          onClick={() => editorRef.current?.openVariablePicker()}
        >
          插入变量
        </Button>
        <Typography.Text
          type="secondary"
          className="agent-flow-templated-text-field__hint"
        >
          支持正文变量块，输入“/”或左花括号可快速引用
        </Typography.Text>
      </div>
      <LexicalTemplatedTextEditor
        ref={editorRef}
        value={value}
        options={options}
        ariaLabel={ariaLabel}
        onChange={onChange}
      />
    </div>
  );
}
