import { apiFetch } from './transport';

export type ConsoleDataModelStatus =
  | 'draft'
  | 'published'
  | 'disabled'
  | 'broken';

export type ConsoleApiExposureStatus =
  | 'draft'
  | 'published_not_exposed'
  | 'api_exposed_no_permission'
  | 'api_exposed_ready'
  | 'unsafe_external_source';

export type ConsoleDataSourceKind = 'main_source' | 'external_source';
export type ConsoleDataModelScopeKind = 'workspace' | 'system';
export type ConsoleDataModelSourceKind = 'main_source' | 'external_source';
export type ConsoleDataModelPermissionProfile =
  | 'owner'
  | 'scope_all'
  | 'system_all';

export interface ConsoleDataSourceInstance {
  id: string;
  source_kind: ConsoleDataSourceKind;
  installation_id: string;
  source_code: string;
  display_name: string;
  status: string;
  default_data_model_status: ConsoleDataModelStatus;
  default_api_exposure_status: ConsoleApiExposureStatus;
  config_json: Record<string, unknown>;
  secret_ref: string | null;
  secret_version: number | null;
  catalog_refresh_status: string | null;
  catalog_last_error_message: string | null;
  catalog_refreshed_at: string | null;
}

export interface ConsoleDataModelField {
  id: string;
  code: string;
  title: string;
  physical_column_name: string;
  external_field_key: string | null;
  field_kind: string;
  is_system: boolean;
  is_writable: boolean;
  is_required: boolean;
  is_unique: boolean;
  default_value: unknown | null;
  display_interface: string | null;
  display_options: Record<string, unknown>;
  relation_target_model_id: string | null;
  relation_options: Record<string, unknown>;
  sort_order: number;
}

export interface ConsoleDataModel {
  id: string;
  scope_kind: ConsoleDataModelScopeKind;
  scope_id: string;
  code: string;
  title: string;
  status: ConsoleDataModelStatus;
  api_exposure_status: ConsoleApiExposureStatus;
  runtime_availability: string;
  data_source_instance_id: string | null;
  source_kind: ConsoleDataModelSourceKind;
  external_resource_key: string | null;
  external_table_id: string | null;
  physical_table_name: string;
  acl_namespace: string;
  audit_namespace: string;
  fields: ConsoleDataModelField[];
}

export interface ConsoleDataModelScopeGrant {
  id: string;
  scope_kind: ConsoleDataModelScopeKind;
  scope_id: string;
  data_model_id: string;
  enabled: boolean;
  permission_profile: ConsoleDataModelPermissionProfile;
}

export interface ConsoleDataModelAdvisorFinding {
  id: string;
  data_model_id: string;
  severity: 'blocking' | 'high' | 'info' | string;
  code: string;
  message: string;
  recommended_action: string;
  can_acknowledge: boolean;
}

export interface ConsoleRuntimeRecordPreview {
  items: Record<string, unknown>[];
  total: number;
}

export interface ConsoleDataModelOpenApiDocument {
  openapi: string;
  info?: Record<string, unknown>;
  paths?: Record<string, unknown>;
  components?: Record<string, unknown>;
}

export interface UpdateConsoleDataSourceDefaultsInput {
  default_data_model_status: ConsoleDataModelStatus;
  default_api_exposure_status: Exclude<
    ConsoleApiExposureStatus,
    'api_exposed_ready'
  >;
}

export interface FetchConsoleDataModelsInput {
  data_source_instance_id?: string;
}

export interface CreateConsoleDataModelInput {
  scope_kind: ConsoleDataModelScopeKind;
  data_source_instance_id?: string | null;
  external_resource_key?: string | null;
  external_table_id?: string | null;
  code: string;
  title: string;
  status?: ConsoleDataModelStatus;
}

export interface UpdateConsoleDataModelInput {
  title?: string;
  status?: ConsoleDataModelStatus;
  external_table_id?: string | null;
}

export interface UpdateConsoleDataModelApiExposureInput {
  api_exposure_status: Exclude<
    ConsoleApiExposureStatus,
    'api_exposed_ready' | 'unsafe_external_source'
  >;
}

export interface CreateConsoleDataModelFieldInput {
  code: string;
  title: string;
  external_field_key?: string | null;
  field_kind: string;
  is_required: boolean;
  is_unique: boolean;
  default_value: unknown | null;
  display_interface: string | null;
  display_options: Record<string, unknown>;
  relation_target_model_id: string | null;
  relation_options: Record<string, unknown>;
}

