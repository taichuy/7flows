import type { AgentFlowModelProviderOptions } from '../api/model-provider-options';

type LocaleAwareOptions = Pick<
  AgentFlowModelProviderOptions,
  'locale_meta' | 'i18n_catalog'
>;

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function pickPreferredLocales(localeMeta: Record<string, unknown>) {
  const candidates = [
    localeMeta.resolved_locale,
    localeMeta.fallback_locale,
    'zh_Hans',
    'en_US'
  ];

  return candidates.filter(
    (value, index): value is string =>
      typeof value === 'string' && candidates.indexOf(value) === index
  );
}

function readLocalizedValue(
  bundle: Record<string, unknown>,
  dottedKey: string
): string | null {
  let current: unknown = bundle;

  for (const segment of dottedKey.split('.')) {
    current = asRecord(current)?.[segment];
    if (current === undefined) {
      return null;
    }
  }

  return typeof current === 'string' ? current : null;
}

function localizeText(
  options: LocaleAwareOptions,
  namespace: string,
  value: string | undefined
) {
  if (!value) {
    return value;
  }

  const namespaceCatalog = asRecord(options.i18n_catalog)?.[namespace];
  const localeCatalog = asRecord(namespaceCatalog);
  if (!localeCatalog) {
    return value;
  }

  for (const locale of pickPreferredLocales(options.locale_meta)) {
    const localizedBundle = asRecord(localeCatalog[locale]);
    if (!localizedBundle) {
      continue;
    }

    const localized = readLocalizedValue(localizedBundle, value);
    if (localized) {
      return localized;
    }
  }

  return value;
}

function localizeParameterForm(
  options: LocaleAwareOptions,
  provider: AgentFlowModelProviderOptions['providers'][number]
) {
  const parameterForm = provider.parameter_form;

  if (!parameterForm) {
    return parameterForm;
  }

  return {
    ...parameterForm,
    title: localizeText(options, provider.namespace, parameterForm.title),
    description: localizeText(
      options,
      provider.namespace,
      parameterForm.description
    ),
    fields: parameterForm.fields.map((field) => ({
      ...field,
      label: localizeText(options, provider.namespace, field.label) ?? field.label,
      description: localizeText(
        options,
        provider.namespace,
        field.description
      ),
      placeholder: localizeText(
        options,
        provider.namespace,
        field.placeholder
      ),
      options: field.options.map((option) => ({
        ...option,
        label:
          localizeText(options, provider.namespace, option.label) ??
          option.label,
        description: localizeText(
          options,
          provider.namespace,
          option.description
        )
      }))
    }))
  };
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
  if (!options) {
    return [];
  }

  return options.providers.map((provider) => ({
    value: provider.provider_code,
    label: provider.display_name,
    providerCode: provider.provider_code,
    protocol: provider.protocol,
    parameterForm: localizeParameterForm(options, provider),
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
