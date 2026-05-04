import { SearchOutlined } from '@ant-design/icons';
import { Button, Input, Popover } from 'antd';
import type { ReactElement, ReactNode } from 'react';
import { useMemo, useState } from 'react';

import {
  BUILTIN_NODE_PICKER_OPTIONS,
  getNodePickerOptionDescription,
  getNodePickerOptionKey,
  type NodePickerOption
} from '../../lib/plugin-node-definitions';
import { getAgentFlowNodeTypeIcon } from '../../lib/node-type-icons';

const MIN_PICKER_HEIGHT = 120;
const CANVAS_BOTTOM_GAP = 10;

type BuiltinNodePickerOption = Extract<NodePickerOption, { kind: 'builtin' }>;

interface NodePickerGroup {
  key: string;
  title: string;
  description: string;
  types: BuiltinNodePickerOption['type'][];
}

const BUILTIN_NODE_PICKER_GROUPS: NodePickerGroup[] = [
  {
    key: 'io',
    title: '起止输出',
    description: '定义输入入口和最终响应。',
    types: ['start', 'human_input', 'answer']
  },
  {
    key: 'generation',
    title: '模型与生成',
    description: '调用模型、检索知识并组织生成内容。',
    types: ['llm', 'knowledge_retrieval', 'template_transform']
  },
  {
    key: 'control',
    title: '流程控制',
    description: '分支、分类、循环和批量处理。',
    types: ['question_classifier', 'if_else', 'iteration', 'loop']
  },
  {
    key: 'data',
    title: '数据处理',
    description: '读写结构化数据并维护流程变量。',
    types: [
      'data_model_list',
      'data_model_get',
      'data_model_create',
      'data_model_update',
      'data_model_delete',
      'variable_assigner',
      'parameter_extractor',
      'code'
    ]
  },
  {
    key: 'external',
    title: '外部能力',
    description: '调用接口、工具和系统外能力。',
    types: ['http_request', 'tool']
  }
];

const BUILTIN_NODE_PICKER_SUMMARIES: Record<
  BuiltinNodePickerOption['type'],
  string
