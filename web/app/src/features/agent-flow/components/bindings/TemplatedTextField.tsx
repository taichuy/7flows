import { Button, Dropdown, Typography } from 'antd';
import { useRef } from 'react';

import {
  decodeSelectorValue,
  encodeSelectorValue,
  type FlowSelectorOption
} from '../../lib/selector-options';
import {
  createTemplateSelectorToken,
} from '../../lib/template-binding';
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

  function insertSelector(selector: string[]) {
    const token = createTemplateSelectorToken(selector);

    if (!token) {
      return;
    }

    editorRef.current?.insertSelector(selector);
  }

  return (
    <div className="agent-flow-templated-text-field">
      <div className="agent-flow-templated-text-field__toolbar">
        <Dropdown
          disabled={options.length === 0}
          menu={{
            items: options.map((option) => ({
              key: encodeSelectorValue(option.value),
              label: option.displayLabel
            })),
            onClick: ({ key }) => insertSelector(decodeSelectorValue(key))
          }}
          trigger={['click']}
        >
          <Button type="text" size="small">
            插入变量
          </Button>
        </Dropdown>
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
