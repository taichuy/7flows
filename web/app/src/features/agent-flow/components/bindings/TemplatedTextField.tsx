import { Button, Dropdown, Input, Tag, Typography } from 'antd';
import { useMemo, useRef } from 'react';

import {
  decodeSelectorValue,
  encodeSelectorValue,
  type FlowSelectorOption
} from '../../lib/selector-options';
import {
  createTemplateSelectorToken,
  dedupeSelectors,
  getTemplateSelectorLabel,
  parseTemplateSelectorTokens
} from '../../lib/template-binding';

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef({
    start: value.length,
    end: value.length
  });
  const referencedSelectors = useMemo(
    () => dedupeSelectors(parseTemplateSelectorTokens(value)),
    [value]
  );

  function rememberSelection(target: HTMLTextAreaElement) {
    textareaRef.current = target;
    selectionRef.current = {
      start: target.selectionStart ?? value.length,
      end: target.selectionEnd ?? value.length
    };
  }

  function insertSelector(selector: string[]) {
    const token = createTemplateSelectorToken(selector);

    if (!token) {
      return;
    }

    const start = selectionRef.current.start;
    const end = selectionRef.current.end;
    const nextValue = `${value.slice(0, start)}${token}${value.slice(end)}`;
    const nextCursor = start + token.length;

    onChange(nextValue);

    window.setTimeout(() => {
      const target = textareaRef.current;

      if (!target) {
        return;
      }

      target.focus();
      target.setSelectionRange(nextCursor, nextCursor);
      selectionRef.current = {
        start: nextCursor,
        end: nextCursor
      };
    }, 0);
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
          支持在文本中混写上游字段引用
        </Typography.Text>
      </div>
      <Input.TextArea
        aria-label={ariaLabel}
        autoSize={{ minRows: 6, maxRows: 14 }}
        placeholder="输入模板内容，使用“插入变量”添加引用"
        value={value}
        onChange={(event) => {
          rememberSelection(event.target);
          onChange(event.target.value);
        }}
        onFocus={(event) => rememberSelection(event.target)}
        onSelect={(event) => rememberSelection(event.target as HTMLTextAreaElement)}
      />
      {referencedSelectors.length > 0 ? (
        <div
          className="agent-flow-templated-text-field__references"
          data-testid="templated-text-references"
        >
          <Typography.Text
            type="secondary"
            className="agent-flow-templated-text-field__references-label"
          >
            已引用变量
          </Typography.Text>
          <div className="agent-flow-templated-text-field__reference-tags">
            {referencedSelectors.map((selector) => (
              <Tag key={selector.join('.')} className="agent-flow-templated-text-field__tag">
                {getTemplateSelectorLabel(selector, options)}
              </Tag>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
