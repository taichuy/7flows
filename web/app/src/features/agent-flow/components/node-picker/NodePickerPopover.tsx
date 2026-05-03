import { Button, Popover } from 'antd';
import type { ReactElement, ReactNode } from 'react';

import {
  BUILTIN_NODE_PICKER_OPTIONS,
  getNodePickerOptionDescription,
  getNodePickerOptionKey,
  type NodePickerOption
} from '../../lib/plugin-node-definitions';

const MIN_PICKER_HEIGHT = 120;
const CANVAS_BOTTOM_GAP = 10;

export function calculateNodePickerMaxHeight(
  canvasBottom: number,
  anchorY: number
) {
  return Math.max(
    MIN_PICKER_HEIGHT,
    Math.floor(canvasBottom - anchorY - CANVAS_BOTTOM_GAP)
  );
}

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

  function resolvePopupContainer(triggerNode: HTMLElement) {
    const canvas = triggerNode.closest<HTMLElement>('.agent-flow-canvas');

    if (!canvas) {
      return document.body;
    }

    const canvasRect = canvas.getBoundingClientRect();
    const triggerRect = triggerNode.getBoundingClientRect();
    const anchorY = placement === 'bottom' ? triggerRect.bottom : triggerRect.top;
    const maxHeight = calculateNodePickerMaxHeight(canvasRect.bottom, anchorY);

    canvas.style.setProperty(
      '--agent-flow-node-picker-max-height',
      `${maxHeight}px`
    );

    return canvas;
  }

  return (
    <Popover
      rootClassName="agent-flow-node-picker-popover"
      destroyOnHidden
      getPopupContainer={resolvePopupContainer}
      styles={{
        body: {
          boxSizing: 'border-box',
          maxHeight:
            'var(--agent-flow-node-picker-max-height, calc(100vh - 120px))',
          overflowY: 'auto',
          overscrollBehavior: 'contain'
        }
      }}
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
