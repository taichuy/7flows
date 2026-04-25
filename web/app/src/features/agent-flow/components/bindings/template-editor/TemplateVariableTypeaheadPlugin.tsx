import { Empty } from 'antd';

import type { FlowSelectorOption } from '../../../lib/selector-options';

interface TemplateVariableTypeaheadPluginProps {
  open: boolean;
  options: FlowSelectorOption[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (selector: string[]) => void;
}

export function TemplateVariableTypeaheadPlugin({
  open,
  options,
  query,
  onQueryChange,
  onSelect
}: TemplateVariableTypeaheadPluginProps) {
  const emptyDescription = query.trim().length > 0 ? '未找到匹配变量' : '无可用变量';

  if (!open) {
    return null;
  }

  return (
    <div
      className="agent-flow-templated-text-field__typeahead"
      role="listbox"
      aria-label="变量建议"
    >
      <div className="agent-flow-templated-text-field__typeahead-search">
        <input
          aria-label="搜索变量"
          role="searchbox"
          className="agent-flow-templated-text-field__typeahead-searchbox"
          autoFocus
          value={query}
          placeholder="搜索节点或字段"
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
            className="agent-flow-templated-text-field__typeahead-option"
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
