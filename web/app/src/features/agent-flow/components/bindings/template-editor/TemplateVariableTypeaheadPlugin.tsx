import { Empty } from 'antd';
import type { CSSProperties, KeyboardEvent } from 'react';

import type { FlowSelectorOption } from '../../../lib/selector-options';

interface TemplateVariableTypeaheadPluginProps {
  open: boolean;
  options: FlowSelectorOption[];
  query: string;
  activeIndex: number;
  position?: {
    left: number;
    top: number;
  } | null;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement | HTMLInputElement>) => void;
  onSelect: (selector: string[]) => void;
}

export function TemplateVariableTypeaheadPlugin({
  open,
  options,
  query,
  activeIndex,
  position,
  onQueryChange,
  onKeyDown,
  onSelect
}: TemplateVariableTypeaheadPluginProps) {
  const emptyDescription = query.trim().length > 0 ? '未找到匹配变量' : '无可用变量';
  const popupStyle: CSSProperties | undefined = position
    ? {
        left: `${position.left}px`,
        top: `${position.top}px`
      }
    : undefined;

  if (!open) {
    return null;
  }

  return (
    <div
      className="agent-flow-templated-text-field__typeahead"
      role="listbox"
      aria-label="变量建议"
      style={popupStyle}
      onKeyDownCapture={onKeyDown}
    >
      <div className="agent-flow-templated-text-field__typeahead-search">
        <input
          aria-label="搜索变量"
          role="searchbox"
          className="agent-flow-templated-text-field__typeahead-searchbox"
          autoFocus
          value={query}
          placeholder="搜索节点或字段"
          onKeyDownCapture={onKeyDown}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      {options.length === 0 ? (
        <div className="agent-flow-templated-text-field__typeahead-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
        </div>
      ) : (
        options.map((option) => (
          <button
            key={option.value.join('.')}
            type="button"
            role="option"
            aria-selected={activeIndex === options.indexOf(option)}
            className={
              activeIndex === options.indexOf(option)
                ? 'agent-flow-templated-text-field__typeahead-option agent-flow-templated-text-field__typeahead-option--active'
                : 'agent-flow-templated-text-field__typeahead-option'
            }
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(option.value)}
          >
            {option.displayLabel}
          </button>
        ))
      )}
    </div>
  );
}
