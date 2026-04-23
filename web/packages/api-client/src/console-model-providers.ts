import { apiFetch } from './transport';

export interface ConsoleModelProviderConfigField {
  key: string;
  field_type: string;
  required: boolean;
  advanced: boolean;
}

export interface ConsolePluginFormOption {
  label: string;
  value: unknown;
  description?: string;
  disabled?: boolean;
}

export interface ConsolePluginFormCondition {
  field: string;
  operator: string;
  value?: unknown;
  values: unknown[];
}

export interface ConsolePluginFormFieldSchema {
  key: string;
  label: string;
  type: string;
  control?: string;
  group?: string;
  order?: number;
  advanced?: boolean;
  required?: boolean;
  send_mode?: string;
  enabled_by_default?: boolean;
  description?: string;
  placeholder?: string;
  default_value?: unknown;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  options: ConsolePluginFormOption[];
  visible_when: ConsolePluginFormCondition[];
  disabled_when: ConsolePluginFormCondition[];
}

export interface ConsolePluginFormSchema {
  schema_version: '1.0.0' | string;
  title?: string;
  description?: string;
  fields: ConsolePluginFormFieldSchema[];
}

export interface ConsoleProviderModelDescriptor {
  model_id: string;
  display_name: string;
  source: string;
  supports_streaming: boolean;
  supports_tool_call: boolean;
  supports_multimodal: boolean;
  context_window: number | null;
  max_output_tokens: number | null;
  parameter_form: ConsolePluginFormSchema | null;
  provider_metadata: Record<string, unknown>;
}

export interface ConsoleModelProviderConfiguredModel {
  model_id: string;
  enabled: boolean;
}

export interface ConsoleModelProviderCatalogEntry {
  installation_id: string;
  provider_code: string;
  plugin_id: string;
  plugin_version: string;
  plugin_type: string;
  namespace: string;
  label_key: string;
  description_key: string | null;
  display_name: string;
  protocol: string;
  help_url: string | null;
  default_base_url: string | null;
  model_discovery_mode: string;
  supports_model_fetch_without_credentials: boolean;
  desired_state: string;
  availability_status: string;
  form_schema: ConsoleModelProviderConfigField[];
  predefined_models: ConsoleProviderModelDescriptor[];
}

export interface ConsoleModelProviderCatalogResponse {
  locale_meta: Record<string, unknown>;
  i18n_catalog: Record<string, unknown>;
  entries: ConsoleModelProviderCatalogEntry[];
}

export interface ConsoleModelProviderInstance {
  id: string;
  installation_id: string;
  provider_code: string;
  protocol: string;
  display_name: string;
  status: string;
  included_in_main: boolean;
  config_json: Record<string, unknown>;
  configured_models: ConsoleModelProviderConfiguredModel[];
  enabled_model_ids: string[];
  catalog_refresh_status: string | null;
  catalog_last_error_message: string | null;
  catalog_refreshed_at: string | null;
  model_count: number;
}

export interface CreateConsoleModelProviderInput {
  installation_id: string;
  display_name: string;
  included_in_main?: boolean;
  configured_models: ConsoleModelProviderConfiguredModel[];
  preview_token?: string | null;
  config: Record<string, unknown>;
}

export interface PreviewConsoleModelProviderModelsInput {
  installation_id?: string;
  instance_id?: string;
  config: Record<string, unknown>;
}

export interface PreviewConsoleModelProviderModelsResponse {
  models: ConsoleProviderModelDescriptor[];
  preview_token: string;
  expires_at: string;
}

export interface UpdateConsoleModelProviderInput {
  display_name: string;
  included_in_main?: boolean;
  configured_models: ConsoleModelProviderConfiguredModel[];
  preview_token?: string | null;
  config: Record<string, unknown>;
}

export interface ConsoleModelProviderMainInstance {
  provider_code: string;
  auto_include_new_instances: boolean;
}

export interface ConsoleValidateModelProviderResult {
  instance: ConsoleModelProviderInstance;
  output: Record<string, unknown>;
}

export interface ConsoleModelProviderModelCatalog {
  provider_instance_id: string;
  refresh_status: string;
  source: string;
  last_error_message: string | null;
  refreshed_at: string | null;
  models: ConsoleProviderModelDescriptor[];
}