export interface UpdateConsoleDataModelFieldInput {
  title: string;
  is_required: boolean;
  is_unique: boolean;
  default_value: unknown | null;
  display_interface: string | null;
  display_options: Record<string, unknown>;
  relation_options: Record<string, unknown>;
}

export interface CreateConsoleDataModelScopeGrantInput {
  scope_kind: ConsoleDataModelScopeKind;
  scope_id: string;
  enabled: boolean;
  permission_profile: ConsoleDataModelPermissionProfile;
  confirm_unsafe_external_source_system_all: boolean;
}

export interface UpdateConsoleDataModelScopeGrantInput {
  enabled?: boolean;
  permission_profile?: ConsoleDataModelPermissionProfile;
  confirm_unsafe_external_source_system_all: boolean;
}

function appendQuery(path: string, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function fetchConsoleDataSourceInstances(baseUrl?: string) {
  return apiFetch<ConsoleDataSourceInstance[]>({
    path: '/api/console/data-sources/instances',
    baseUrl
  });
}

export function updateConsoleDataSourceDefaults(
  instanceId: string,
  input: UpdateConsoleDataSourceDefaultsInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataSourceInstance>({
    path: `/api/console/data-sources/instances/${instanceId}/defaults`,
    method: 'PATCH',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function fetchConsoleDataModels(
  input: FetchConsoleDataModelsInput = {},
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModel[]>({
    path: appendQuery('/api/console/models', {
      data_source_instance_id: input.data_source_instance_id
    }),
    baseUrl
  });
}

export function createConsoleDataModel(
  input: CreateConsoleDataModelInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModel>({
    path: '/api/console/models',
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function updateConsoleDataModel(
  modelId: string,
  input: UpdateConsoleDataModelInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModel>({
    path: `/api/console/models/${modelId}`,
    method: 'PATCH',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function updateConsoleDataModelApiExposure(
  modelId: string,
  input: UpdateConsoleDataModelApiExposureInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModel>({
    path: `/api/console/models/${modelId}`,
    method: 'PATCH',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function createConsoleDataModelField(
  modelId: string,
  input: CreateConsoleDataModelFieldInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModelField>({
    path: `/api/console/models/${modelId}/fields`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function updateConsoleDataModelField(
  modelId: string,
  fieldId: string,
  input: UpdateConsoleDataModelFieldInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModelField>({
    path: `/api/console/models/${modelId}/fields/${fieldId}`,
    method: 'PATCH',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function deleteConsoleDataModelField(
  modelId: string,
  fieldId: string,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<{ deleted: boolean }>({
    path: `/api/console/models/${modelId}/fields/${fieldId}?confirmed=true`,
    method: 'DELETE',
    csrfToken,
    baseUrl
  });
}

export function fetchConsoleDataModelScopeGrants(
  modelId: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModelScopeGrant[]>({
    path: `/api/console/models/${modelId}/scope-grants`,
    baseUrl
  });
}

export function createConsoleDataModelScopeGrant(
  modelId: string,
  input: CreateConsoleDataModelScopeGrantInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModelScopeGrant>({
    path: `/api/console/models/${modelId}/scope-grants`,
    method: 'POST',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function updateConsoleDataModelScopeGrant(
  modelId: string,
  grantId: string,
  input: UpdateConsoleDataModelScopeGrantInput,
  csrfToken: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModelScopeGrant>({
    path: `/api/console/models/${modelId}/scope-grants/${grantId}`,
    method: 'PATCH',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function fetchConsoleDataModelAdvisorFindings(
  modelId: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModelAdvisorFinding[]>({
    path: `/api/console/models/${modelId}/advisor-findings`,
    baseUrl
  });
}

export function fetchConsoleDataModelRecordPreview(
  modelCode: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleRuntimeRecordPreview>({
    path: `/api/runtime/models/${modelCode}/records?page=1&page_size=20`,
    baseUrl
  });
}

export function fetchConsoleDataModelOpenApiDocument(
  modelId: string,
  baseUrl?: string
) {
  return apiFetch<ConsoleDataModelOpenApiDocument>({
    path: `/api/console/docs/data-models/${modelId}/openapi.json`,
    baseUrl
  });
}
