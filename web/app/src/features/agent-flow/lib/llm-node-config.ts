import type { ConsolePluginFormFieldSchema, ConsolePluginFormSchema } from '@1flowbase/api-client';

export interface LlmNodeModelProvider {
  provider_code: string;
  source_instance_id: string;
  model_id: string;
  protocol?: string;
  provider_label?: string;
  model_label?: string;
  schema_fetched_at?: string;
}

export interface LlmParameterItem {
  enabled: boolean;
  value: unknown;
}

export interface LlmNodeParameters {
  schema_version: string;
  items: Record<string, LlmParameterItem>;
}

export interface LlmNodeResponseFormat {
  mode: 'text' | 'json_object' | 'json_schema';
  schema?: Record<string, unknown>;
}

export const DEFAULT_LLM_PARAMETERS: LlmNodeParameters = {
  schema_version: '1.0.0',
  items: {}
};

export const DEFAULT_LLM_RESPONSE_FORMAT: LlmNodeResponseFormat = {
  mode: 'text'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function defaultValueByField(field: ConsolePluginFormFieldSchema): unknown {
  if (field.default_value !== undefined) {
    return field.default_value;
  }

  switch (field.type) {
    case 'boolean':
      return false;
    case 'integer':
    case 'number':
      return 0;
    case 'string_list':
      return [];
    case 'json':
      return {};
    default:
      return '';
  }
}

export function buildLlmParameterState(
  schema?: ConsolePluginFormSchema | null
): LlmNodeParameters {
  if (!schema) {
    return DEFAULT_LLM_PARAMETERS;
  }

  return {
    schema_version: schema.schema_version,
    items: Object.fromEntries(
      schema.fields.map((field) => {
        const enabled =
          field.send_mode === 'always' ? true : Boolean(field.enabled_by_default);

        return [
          field.key,
          {
            enabled,
            value: defaultValueByField(field)
          } satisfies LlmParameterItem
        ];
      })
    )
  };
}

export function resolveLlmParameterStateOnModelChange({
  currentProviderCode,
  nextProviderCode,
  currentParameters,
  nextSchema
}: {
  currentProviderCode: string;
  nextProviderCode: string;
  currentParameters: LlmNodeParameters;
  nextSchema?: ConsolePluginFormSchema | null;
}) {
  if (
    currentProviderCode.trim().length > 0 &&
    currentProviderCode.trim() === nextProviderCode.trim()
  ) {
    return currentParameters;
  }

  return buildLlmParameterState(nextSchema);
}

export function getLlmModelProvider(config: Record<string, unknown>): LlmNodeModelProvider {
  const provider = config.model_provider;

  if (!isRecord(provider)) {
    return {
      provider_code: '',
      source_instance_id: '',
      model_id: '',
      protocol: undefined,
      provider_label: undefined,
      model_label: undefined,
      schema_fetched_at: undefined
    };
  }

  return {
    provider_code: asString(provider.provider_code),
    source_instance_id: asString(provider.source_instance_id),
    model_id: asString(provider.model_id),
    protocol: asString(provider.protocol) || undefined,
    provider_label: asString(provider.provider_label) || undefined,
    model_label: asString(provider.model_label) || undefined,
    schema_fetched_at: asString(provider.schema_fetched_at) || undefined
  };
}

export function getLlmParameters(config: Record<string, unknown>): LlmNodeParameters {
  const llmParameters = config.llm_parameters;

  if (isRecord(llmParameters)) {
    const items = isRecord(llmParameters.items) ? llmParameters.items : {};

    return {
      schema_version: asString(llmParameters.schema_version) || '1.0.0',
      items: Object.fromEntries(
        Object.entries(items).map(([key, item]) => {
          if (!isRecord(item)) {
            return [key, { enabled: false, value: item } satisfies LlmParameterItem];
          }

          return [
            key,
            {
              enabled: Boolean(item.enabled),
              value: item.value
            } satisfies LlmParameterItem
          ];
        })
      )
    };
  }

  return DEFAULT_LLM_PARAMETERS;
}

export function getLlmResponseFormat(config: Record<string, unknown>): LlmNodeResponseFormat {
  const responseFormat = config.response_format;

  if (!isRecord(responseFormat)) {
    return DEFAULT_LLM_RESPONSE_FORMAT;
  }

  const mode = asString(responseFormat.mode);
  if (mode !== 'json_object' && mode !== 'json_schema') {
    return DEFAULT_LLM_RESPONSE_FORMAT;
  }

  const schema = isRecord(responseFormat.schema)
    ? (responseFormat.schema as Record<string, unknown>)
    : undefined;

  return {
    mode,
    schema
  };
}
