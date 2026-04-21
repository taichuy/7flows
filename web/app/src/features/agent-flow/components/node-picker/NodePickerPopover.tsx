import { Button, Popover } from 'antd';
import type { ReactElement, ReactNode } from 'react';

import {
  BUILTIN_NODE_PICKER_OPTIONS,
  getNodePickerOptionDescription,
  getNodePickerOptionKey,
  type NodePickerOption
} from '../../lib/plugin-node-definitions';

interface NodePickerPopoverProps {
  ariaLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickNode: (option: NodePickerOption) => void;
  options?: NodePickerOption[];
  buttonClassName?: string;
  buttonContent?: ReactNode;
  children?: ReactElement;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'rightTop';
}

export function NodePickerPopover({
  ariaLabel,
  open,
  onOpenChange,
  onPickNode,
  options = BUILTIN_NODE_PICKER_OPTIONS,
  buttonClassName,
  buttonContent = '+',
  children,
  placement = 'rightTop'
}: NodePickerPopoverProps) {
  const builtinOptions = options.filter(
    (option): option is Extract<NodePickerOption, { kind: 'builtin' }> =>
      option.kind === 'builtin'
  );
  const pluginOptions = options.filter(
    (option): option is Extract<NodePickerOption, { kind: 'plugin_contribution' }> =>
      option.kind === 'plugin_contribution'
  );

  return (
    <Popover
      destroyOnHidden
      trigger="click"
      open={open}
      placement={placement}
      onOpenChange={onOpenChange}
      content={
        <div className="agent-flow-node-picker" role="menu">
          {builtinOptions.map((option) => (
            <button
              key={getNodePickerOptionKey(option)}
              className="agent-flow-node-picker__item"
              role="menuitem"
              type="button"
              onClick={() => {
                onOpenChange(false);
                onPickNode(option);
              }}
            >
              <span>{option.label}</span>
            </button>
          ))}
          {pluginOptions.length > 0 ? (
            <div className="agent-flow-node-picker__section-label">
              插件节点
            </div>
          ) : null}
          {pluginOptions.map((option) => (
            <button
              key={getNodePickerOptionKey(option)}
              className="agent-flow-node-picker__item"
              disabled={option.disabled}
              role="menuitem"
              type="button"
              onClick={() => {
                if (option.disabled) {
                  return;
                }

                onOpenChange(false);
                onPickNode(option);
              }}
            >
              <span>{option.label}</span>
              {getNodePickerOptionDescription(option) ? (
                <span className="agent-flow-node-picker__meta">
                  {getNodePickerOptionDescription(option)}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      }
    >
      {children ?? (
        <Button
          aria-label={ariaLabel}
          className={buttonClassName}
          size="small"
          type="text"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          {buttonContent}
        </Button>
      )}
    </Popover>
  );
}
