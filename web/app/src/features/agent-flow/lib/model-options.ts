import type { AgentFlowModelProviderOptions } from '../api/model-provider-options';

export interface LlmProviderOption {
  value: string;
  label: string;
  providerCode: string;
  protocol: string;
  parameterForm: AgentFlowModelProviderOptions['providers'][number]['parameter_form'];
  modelGroups: LlmModelGroup[];
  models: LlmModelOption[];
}

export interface LlmModelGroup {
  key: string;
  label: string;
  sourceInstanceId: string;
  models: LlmModelOption[];
}

export interface LlmModelOption {
  value: string;
  selectionValue: string;
  label: string;
  providerLabel: string;
  providerCode: string;
  protocol: string;
  sourceInstanceId: string;
  sourceInstanceLabel: string;
  contextWindow: number | null;
  effectiveContextWindow: number | null;
  maxOutputTokens: number | null;
  tag?: string;
}

function toTag(source: string) {
  if (!source) {
    return undefined;
  }

  return source.replace(/_/g, ' ').toUpperCase();
}

function encodeModelSelectionValue(sourceInstanceId: string, modelId: string) {
  return `${sourceInstanceId}::${modelId}`;
}

function mapLlmModelOption(
  provider: AgentFlowModelProviderOptions['providers'][number],
  group: AgentFlowModelProviderOptions['providers'][number]['model_groups'][number],
  model: AgentFlowModelProviderOptions['providers'][number]['model_groups'][number]['models'][number]
): LlmModelOption {
  return {
    value: model.model_id,
    selectionValue: encodeModelSelectionValue(
      group.source_instance_id,
      model.model_id
    ),
    label: model.display_name || model.model_id,
    providerLabel: provider.display_name,
    providerCode: provider.provider_code,
    protocol: provider.protocol,
    sourceInstanceId: group.source_instance_id,
    sourceInstanceLabel: group.source_instance_display_name,
    contextWindow: model.context_window,
    effectiveContextWindow: model.context_window,
    maxOutputTokens: model.max_output_tokens,
    tag: toTag(model.source)
  };
}

export function formatLlmTokenCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value >= 1000000 && value % 1000000 === 0) {
    return `${value / 1000000}M`;
  }

  if (value >= 1000 && value % 1000 === 0) {
    return `${value / 1000}K`;
  }

  return String(value);
}

export function buildLlmModelMetadataSummary(model: LlmModelOption) {
  return [
    model.value,
    model.tag,
    model.effectiveContextWindow !== null
      ? `上下文 ${formatLlmTokenCount(model.effectiveContextWindow)}`
      : null,
    model.maxOutputTokens !== null
      ? `输出 ${formatLlmTokenCount(model.maxOutputTokens)}`
      : null
  ]
    .filter(Boolean)
    .join(' · ');
}

export function formatModelTokenCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value >= 1000000 && value % 1000000 === 0) {
    return `${value / 1000000}M`;
  }

  if (value >= 1000 && value % 1000 === 0) {
    return `${value / 1000}K`;
  }

  return String(value);
}

export function listLlmProviderOptions(
  options: AgentFlowModelProviderOptions | null | undefined
): LlmProviderOption[] {
  return (options?.providers ?? []).map((provider) => ({
    value: provider.provider_code,
    label: provider.display_name,
    providerCode: provider.provider_code,
    protocol: provider.protocol,
    parameterForm: provider.parameter_form,
    modelGroups: provider.model_groups.map((group) => ({
      key: group.source_instance_id,
      label: group.source_instance_display_name,
      sourceInstanceId: group.source_instance_id,
      models: group.models.map((model) => mapLlmModelOption(provider, group, model))
    })),
    models: provider.model_groups.flatMap((group) =>
      group.models.map((model) => mapLlmModelOption(provider, group, model))
    )
  }));
}

export function findLlmProviderOption(
  options: AgentFlowModelProviderOptions | null | undefined,
  providerCode: string | null | undefined
) {
  if (!providerCode) {
    return null;
  }

  return (
    listLlmProviderOptions(options).find((provider) => provider.value === providerCode) ?? null
  );
}

export function findLlmModelOption(
  options: AgentFlowModelProviderOptions | null | undefined,
  providerCode: string | null | undefined,
  sourceInstanceId: string | null | undefined,
  modelId: string | null | undefined
) {
  if (!providerCode || !sourceInstanceId || !modelId) {
    return null;
  }

  return (
    findLlmProviderOption(options, providerCode)?.models.find(
      (option) =>
        option.sourceInstanceId === sourceInstanceId && option.value === modelId
    ) ?? null
  );
}
