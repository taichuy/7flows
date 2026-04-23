import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Empty,
  Input,
  InputNumber,
  Select,
  Slider,
  Switch,
  Typography
} from 'antd';
import { useMemo } from 'react';

import type { SchemaDynamicFormRendererProps } from '../../../../../shared/schema-ui/registry/create-renderer-registry';
import {
  fetchModelProviderOptions,
  modelProviderOptionsQueryKey
} from '../../../api/model-provider-options';
import {
  DEFAULT_LLM_PARAMETERS,
  getLlmModelProvider,
  getLlmParameters,
  type LlmNodeParameters
} from '../../../lib/llm-node-config';
import {
  findLlmModelOption,
  findLlmProviderOption
} from '../../../lib/model-options';

function getNodeConfig(adapter: SchemaDynamicFormRendererProps['adapter']) {
  const node = adapter.getDerived('node') as
    | { config?: Record<string, unknown> }
    | null
    | undefined;
  return node?.config ?? {};
}

function getFieldValue(parameters: LlmNodeParameters, key: string) {
  return parameters.items[key]?.value;
}

function getFieldEnabled(
  parameters: LlmNodeParameters,
  key: string,
  alwaysEnabled: boolean
) {
  return alwaysEnabled ? true : Boolean(parameters.items[key]?.enabled);
}

function updateParameters(
  adapter: SchemaDynamicFormRendererProps['adapter'],
  nextParameters: LlmNodeParameters
) {
  adapter.setValue('config.llm_parameters', nextParameters);
}

function renderFieldControl({
  field,
  enabled,
  value,
  nextParameters
}: {
  field: NonNullable<
    NonNullable<ReturnType<typeof findLlmProviderOption>>['parameterForm']
  >['fields'][number];
  enabled: boolean;
  value: unknown;
  nextParameters: (nextValue: unknown) => void;
}) {
  if (field.control === 'slider') {
    return (
      <Slider
        disabled={!enabled}
        min={field.min ?? 0}
        max={field.max ?? 1}
        step={field.step ?? 0.1}
        value={
          typeof value === 'number' ? value : Number(field.default_value ?? 0)
        }
        onChange={(next) =>
          nextParameters(Array.isArray(next) ? (next[0] ?? 0) : next)
        }
      />
    );
  }

  if (field.control === 'switch' || field.type === 'boolean') {
    return (
      <Switch
        checked={Boolean(value)}
        disabled={!enabled}
        onChange={(checked) => nextParameters(checked)}
      />
    );
  }

  if (field.control === 'select' || field.type === 'enum') {
    return (
      <Select
        style={{ width: '100%' }}
        disabled={!enabled}
        value={value as string | number | boolean | undefined}
        options={(field.options ?? []).map((option) => ({
          label: option.label,
          value: option.value
        }))}
        onChange={(next) => nextParameters(next)}
      />
    );
  }

  if (field.control === 'textarea') {
    return (
      <Input.TextArea
        rows={4}
        disabled={!enabled}
        value={typeof value === 'string' ? value : String(value ?? '')}
        placeholder={field.placeholder}
        onChange={(event) => nextParameters(event.target.value)}
      />
    );
  }

  if (field.control === 'json_editor' || field.type === 'json') {
    return (
      <Input.TextArea
        rows={6}
        disabled={!enabled}
        value={
          typeof value === 'string'
            ? value
            : JSON.stringify(value ?? field.default_value ?? {}, null, 2)
        }
        placeholder={field.placeholder}
        onChange={(event) => nextParameters(event.target.value)}
      />
    );
  }

  if (
    field.type === 'integer' ||
    field.type === 'number' ||
    field.control === 'number'
  ) {
    return (
      <InputNumber
        style={{ width: '100%' }}
        disabled={!enabled}
        min={field.min}
        max={field.max}
        step={field.step ?? (field.type === 'integer' ? 1 : 0.1)}
        precision={field.precision}
        value={typeof value === 'number' ? value : undefined}
        onChange={(next) => nextParameters(next)}
      />
    );
  }

  return (
    <Input
      disabled={!enabled}
      value={typeof value === 'string' ? value : String(value ?? '')}
      placeholder={field.placeholder}
      onChange={(event) => nextParameters(event.target.value)}
    />
  );
}

