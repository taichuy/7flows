import { CloseOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Divider, Empty, Modal, Select, Typography } from 'antd';
import { useMemo, useState } from 'react';

import type { SchemaFieldRendererProps } from '../../../../../shared/schema-ui/registry/create-renderer-registry';
import type {
  SchemaDynamicFormBlock
} from '../../../../../shared/schema-ui/contracts/canvas-node-schema';
import {
  fetchModelProviderOptions,
  modelProviderOptionsQueryKey
} from '../../../api/model-provider-options';
import {
  buildLlmParameterState,
  getLlmModelProvider,
  getLlmParameters,
  resolveLlmParameterStateOnModelChange
} from '../../../lib/llm-node-config';
import {
  findLlmModelOption,
  findLlmProviderOption,
  formatLlmTokenCount,
  listLlmProviderOptions,
  type LlmModelGroup,
  type LlmModelOption,
  type LlmProviderOption
} from '../../../lib/model-options';
import { LlmParameterForm } from './LlmParameterForm';

const EMPTY_MODEL_PROVIDER = {
  provider_code: '',
  source_instance_id: '',
  model_id: '',
  protocol: undefined,
  provider_label: undefined,
  model_label: undefined,
  schema_fetched_at: undefined
} as const;

const LLM_PARAMETERS_BLOCK: SchemaDynamicFormBlock = {
  kind: 'dynamic_form',
  form_key: 'llm_parameters',
  title: 'LLM 参数',
  empty_text: '请先选择模型，随后再调整参数。'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNodeConfig(adapter: SchemaFieldRendererProps['adapter']) {
  const node = adapter.getDerived('node') as { config?: Record<string, unknown> } | null | undefined;
  return isRecord(node?.config) ? node.config : {};
}

function getModelSearchText(provider: LlmProviderOption, group: LlmModelGroup, model: LlmModelOption) {
  return [
    provider.label,
    provider.providerCode,
    group.label,
    group.sourceInstanceId,
    model.label,
    model.value,
    model.tag
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildModelSelection(nextModel: LlmModelOption) {
  return {
    provider_code: nextModel.providerCode,
    source_instance_id: nextModel.sourceInstanceId,
    model_id: nextModel.value,
    protocol: nextModel.protocol,
    provider_label: nextModel.providerLabel,
    model_label: nextModel.label,
    schema_fetched_at: new Date().toISOString()
  };
}

function buildContextLabel(value: number | null | undefined) {
  const formattedValue = formatLlmTokenCount(value);
  return formattedValue ? `上下文 ${formattedValue}` : null;
}

function buildOutputLabel(value: number | null | undefined) {
  const formattedValue = formatLlmTokenCount(value);
  return formattedValue ? `输出 ${formattedValue}` : null;
}

function ModelChip({
  providerLabel,
  modelLabel,
  details = [],
  placeholder = '选择供应商和模型'
}: {
  providerLabel?: string | null;
  modelLabel?: string | null;
  details?: Array<string | null | undefined>;
  placeholder?: string;
}) {
  const detailItems = details.filter(Boolean);

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
        {detailItems.length > 0 ? (
          <span className="agent-flow-model-chip__meta">
            {detailItems.map((detail) => (
              <span key={detail} className="agent-flow-model-chip__meta-item">
                {detail}
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function LlmModelField({ adapter, block }: SchemaFieldRendererProps) {
  const [open, setOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [expandedProviders, setExpandedProviders] = useState<string[]>([]);
  const providerOptionsQuery = useQuery({
    queryKey: modelProviderOptionsQueryKey,
    queryFn: fetchModelProviderOptions,
    staleTime: 60_000
  });
  const config = getNodeConfig(adapter);
  const modelProvider = getLlmModelProvider(config);
  const currentParameters = getLlmParameters(config);
  const providerCode = modelProvider.provider_code.trim();
  const sourceInstanceId = modelProvider.source_instance_id.trim();
  const modelValue = modelProvider.model_id.trim();
  const providerOptions = useMemo(
    () => listLlmProviderOptions(providerOptionsQuery.data),
    [providerOptionsQuery.data]
  );
  const selectedProvider = findLlmProviderOption(providerOptionsQuery.data, providerCode);
  const selectedModel = findLlmModelOption(
    providerOptionsQuery.data,
    providerCode,
    sourceInstanceId,
    modelValue
  );
  const selectedSourceInstanceLabel =
    selectedModel?.sourceInstanceLabel ??
    selectedProvider?.modelGroups.find((group) => group.sourceInstanceId === sourceInstanceId)
      ?.label ??
    (sourceInstanceId || null);
  const providerUnavailable = Boolean(
    providerCode && providerOptionsQuery.isSuccess && selectedProvider === null
  );
  const modelUnavailable = Boolean(
    providerCode && modelValue && providerOptionsQuery.isSuccess && selectedModel === null
  );
  const filteredProviders = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    if (!normalizedSearch) {
      return providerOptions;
    }

    return providerOptions
      .map((provider) => ({
        ...provider,
        modelGroups: provider.modelGroups
          .map((group) => ({
            ...group,
            models: group.models.filter((model) =>
              getModelSearchText(provider, group, model).includes(normalizedSearch)
            )
          }))
          .filter((group) => group.models.length > 0)
      }))
      .filter((provider) => provider.modelGroups.length > 0);
  }, [providerOptions, searchText]);
  const selectOptions = useMemo(
    () =>
      providerOptions.flatMap((provider) =>
        provider.modelGroups.flatMap((group) =>
          group.models.map((model) => ({
            value: model.selectionValue,
            label: model.label
          }))
        )
      ),
    [providerOptions]
  );

  function clearSelection() {
    adapter.setValue('config.model_provider', EMPTY_MODEL_PROVIDER);
    adapter.setValue('config.llm_parameters', buildLlmParameterState(null));
  }

  function selectModel(nextModel: LlmModelOption) {
    const nextProvider =
      providerOptions.find((provider) => provider.providerCode === nextModel.providerCode) ?? null;

    adapter.setValue('config.model_provider', buildModelSelection(nextModel));
    adapter.setValue(
      'config.llm_parameters',
      resolveLlmParameterStateOnModelChange({
        currentProviderCode: providerCode,
        nextProviderCode: nextModel.providerCode,
        currentParameters,
        nextSchema: nextProvider?.parameterForm
      })
    );
    setDropdownOpen(false);
    setSearchText('');
    setExpandedProviders([nextModel.providerCode]);
  }

  function toggleProvider(providerValue: string) {
    setExpandedProviders((current) =>
      current.includes(providerValue)
        ? current.filter((value) => value !== providerValue)
        : [...current, providerValue]
    );
  }

  function handleDropdownOpenChange(nextOpen: boolean) {
    setDropdownOpen(nextOpen);

    if (nextOpen) {
      setExpandedProviders((current) => {
        const allProviderValues = providerOptions.map((provider) => provider.value);

        if (searchText.trim().length > 0) {
          return filteredProviders.map((provider) => provider.value);
        }

        if (current.length > 0) {
          return current;
        }

        return allProviderValues;
      });
      return;
    }

    setSearchText('');
  }

  return (
    <>
      <button
        type="button"
        aria-label={block.label}
        className="agent-flow-model-field__trigger"
        onClick={() => setOpen(true)}
      >
        <ModelChip
          providerLabel={
            modelProvider.provider_label?.trim() ||
            selectedModel?.providerLabel ||
            selectedProvider?.label ||
            providerCode ||
            null
          }
          modelLabel={modelProvider.model_label?.trim() || selectedModel?.label || modelValue || null}
          details={[
            selectedSourceInstanceLabel,
            buildContextLabel(selectedModel?.effectiveContextWindow)
          ]}
        />
        <span className="agent-flow-model-field__trigger-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      <Modal
        open={open}
        footer={null}
        width={720}
        title={
          <Typography.Title level={4} className="agent-flow-model-settings__modal-title">
            模型设置
          </Typography.Title>
        }
        closeIcon={<CloseOutlined />}
        onCancel={() => setOpen(false)}
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
          <div className="agent-flow-model-settings__header">
            <Typography.Title level={5} className="agent-flow-model-settings__section-title">
              模型
            </Typography.Title>
            {providerCode || modelValue ? (
              <Button type="link" onClick={clearSelection}>
                清空
              </Button>
            ) : null}
          </div>
          <Typography.Text className="agent-flow-model-settings__section-subtitle">
            主实例是供应商级聚合视图；节点实际仍保存来源实例与模型。
          </Typography.Text>
          <Select
            aria-label="选择供应商和模型"
            className="agent-flow-model-settings__select"
            placeholder="选择供应商和模型"
            value={selectedModel?.selectionValue}
            options={selectOptions}
            showSearch
            allowClear={false}
            filterOption={false}
            popupMatchSelectWidth
            open={dropdownOpen}
            onOpenChange={handleDropdownOpenChange}
            onSearch={setSearchText}
            popupRender={() => (
              <div className="agent-flow-model-settings__dropdown">
                {filteredProviders.length === 0 ? (
                  <div className="agent-flow-model-settings__empty">
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        searchText.trim().length > 0 ? '没有匹配的模型结果' : '当前还没有可选模型'
                      }
                    />
                  </div>
                ) : (
                  <div className="agent-flow-model-settings__provider-sections">
                    {filteredProviders.map((provider) => {
                      const providerExpanded =
                        searchText.trim().length > 0 || expandedProviders.includes(provider.value);

                      return (
                        <section
                          key={provider.value}
                          className="agent-flow-model-settings__provider-section"
                        >
                          <button
                            type="button"
                            className="agent-flow-model-settings__provider-head"
                            aria-expanded={providerExpanded}
                            onClick={() => toggleProvider(provider.value)}
                          >
                            <div>
                              <Typography.Text strong>{provider.label}</Typography.Text>
                              <div className="agent-flow-model-settings__provider-meta">
                                主实例聚合 · {provider.modelGroups.length} 个来源实例 ·{' '}
                                {provider.models.length} 个模型
                              </div>
                            </div>
                            <span className="agent-flow-model-settings__provider-caret" aria-hidden="true">
                              {providerExpanded ? '▾' : '▸'}
                            </span>
                          </button>
                          {providerExpanded
                            ? provider.modelGroups.map((group) => (
                                <div
                                  key={group.key}
                                  className="agent-flow-model-settings__provider-group"
                                >
                                  <div className="agent-flow-model-settings__group-head">
                                    <span>{group.label}</span>
                                    <span>{group.models.length} 个模型</span>
                                  </div>
                                  <div className="agent-flow-model-settings__options">
                                    {group.models.map((option) => {
                                      const active =
                                        option.sourceInstanceId === sourceInstanceId &&
                                        option.value === modelValue;

                                      return (
                                        <button
                                          key={option.selectionValue}
                                          type="button"
                                          aria-label={`${provider.label} ${group.label} ${option.label}`}
                                          className={[
                                            'agent-flow-model-settings__option',
                                            active
                                              ? 'agent-flow-model-settings__option--active'
                                              : null
                                          ]
                                            .filter(Boolean)
                                            .join(' ')}
                                          onClick={() => selectModel(option)}
                                        >
                                          <span className="agent-flow-model-settings__option-main">
                                            {option.label}
                                          </span>
                                          <span className="agent-flow-model-settings__option-meta">
                                            <span>{option.value}</span>
                                            {buildContextLabel(option.effectiveContextWindow) ? (
                                              <span>
                                                {buildContextLabel(option.effectiveContextWindow)}
                                              </span>
                                            ) : null}
                                            {buildOutputLabel(option.maxOutputTokens) ? (
                                              <span>{buildOutputLabel(option.maxOutputTokens)}</span>
                                            ) : null}
                                            {option.tag ? <span>{option.tag}</span> : null}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))
                            : null}
                        </section>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  className="agent-flow-model-settings__provider-link"
                  onClick={() => window.location.assign('/settings/model-providers')}
                >
                  模型供应商设置
                </button>
              </div>
            )}
          />
        </div>

        <Divider />

        <div className="agent-flow-model-settings__section">
          <Typography.Title level={5} className="agent-flow-model-settings__section-title">
            参数
          </Typography.Title>
          <LlmParameterForm adapter={adapter} block={LLM_PARAMETERS_BLOCK} />
        </div>
      </Modal>
    </>
  );
}
