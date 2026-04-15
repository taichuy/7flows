import { Button, Popover } from 'antd';
import type { FlowNodeType } from '@1flowse/flow-schema';

const NODE_OPTIONS: Array<{ type: FlowNodeType; label: string }> = [
  { type: 'llm', label: 'LLM' },
  { type: 'template_transform', label: 'Template Transform' },
  { type: 'knowledge_retrieval', label: 'Knowledge Retrieval' },
  { type: 'question_classifier', label: 'Question Classifier' },
  { type: 'if_else', label: 'If / Else' },
  { type: 'http_request', label: 'HTTP Request' },
  { type: 'tool', label: 'Tool' },
  { type: 'variable_assigner', label: 'Variable Assigner' },
  { type: 'iteration', label: 'Iteration' },
  { type: 'loop', label: 'Loop' }
];

interface NodePickerPopoverProps {
  ariaLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickNode: (nodeType: FlowNodeType) => void;
}

export function NodePickerPopover({
  ariaLabel,
  open,
  onOpenChange,
  onPickNode
}: NodePickerPopoverProps) {
  return (
    <Popover
      destroyOnHidden
      trigger="click"
      open={open}
      placement="rightTop"
      onOpenChange={onOpenChange}
      content={
        <div className="agent-flow-node-picker" role="menu">
          {NODE_OPTIONS.map((option) => (
            <button
              key={option.type}
              className="agent-flow-node-picker__item"
              role="menuitem"
              type="button"
              onClick={() => {
                onOpenChange(false);
                onPickNode(option.type);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      <Button
        aria-label={ariaLabel}
        size="small"
        type="text"
        onClick={(event) => {
          event.stopPropagation();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        +
      </Button>
    </Popover>
  );
}