export function LlmParameterForm({
  adapter,
  block
}: SchemaDynamicFormRendererProps) {
  const providerOptionsQuery = useQuery({
    queryKey: modelProviderOptionsQueryKey,
    queryFn: fetchModelProviderOptions,
    staleTime: 60_000
  });
  const config = getNodeConfig(adapter);
  const modelProvider = getLlmModelProvider(config);
  const parameters = getLlmParameters(config);
  const selectedProvider = findLlmProviderOption(
    providerOptionsQuery.data,
    modelProvider.provider_code
  );
  const selectedModel = findLlmModelOption(
    providerOptionsQuery.data,
    modelProvider.provider_code,
    modelProvider.source_instance_id,
    modelProvider.model_id
  );
  const parameterForm = selectedProvider?.parameterForm ?? null;

  const groupedFields = useMemo(() => {
    if (!parameterForm) {
      return [];
    }

    const sortedFields = [...parameterForm.fields].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0)
    );
    const groups = new Map<string, typeof sortedFields>();

    for (const field of sortedFields) {
      const key = field.group || 'general';
      const group = groups.get(key) ?? [];
      group.push(field);
      groups.set(key, group);
    }

    return [...groups.entries()];
  }, [parameterForm]);

  if (providerOptionsQuery.isPending) {
    return (
      <Typography.Text type="secondary">正在加载参数 schema…</Typography.Text>
    );
  }

  if (providerOptionsQuery.isError) {
    return <Alert type="error" showIcon message="参数 schema 加载失败。" />;
  }

  if (!modelProvider.model_id) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={block.empty_text ?? '请先选择模型，随后再调整 LLM 参数。'}
      />
    );
  }

  if (!selectedProvider) {
    return (
      <Alert
        type="warning"
        showIcon
        message="当前模型供应商不可用，无法渲染参数表单。"
      />
    );
  }

  if (!selectedModel) {
    return (
      <Alert
        type="warning"
        showIcon
        message="当前模型不可用，无法渲染参数表单。"
      />
    );
  }

  if (!parameterForm || parameterForm.fields.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="当前供应商没有可调参数。"
      />
    );
  }

  return (
    <div className="agent-flow-llm-parameter-form">
      {groupedFields.map(([group, fields]) => (
        <div key={group} className="agent-flow-llm-parameter-form__group">
          {group !== 'general' ? (
            <Typography.Text
              type="secondary"
              className="agent-flow-llm-parameter-form__group-title"
            >
              {group}
            </Typography.Text>
          ) : null}
          <div className="agent-flow-llm-parameter-form__rows">
            {fields.map((field) => {
              const alwaysEnabled = field.send_mode === 'always';
              const enabled = getFieldEnabled(
                parameters,
                field.key,
                alwaysEnabled
              );
              const value = getFieldValue(parameters, field.key);
              const nextParameters = (
                nextValue: unknown,
                nextEnabled = enabled
              ) =>
                updateParameters(adapter, {
                  schema_version: parameterForm.schema_version,
                  items: {
                    ...parameters.items,
                    [field.key]: {
                      enabled: alwaysEnabled ? true : nextEnabled,
                      value: nextValue
                    }
                  }
                });

              return (
                <div
                  key={field.key}
                  className="agent-flow-llm-parameter-form__row"
                >
                  <div className="agent-flow-llm-parameter-form__row-label">
                    <Typography.Text strong>{field.label}</Typography.Text>
                    {field.description ? (
                      <Typography.Text
                        type="secondary"
                        className="agent-flow-llm-parameter-form__row-description"
                      >
                        {field.description}
                      </Typography.Text>
                    ) : null}
                  </div>
                  <div className="agent-flow-llm-parameter-form__row-control">
                    {renderFieldControl({
                      field,
                      enabled,
                      value,
                      nextParameters: (nextValue) => nextParameters(nextValue)
                    })}
                  </div>
                  <div className="agent-flow-llm-parameter-form__row-toggle">
                    {!alwaysEnabled ? (
                      <Switch
                        checked={enabled}
                        onChange={(checked) =>
                          nextParameters(
                            parameters.items[field.key]?.value ??
                              value ??
                              field.default_value,
                            checked
                          )
                        }
                      />
                    ) : (
                      <Typography.Text
                        type="secondary"
                        className="agent-flow-llm-parameter-form__row-fixed"
                      >
                        始终开启
                      </Typography.Text>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {Object.keys(parameters.items).length === 0 ? (
        <Typography.Text type="secondary">
          {DEFAULT_LLM_PARAMETERS.schema_version}
        </Typography.Text>
      ) : null}
    </div>
  );
}
