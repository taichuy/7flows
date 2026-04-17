import { CloseOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Slider, Switch, Typography } from 'antd';
import { useMemo, useState } from 'react';

import type { SchemaFieldRendererProps } from '../../../../../shared/schema-ui/registry/create-renderer-registry';
import { findLlmModelOption, llmModelOptions } from '../../../lib/model-options';

function clampNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ModelChip({
  model,
  placeholder = '选择模型'
}: {
  model: ReturnType<typeof findLlmModelOption>;
  placeholder?: string;
}) {
  return (
    <div className={`agent-flow-model-chip${model ? '' : ' agent-flow-model-chip--empty'}`}>
      <span className="agent-flow-model-chip__provider" aria-hidden="true">
        ◎
      </span>
      <span className="agent-flow-model-chip__label">{model?.label ?? placeholder}</span>
      {model?.tag ? <span className="agent-flow-model-chip__tag">{model.tag}</span> : null}
    </div>
  );
}

function ParameterRow({
  label,
  value,
  enabled,
  onToggle,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
  formatter
}: {
  label: string;
  value: number;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatter?: (value: number) => string;
}) {
  return (
    <div className="agent-flow-model-settings__row">
      <div className="agent-flow-model-settings__row-head">
        <Switch size="small" checked={enabled} onChange={onToggle} />
        <Typography.Text className="agent-flow-model-settings__row-label">
          {label}
        </Typography.Text>
      </div>
      <div className="agent-flow-model-settings__row-control">
        <Slider
          disabled={!enabled}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(next) => onChange(Array.isArray(next) ? next[0] ?? value : next)}
        />
        <span className="agent-flow-model-settings__value">
          {formatter ? formatter(value) : value}
        </span>
      </div>
    </div>
  );
}

export function LlmModelField({ adapter, block }: SchemaFieldRendererProps) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const modelValue = adapter.getValue(block.path);
  const model =
    typeof modelValue === 'string' ? findLlmModelOption(modelValue) : null;
  const temperature = clampNumber(adapter.getValue('config.temperature'), 0.7);
  const topP = clampNumber(adapter.getValue('config.top_p'), 1);
  const presencePenalty = clampNumber(adapter.getValue('config.presence_penalty'), 0);
  const frequencyPenalty = clampNumber(adapter.getValue('config.frequency_penalty'), 0);
  const maxTokens = clampNumber(adapter.getValue('config.max_tokens'), 512);
  const seed = clampNumber(adapter.getValue('config.seed'), 0);

  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    if (!query) {
      return llmModelOptions;
    }

    return llmModelOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [searchValue]);

  function openSettings() {
    setOpen(true);
  }

  function closeSettings() {
    setOpen(false);
    setPickerOpen(false);
    setSearchValue('');
  }

  function selectModel(nextValue: string) {
    adapter.setValue(block.path, nextValue);
    setPickerOpen(false);
    setSearchValue('');
  }

  return (
    <>
      <div className="agent-flow-model-field">
        <button
          type="button"
          aria-label={block.label}
          className="agent-flow-model-field__trigger"
          onClick={openSettings}
        >
          <ModelChip model={model} />
          <span className="agent-flow-model-field__caret" aria-hidden="true">
            ▾
          </span>
        </button>
        <button
          type="button"
          aria-label={`${block.label}设置`}
          className="agent-flow-model-field__settings"
          onClick={openSettings}
        >
          <SettingOutlined />
        </button>
      </div>
      <Modal
        open={open}
        footer={null}
        width={560}
        title="模型设置"
        closeIcon={<CloseOutlined />}
        onCancel={closeSettings}
        className="agent-flow-model-settings"
      >
        <div className="agent-flow-model-settings__selector-shell">
          <button
            type="button"
            aria-label="选择模型"
            className="agent-flow-model-settings__selector"
            onClick={() => setPickerOpen((value) => !value)}
          >
            <ModelChip model={model} />
            <span className="agent-flow-model-settings__selector-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {pickerOpen ? (
            <div className="agent-flow-model-settings__dropdown">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                aria-label="搜索模型"
                placeholder="搜索模型"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
              <div className="agent-flow-model-settings__group-head">
                <span>OpenAI</span>
                <span>AI 积分</span>
              </div>
              <div className="agent-flow-model-settings__options">
                {filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`agent-flow-model-settings__option${
                      option.value === model?.value ? ' agent-flow-model-settings__option--active' : ''
                    }`}
                    onClick={() => selectModel(option.value)}
                  >
                    <ModelChip model={option} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="agent-flow-model-settings__provider-link"
                onClick={() => undefined}
              >
                <SettingOutlined />
                模型供应商设置
              </button>
            </div>
          ) : null}
        </div>
        <div className="agent-flow-model-settings__header">
          <Typography.Title level={5}>参数</Typography.Title>
          <Button type="default" size="small">
            加载预设
          </Button>
        </div>
        <div className="agent-flow-model-settings__rows">
          <ParameterRow
            label="温度"
            value={temperature}
            enabled
            onToggle={() => undefined}
            onChange={(next) => adapter.setValue('config.temperature', next)}
            formatter={(value) => value.toFixed(1)}
          />
          <ParameterRow
            label="Top P"
            value={topP}
            enabled={Boolean(adapter.getValue('config.top_p_enabled'))}
            onToggle={(checked) => adapter.setValue('config.top_p_enabled', checked)}
            onChange={(next) => adapter.setValue('config.top_p', next)}
            formatter={(value) => value.toFixed(1)}
          />
          <ParameterRow
            label="存在惩罚"
            value={presencePenalty}
            enabled={Boolean(adapter.getValue('config.presence_penalty_enabled'))}
            onToggle={(checked) =>
              adapter.setValue('config.presence_penalty_enabled', checked)
            }
            onChange={(next) => adapter.setValue('config.presence_penalty', next)}
            min={-2}
            max={2}
            formatter={(value) => value.toFixed(1)}
          />
          <ParameterRow
            label="频率惩罚"
            value={frequencyPenalty}
            enabled={Boolean(adapter.getValue('config.frequency_penalty_enabled'))}
            onToggle={(checked) =>
              adapter.setValue('config.frequency_penalty_enabled', checked)
            }
            onChange={(next) => adapter.setValue('config.frequency_penalty', next)}
            min={-2}
            max={2}
            formatter={(value) => value.toFixed(1)}
          />
          <ParameterRow
            label="最大标记"
            value={maxTokens}
            enabled={Boolean(adapter.getValue('config.max_tokens_enabled'))}
            onToggle={(checked) => adapter.setValue('config.max_tokens_enabled', checked)}
            onChange={(next) => adapter.setValue('config.max_tokens', next)}
            min={1}
            max={4096}
            step={1}
            formatter={(value) => String(Math.round(value))}
          />
          <ParameterRow
            label="种子"
            value={seed}
            enabled={Boolean(adapter.getValue('config.seed_enabled'))}
            onToggle={(checked) => adapter.setValue('config.seed_enabled', checked)}
            onChange={(next) => adapter.setValue('config.seed', next)}
            min={0}
            max={9999}
            step={1}
            formatter={(value) => String(Math.round(value))}
          />
        </div>
      </Modal>
    </>
  );
}