export interface RevealConsoleModelProviderSecretResult {
  key: string;
  value: unknown;
}

export interface ConsoleModelProviderMainInstanceSummary {
  provider_code: string;
  auto_include_new_instances: boolean;
  group_count: number;
  model_count: number;
}

export interface ConsoleModelProviderOptionGroup {
  source_instance_id: string;
  source_instance_display_name: string;
  models: ConsoleProviderModelDescriptor[];
}

export interface ConsoleModelProviderOption {
  provider_code: string;
  plugin_type: string;
  namespace: string;
  label_key: string;
  description_key: string | null;
  protocol: string;
  display_name: string;
  main_instance: ConsoleModelProviderMainInstanceSummary;
  model_groups: ConsoleModelProviderOptionGroup[];
}

export interface ConsoleModelProviderOptions {
  locale_meta: Record<string, unknown>;
  i18n_catalog: Record<string, unknown>;
  providers: ConsoleModelProviderOption[];
}

export interface DeleteConsoleModelProviderResult {
  deleted: boolean;
}

export interface UpdateConsoleModelProviderMainInstanceInput {
  auto_include_new_instances: boolean;
}

export function listConsoleModelProviderCatalog(baseUrl?: string) {
  return apiFetch<ConsoleModelProviderCatalogResponse>({
    path: '/api/console/model-providers/catalog',
    baseUrl
  });
}

export function listConsoleModelProviderInstances(baseUrl?: string) {
  return apiFetch<ConsoleModelProviderInstance[]>({
    path: '/api/console/model-providers',
    baseUrl
  });
}

export function createConsoleModelProviderInstance(
  input: CreateConsoleModelProviderInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleModelProviderInstance>({
    path: '/api/console/model-providers',
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function previewConsoleModelProviderModels(
  input: PreviewConsoleModelProviderModelsInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<PreviewConsoleModelProviderModelsResponse>({
    path: '/api/console/model-providers/preview-models',
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function updateConsoleModelProviderInstance(
  instanceId: string,
  input: UpdateConsoleModelProviderInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleModelProviderInstance>({
    path: `/api/console/model-providers/${instanceId}`,
    method: 'PATCH',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function getConsoleModelProviderMainInstance(
  providerCode: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleModelProviderMainInstance>({
    path: `/api/console/model-providers/providers/${providerCode}/main-instance`,
    baseUrl
  });
}

export function updateConsoleModelProviderMainInstance(
  providerCode: string,
  input: UpdateConsoleModelProviderMainInstanceInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleModelProviderMainInstance>({
    path: `/api/console/model-providers/providers/${providerCode}/main-instance`,
    method: 'PUT',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function validateConsoleModelProviderInstance(
  instanceId: string,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleValidateModelProviderResult>({
    path: `/api/console/model-providers/${instanceId}/validate`,
    method: 'POST',
    csrfToken,
    baseUrl
  });
}

export function getConsoleModelProviderModels(instanceId: string, baseUrl?: string) {
  return apiFetch<ConsoleModelProviderModelCatalog>({
    path: `/api/console/model-providers/${instanceId}/models`,
    baseUrl
  });
}

export function refreshConsoleModelProviderModels(
  instanceId: string,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleModelProviderModelCatalog>({
    path: `/api/console/model-providers/${instanceId}/models/refresh`,
    method: 'POST',
    csrfToken,
    baseUrl
  });
}

export function revealConsoleModelProviderSecret(
  instanceId: string,
  key: string,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<RevealConsoleModelProviderSecretResult>({
    path: `/api/console/model-providers/${instanceId}/secrets/reveal`,
    method: 'POST',
    body: { key },
    csrfToken,
    baseUrl
  });
}

export function deleteConsoleModelProviderInstance(
  instanceId: string,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<DeleteConsoleModelProviderResult>({
    path: `/api/console/model-providers/${instanceId}`,
    method: 'DELETE',
    csrfToken,
    baseUrl
  });
}

export function listConsoleModelProviderOptions(baseUrl?: string) {
  return apiFetch<ConsoleModelProviderOptions>({
    path: '/api/console/model-providers/options',
    baseUrl
  });
}