> = {
  start: '接收用户输入和系统变量。',
  answer: '向用户返回最终内容。',
  human_input: '等待人工补充或确认信息。',
  llm: '调用大模型生成或理解文本。',
  template_transform: '用模板拼装或转换变量。',
  knowledge_retrieval: '从知识库检索相关内容。',
  question_classifier: '按语义意图分类并分流。',
  if_else: '按条件判断选择路径。',
  http_request: '请求外部 HTTP 接口。',
  tool: '调用已接入的工具能力。',
  data_model_list: 'List Data Model records.',
  data_model_get: 'Get one Data Model record.',
  data_model_create: 'Create a Data Model record.',
  data_model_update: 'Update a Data Model record.',
  data_model_delete: 'Delete a Data Model record.',
  variable_assigner: '设置或更新流程变量。',
  parameter_extractor: '从文本中提取结构化参数。',
  code: '执行脚本处理复杂转换。',
  iteration: '遍历列表并处理每一项。',
  loop: '按条件重复执行节点。'
};

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
  const [searchValue, setSearchValue] = useState('');
  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const builtinOptions = options.filter(
    (option): option is BuiltinNodePickerOption => option.kind === 'builtin'
  );
  const pluginOptions = options.filter(
    (option): option is Extract<NodePickerOption, { kind: 'plugin_contribution' }> =>
      option.kind === 'plugin_contribution'
  );
  const groupedBuiltinOptions = useMemo(
    () =>
      BUILTIN_NODE_PICKER_GROUPS.map((group) => {
        const groupSearchText = `${group.title} ${group.description}`.toLowerCase();
        const groupMatchesSearch =
          normalizedSearchValue.length > 0 &&
          groupSearchText.includes(normalizedSearchValue);
        const groupedOptions = group.types
          .map((type) => builtinOptions.find((option) => option.type === type))
          .filter((option): option is BuiltinNodePickerOption => Boolean(option))
          .filter((option) =>
            groupMatchesSearch ||
            matchesNodePickerSearch(
              option,
              normalizedSearchValue,
              BUILTIN_NODE_PICKER_SUMMARIES[option.type]
            )
          );

        return { ...group, options: groupedOptions };
      }).filter((group) => group.options.length > 0),
    [builtinOptions, normalizedSearchValue]
  );
  const groupedBuiltinOptionKeys = new Set(
    BUILTIN_NODE_PICKER_GROUPS.flatMap((group) => group.types)
  );
  const uncategorizedBuiltinOptions = builtinOptions.filter(
    (option) =>
      !groupedBuiltinOptionKeys.has(option.type) &&
      matchesNodePickerSearch(
        option,
        normalizedSearchValue,
        BUILTIN_NODE_PICKER_SUMMARIES[option.type]
      )
  );
  const filteredPluginOptions = pluginOptions.filter((option) =>
    matchesNodePickerSearch(
      option,
      normalizedSearchValue,
      getNodePickerOptionDescription(option)
    )
  );
  const hasVisibleOptions =
    groupedBuiltinOptions.length > 0 ||
    uncategorizedBuiltinOptions.length > 0 ||
    filteredPluginOptions.length > 0;

  function closePicker() {
    setSearchValue('');
    onOpenChange(false);
  }

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
        <div className="agent-flow-node-picker">
          <div className="agent-flow-node-picker__search">
            <Input
              allowClear
              aria-label="搜索节点"
              placeholder="搜索节点"
              prefix={<SearchOutlined />}
              size="small"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
              }}
            />
          </div>
          <div className="agent-flow-node-picker__list" role="menu">
            {groupedBuiltinOptions.map((group) => (
              <NodePickerSection
                key={group.key}
                title={group.title}
              >
                {group.options.map((option) => (
                  <NodePickerOptionButton
                    key={getNodePickerOptionKey(option)}
                    option={option}
                    onPick={() => {
                      closePicker();
                      onPickNode(option);
                    }}
                  />
                ))}
              </NodePickerSection>
            ))}
            {uncategorizedBuiltinOptions.length > 0 ? (
              <NodePickerSection
                title="其他节点"
              >
                {uncategorizedBuiltinOptions.map((option) => (
                  <NodePickerOptionButton
                    key={getNodePickerOptionKey(option)}
                    option={option}
                    onPick={() => {
                      closePicker();
                      onPickNode(option);
                    }}
                  />
                ))}
              </NodePickerSection>
            ) : null}
            {filteredPluginOptions.length > 0 ? (
              <NodePickerSection
                title="插件节点"
              >
                {filteredPluginOptions.map((option) => (
                  <NodePickerOptionButton
                    key={getNodePickerOptionKey(option)}
                    option={option}
                    onPick={() => {
                      if (option.disabled) {
                        return;
                      }

                      closePicker();
                      onPickNode(option);
                    }}
                  />
                ))}
              </NodePickerSection>
            ) : null}
            {!hasVisibleOptions ? (
              <div className="agent-flow-node-picker__empty">
                没有匹配的节点
              </div>
            ) : null}
          </div>
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

interface NodePickerSectionProps {
  title: string;
  children: ReactNode;
}

function NodePickerSection({
  title,
  children
}: NodePickerSectionProps) {
  return (
    <section className="agent-flow-node-picker__section">
      <div className="agent-flow-node-picker__section-head">
        <div className="agent-flow-node-picker__section-label">
          {title}
        </div>
      </div>
      <div className="agent-flow-node-picker__section-items">
        {children}
      </div>
    </section>
  );
}

interface NodePickerOptionButtonProps {
  option: NodePickerOption;
  onPick: () => void;
}

function NodePickerOptionButton({
  option,
  onPick
}: NodePickerOptionButtonProps) {
  const icon =
    option.kind === 'builtin'
      ? getAgentFlowNodeTypeIcon(option.type)
      : getAgentFlowNodeTypeIcon('plugin_node');

  return (
    <button
      aria-label={option.label}
      className="agent-flow-node-picker__item"
      disabled={option.kind === 'plugin_contribution' && option.disabled}
      role="menuitem"
      type="button"
      onClick={onPick}
    >
      <span className="agent-flow-node-picker__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="agent-flow-node-picker__text">
        <span className="agent-flow-node-picker__name">{option.label}</span>
      </span>
    </button>
  );
}

function matchesNodePickerSearch(
  option: NodePickerOption,
  normalizedSearchValue: string,
  description: string | null
) {
  if (normalizedSearchValue.length === 0) {
    return true;
  }

  const searchText = [
    option.label,
    option.kind === 'builtin' ? option.type : option.contribution.category,
    description
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  return searchText.includes(normalizedSearchValue);
}
