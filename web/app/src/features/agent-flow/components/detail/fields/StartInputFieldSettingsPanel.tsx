import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Input,
  InputNumber,
  Select,
  Switch,
  Typography
} from 'antd';
import type { RefObject } from 'react';

import type {
  FlowStartInputField,
  FlowStartInputType
} from '@1flowbase/flow-schema';

import {
  getStartInputValueType,
  startInputTypeOptions
} from '../../../lib/start-node-variables';
import { FloatingSettingsPanel } from '../FloatingSettingsPanel';

type StartInputFieldSettingsPanelProps = {
  mode: 'create' | 'edit';
  field: FlowStartInputField;
  triggerRef: RefObject<HTMLElement | null>;
  onChange: (patch: Partial<FlowStartInputField>) => void;
  onClose: () => void;
  onSave: () => void;
};

function isStringDefaultType(inputType: FlowStartInputType) {
  return (
    inputType === 'text' ||
    inputType === 'paragraph' ||
    inputType === 'select' ||
    inputType === 'url'
  );
}

function shouldShowMaxLength(inputType: FlowStartInputType) {
  return (
    inputType === 'text' ||
    inputType === 'paragraph' ||
    inputType === 'url'
  );
}

function normalizeOptions(options: string[] | undefined) {
  const nextOptions = options?.length ? options : [''];

  return nextOptions;
}

