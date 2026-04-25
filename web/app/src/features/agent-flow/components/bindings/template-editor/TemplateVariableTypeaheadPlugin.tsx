import { Empty } from 'antd';

import type { FlowSelectorOption } from '../../../lib/selector-options';

interface TemplateVariableTypeaheadPluginProps {
  open: boolean;
  options: FlowSelectorOption[];
  onSelect: (selector: string[]) => void;
}

export function TemplateVariableTypeaheadPlugin({
  open,
  options,
  onSelect
}: TemplateVariableTypeaheadPluginProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="agent-flow-templated-text-field__typeahead"
      role="listbox"
      aria-label="变量建议"
    >
      {options.length === 0 ? (
        <div className="agent-flow-templated-text-field__typeahead-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无可用变量" />
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
