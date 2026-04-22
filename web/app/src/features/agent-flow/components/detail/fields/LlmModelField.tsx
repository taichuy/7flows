import { CloseOutlined, SettingOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Modal, Select, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';

import type { SchemaFieldRendererProps } from '../../../../../shared/schema-ui/registry/create-renderer-registry';
import {
  fetchModelProviderOptions,
  modelProviderOptionsQueryKey
} from '../../../api/model-provider-options';
import {
  buildLlmParameterState,
  getLlmModelProvider
} from '../../../lib/llm-node-config';
import {
  findLlmModelOption,
  findLlmProviderOption,
  listLlmProviderOptions,
  type LlmModelOption
} from '../../../lib/model-options';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNodeConfig(adapter: SchemaFieldRendererProps['adapter']) {
  const node = adapter.getDerived('node') as { config?: Record<string, unknown> } | null | undefined;
  return isRecord(node?.config) ? node.config : {};
}

function ModelChip({
  providerLabel,
  modelLabel,
  tag,
  placeholder = '选择模型'
}: {
  providerLabel?: string | null;
  modelLabel?: string | null;
  tag?: string;
  placeholder?: string;
}) {
  return (
    <div
      className={`agent-flow-model-chip${modelLabel ? '' : ' agent-flow-model-chip--empty'}`}
    >
      <span className="agent-flow-model-chip__provider" aria-hidden="true">
        ◎
      </span>
      <span className="agent-flow-model-chip__content">
        <span className="agent-flow-model-chip__eyebrow">
          {providerLabel || '模型供应商'}
        </span>
        <span className="agent-flow-model-chip__label">{modelLabel || placeholder}</span>
      </span>
      {tag ? <span className="agent-flow-model-chip__tag">{tag}</span> : null}
    </div>
  );
}

function getProviderSelection(option: ReturnType<typeof listLlmProviderOptions>[number] | undefined) {
  const nextModel = option?.models[0] ?? null;

  return {
    provider_code: option?.value ?? '',
    model_id: nextModel?.value ?? '',
    protocol: option?.protocol,
    provider_label: option?.label,
    model_label: nextModel?.label,
    schema_fetched_at: nextModel ? new Date().toISOString() : undefined
  };
}

export function LlmModelField({ adapter, block }: SchemaFieldRendererProps) {
  const [open, setOpen] = useState(false);
  const providerOptionsQuery = useQuery({
    queryKey: modelProviderOptionsQueryKey,
    queryFn: fetchModelProviderOptions
  });
  const config = getNodeConfig(adapter);
  const modelProvider = getLlmModelProvider(config);
  const providerCode = modelProvider.provider_code.trim();
  const modelValue = modelProvider.model_id.trim();
  const providerOptions = useMemo(
    () => listLlmProviderOptions(providerOptionsQuery.data),
    [providerOptionsQuery.data]
  );
  const selectedProvider = findLlmProviderOption(providerOptionsQuery.data, providerCode);
  const selectedModel = findLlmModelOption(providerOptionsQuery.data, providerCode, modelValue);

  const providerUnavailable = Boolean(
    providerCode && providerOptionsQuery.isSuccess && selectedProvider === null
  );
  const modelUnavailable = Boolean(
    providerCode && modelValue && providerOptionsQuery.isSuccess && selectedModel === null
  );
  const hasProviderOptions = providerOptions.length > 0;
  const hasSelectedProviderModels = (selectedProvider?.models.length ?? 0) > 0;

  function closeSettings() {
    setOpen(false);
  }

  function selectProvider(nextProviderCode: string) {
    const nextProvider = providerOptions.find((option) => option.value === nextProviderCode);
    const nextSelection = getProviderSelection(nextProvider);

    adapter.setValue('config.model_provider', nextSelection);
    adapter.setValue(
      'config.llm_parameters',
      buildLlmParameterState(nextProvider?.models[0]?.parameterForm ?? null)
    );
  }

  function selectModel(nextModel: LlmModelOption) {
    adapter.setValue('config.model_provider', {
      provider_code: nextModel.providerCode,
      model_id: nextModel.value,
      protocol: nextModel.protocol,
      provider_label: nextModel.providerLabel,
      model_label: nextModel.label,
      schema_fetched_at: new Date().toISOString()
    });
    adapter.setValue('config.llm_parameters', buildLlmParameterState(nextModel.parameterForm));
  }

  return (
    <>
      <Space.Compact block>
        <Select
          showSearch
          allowClear
          aria-label="模型供应商"
          placeholder="选择模型供应商"
          value={providerCode || undefined}
          options={providerOptions.map((option) => ({
            label: option.label,
            value: option.value
          }))}
          optionFilterProp="label"
          onChange={(value) => {
            selectProvider(typeof value === 'string' ? value : '');
          }}
          onClear={() => {
            adapter.setValue('config.model_provider', {
              provider_code: '',
              model_id: '',
              protocol: undefined,
              provider_label: undefined,
              model_label: undefined,
              schema_fetched_at: undefined
            });
            adapter.setValue('config.llm_parameters', buildLlmParameterState(null));
          }}
          style={{ flex: '1 1 auto', minWidth: 0 }}
        />
        <Button
          type="default"
          aria-label={`${block.label}设置`}
          className="agent-flow-model-field__settings"
          icon={<SettingOutlined />}
          onClick={() => setOpen(true)}
          style={{ flex: '0 0 44px', width: 44, paddingInline: 0 }}
        />
      </Space.Compact>
      <Modal
        open={open}
        footer={null}
        width={560}
        title="模型设置"
        closeIcon={<CloseOutlined />}
        onCancel={closeSettings}
        className="agent-flow-model-settings"
      >
        {providerOptionsQuery.isError ? (
          <Alert
            className="agent-flow-model-settings__notice"
            type="error"
            showIcon
            message="模型供应商列表加载失败。"
          />
        ) : null}
        {providerUnavailable ? (
          <Alert
            className="agent-flow-model-settings__notice"
            type="error"
            showIcon
            message="当前节点引用的模型供应商不可用。"
          />
        ) : null}
        {modelUnavailable ? (
          <Alert
            className="agent-flow-model-settings__notice"
            type="error"
            showIcon
            message="当前节点引用的模型不在该供应商的生效模型列表中。"
          />
        ) : null}
        <div className="agent-flow-model-settings__section">
          <Typography.Title level={5} className="agent-flow-model-settings__section-title">
            生效模型
          </Typography.Title>
          <Typography.Text className="agent-flow-model-settings__section-subtitle">
            这里只展示该模型供应商在“模型供应商设置”里已经启用的模型。
          </Typography.Text>
          <Select
            showSearch
            aria-label="生效模型"
            placeholder={selectedProvider ? '选择生效模型' : '请先选择模型供应商'}
            value={selectedModel?.value ?? (modelValue || undefined)}
            disabled={!selectedProvider || !hasSelectedProviderModels}
            options={(selectedProvider?.models ?? []).map((option) => ({
              label: option.label,
              value: option.value
            }))}
            optionFilterProp="label"
            onChange={(value) => {
              const nextModel =
                selectedProvider?.models.find((option) => option.value === value) ?? null;
              if (nextModel) {
                selectModel(nextModel);
              }
            }}
          />
          {!selectedProvider && hasProviderOptions ? (
            <Typography.Text type="secondary">请先在节点里选择模型供应商。</Typography.Text>
          ) : null}
          {selectedProvider && !hasSelectedProviderModels ? (
            <Typography.Text type="secondary">当前供应商还没有配置生效模型。</Typography.Text>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