export function StartInputFieldSettingsPanel({
  mode,
  field,
  triggerRef,
  onChange,
  onClose,
  onSave
}: StartInputFieldSettingsPanelProps) {
  const title = mode === 'create' ? '新增输入字段' : '编辑输入字段';
  const options = normalizeOptions(field.options);
  const showDefaultValue =
    isStringDefaultType(field.inputType) ||
    field.inputType === 'number' ||
    field.inputType === 'checkbox';

  function handleTypeChange(inputType: FlowStartInputType) {
    const valueType = getStartInputValueType(inputType);

    onChange({
      inputType,
      valueType,
      options: inputType === 'select' ? options : undefined,
      defaultValue: undefined,
      maxLength: shouldShowMaxLength(inputType) ? field.maxLength : undefined
    });
  }

  function updateOption(index: number, value: string) {
    onChange({
      options: options.map((option, optionIndex) =>
        optionIndex === index ? value : option
      )
    });
  }

  function removeOption(index: number) {
    const nextOptions = options.filter((_, optionIndex) => optionIndex !== index);

    onChange({
      options: nextOptions.length > 0 ? nextOptions : [''],
      defaultValue: nextOptions.includes(String(field.defaultValue ?? ''))
        ? field.defaultValue
        : undefined
    });
  }

  return (
    <FloatingSettingsPanel
      open
      title={title}
      closeLabel={`关闭${title}`}
      triggerRef={triggerRef}
      className="agent-flow-start-input-fields__panel"
      defaultWidth={420}
      minWidth={360}
      defaultHeight={520}
      gap={16}
      onClose={onClose}
      footer={
        <div className="agent-flow-start-input-fields__panel-footer">
          <Button onClick={onClose}>取消</Button>
          <Button aria-label="保存输入字段" type="primary" onClick={onSave}>
            保存
          </Button>
        </div>
      }
    >
      <div className="agent-flow-start-input-fields__form">
        <label className="agent-flow-start-input-fields__form-row">
          <span>字段类型</span>
          <Select
            aria-label="输入字段类型"
            options={startInputTypeOptions}
            value={field.inputType}
            onChange={handleTypeChange}
          />
        </label>
        <label className="agent-flow-start-input-fields__form-row">
          <span>变量名</span>
          <Input
            aria-label="输入字段变量名"
            value={field.key}
            onChange={(event) => onChange({ key: event.target.value })}
          />
        </label>
        <label className="agent-flow-start-input-fields__form-row">
          <span>显示名</span>
          <Input
            aria-label="输入字段显示名"
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </label>
        <label className="agent-flow-start-input-fields__form-row">
          <span>占位提示</span>
          <Input
            aria-label="输入字段占位提示"
            value={field.placeholder ?? ''}
            onChange={(event) =>
              onChange({ placeholder: event.target.value || undefined })
            }
          />
        </label>

        {shouldShowMaxLength(field.inputType) ? (
          <label className="agent-flow-start-input-fields__form-row">
            <span>最大长度</span>
            <InputNumber
              aria-label="输入字段最大长度"
              min={1}
              precision={0}
              value={field.maxLength}
              onChange={(maxLength) =>
                onChange({
                  maxLength:
                    typeof maxLength === 'number' ? maxLength : undefined
                })
              }
            />
          </label>
        ) : null}

        {field.inputType === 'select' ? (
          <div className="agent-flow-start-input-fields__form-row">
            <span>下拉选项</span>
            <div className="agent-flow-start-input-fields__option-list">
              {options.map((option, index) => (
                <div
                  className="agent-flow-start-input-fields__option-row"
                  key={index}
                >
                  <Input
                    aria-label={`输入字段选项 ${index + 1}`}
                    value={option}
                    onChange={(event) => updateOption(index, event.target.value)}
                  />
                  <Button
                    aria-label={`删除下拉选项 ${index + 1}`}
                    icon={<DeleteOutlined />}
                    size="small"
                    type="text"
                    onClick={() => removeOption(index)}
                  />
                </div>
              ))}
              <Button
                aria-label="新增下拉选项"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => onChange({ options: [...options, ''] })}
              >
                新增选项
              </Button>
            </div>
          </div>
        ) : null}

        {showDefaultValue ? (
          <div className="agent-flow-start-input-fields__form-row">
            <span>默认值</span>
            {field.inputType === 'paragraph' ? (
              <Input.TextArea
                aria-label="输入字段默认值"
                autoSize={{ minRows: 2, maxRows: 4 }}
                value={String(field.defaultValue ?? '')}
                onChange={(event) =>
                  onChange({ defaultValue: event.target.value || undefined })
                }
              />
            ) : field.inputType === 'number' ? (
              <InputNumber
                aria-label="输入字段默认值"
                value={
                  typeof field.defaultValue === 'number'
                    ? field.defaultValue
                    : undefined
                }
                onChange={(defaultValue) =>
                  onChange({
                    defaultValue:
                      typeof defaultValue === 'number'
                        ? defaultValue
                        : undefined
                  })
                }
              />
            ) : field.inputType === 'checkbox' ? (
              <Select
                aria-label="输入字段默认值"
                options={[
                  { value: true, label: '默认选中' },
                  { value: false, label: '默认不选中' }
                ]}
                value={
                  typeof field.defaultValue === 'boolean'
                    ? field.defaultValue
                    : undefined
                }
                onChange={(defaultValue: boolean) => onChange({ defaultValue })}
              />
            ) : field.inputType === 'select' ? (
              <Select
                allowClear
                aria-label="输入字段默认值"
                options={options
                  .map((option) => option.trim())
                  .filter(Boolean)
                  .map((option) => ({ value: option, label: option }))}
                value={
                  typeof field.defaultValue === 'string'
                    ? field.defaultValue
                    : undefined
                }
                onChange={(defaultValue?: string) => onChange({ defaultValue })}
              />
            ) : (
              <Input
                aria-label="输入字段默认值"
                value={String(field.defaultValue ?? '')}
                onChange={(event) =>
                  onChange({ defaultValue: event.target.value || undefined })
                }
              />
            )}
          </div>
        ) : null}

        <div className="agent-flow-start-input-fields__toggles">
          <label className="agent-flow-start-input-fields__toggle-row">
            <span>
              <Typography.Text strong>必填</Typography.Text>
              <Typography.Text type="secondary">
                用户运行前必须提供该输入
              </Typography.Text>
            </span>
            <Switch
              aria-label="必填输入字段"
              checked={field.required}
              onChange={(required) =>
                onChange({ required, hidden: required ? false : field.hidden })
              }
            />
          </label>
          <label className="agent-flow-start-input-fields__toggle-row">
            <span>
              <Typography.Text strong>隐藏</Typography.Text>
              <Typography.Text type="secondary">
                运行表单中不展示，但仍可作为变量使用
              </Typography.Text>
            </span>
            <Switch
              aria-label="隐藏输入字段"
              checked={field.hidden}
              disabled={field.required}
              onChange={(hidden) =>
                onChange({ hidden, required: hidden ? false : field.required })
              }
            />
          </label>
        </div>
      </div>
    </FloatingSettingsPanel>
  );
}
