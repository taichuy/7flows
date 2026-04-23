import {
  createConsoleModelProviderInstance,
  deleteConsoleModelProviderInstance,
  getConsoleModelProviderMainInstance,
  getConsoleModelProviderModels,
  listConsoleModelProviderCatalog,
  listConsoleModelProviderInstances,
  listConsoleModelProviderOptions,
  previewConsoleModelProviderModels,
  revealConsoleModelProviderSecret,
  refreshConsoleModelProviderModels,
  updateConsoleModelProviderInstance,
  updateConsoleModelProviderMainInstance,
  validateConsoleModelProviderInstance,
  type ConsoleModelProviderCatalogEntry,
  type ConsoleModelProviderInstance,
  type ConsoleModelProviderMainInstance,
  type RevealConsoleModelProviderSecretResult,
  type ConsoleModelProviderOptions,
  type ConsoleModelProviderModelCatalog,
  type ConsoleValidateModelProviderResult,
  type CreateConsoleModelProviderInput,
  type PreviewConsoleModelProviderModelsInput,
  type PreviewConsoleModelProviderModelsResponse,
  type UpdateConsoleModelProviderInput,
  type UpdateConsoleModelProviderMainInstanceInput
} from '@1flowbase/api-client';

export type SettingsModelProviderCatalogEntry = ConsoleModelProviderCatalogEntry;
export type SettingsModelProviderInstance = ConsoleModelProviderInstance;
export type SettingsModelProviderOptions = ConsoleModelProviderOptions;
export type SettingsModelProviderModelCatalog = ConsoleModelProviderModelCatalog;
export type SettingsRevealModelProviderSecretResult = RevealConsoleModelProviderSecretResult;
export type SettingsValidateModelProviderResult = ConsoleValidateModelProviderResult;
export type SettingsModelProviderMainInstance = ConsoleModelProviderMainInstance;
export type CreateSettingsModelProviderInput = CreateConsoleModelProviderInput;
export type PreviewSettingsModelProviderModelsInput = PreviewConsoleModelProviderModelsInput;
export type PreviewSettingsModelProviderModelsResponse =
  PreviewConsoleModelProviderModelsResponse;
export type UpdateSettingsModelProviderInput = UpdateConsoleModelProviderInput;
export type UpdateSettingsModelProviderMainInstanceInput =
  UpdateConsoleModelProviderMainInstanceInput;

export const settingsModelProviderCatalogQueryKey = [
  'settings',
  'model-providers',
  'catalog'
] as const;
export const settingsModelProviderInstancesQueryKey = [
  'settings',
  'model-providers',
  'instances'
] as const;
export const settingsModelProviderOptionsQueryKey = [
  'settings',
  'model-providers',
  'options'
] as const;

export function settingsModelProviderModelsQueryKey(instanceId: string) {
  return ['settings', 'model-providers', 'models', instanceId] as const;
}

export function fetchSettingsModelProviderCatalog() {
  return listConsoleModelProviderCatalog().then((response) => response.entries);
}

export function fetchSettingsModelProviderInstances() {
  return listConsoleModelProviderInstances();
}

export function fetchSettingsModelProviderOptions() {
  return listConsoleModelProviderOptions();
}

export function fetchSettingsModelProviderMainInstance(providerCode: string) {
  return getConsoleModelProviderMainInstance(providerCode);
}

export function fetchSettingsModelProviderModels(instanceId: string) {
  return getConsoleModelProviderModels(instanceId);
}

export function previewSettingsModelProviderModels(
  input: PreviewSettingsModelProviderModelsInput,
  csrfToken: string
) {
  return previewConsoleModelProviderModels(input, csrfToken);
}

export function createSettingsModelProviderInstance(
  input: CreateSettingsModelProviderInput,
  csrfToken: string
) {
  return createConsoleModelProviderInstance(input, csrfToken);
}

export function updateSettingsModelProviderInstance(
  instanceId: string,
  input: UpdateSettingsModelProviderInput,
  csrfToken: string
) {
  return updateConsoleModelProviderInstance(instanceId, input, csrfToken);
}

export function updateSettingsModelProviderMainInstance(
  providerCode: string,
  input: UpdateSettingsModelProviderMainInstanceInput,
  csrfToken: string
) {
  return updateConsoleModelProviderMainInstance(providerCode, input, csrfToken);
}

export function validateSettingsModelProviderInstance(
  instanceId: string,
  csrfToken: string
) {
  return validateConsoleModelProviderInstance(instanceId, csrfToken);
}

export function refreshSettingsModelProviderModels(
  instanceId: string,
  csrfToken: string
) {
  return refreshConsoleModelProviderModels(instanceId, csrfToken);
}

export function revealSettingsModelProviderSecret(
  instanceId: string,
  key: string,
  csrfToken: string
) {
  return revealConsoleModelProviderSecret(instanceId, key, csrfToken);
}

export function deleteSettingsModelProviderInstance(
  instanceId: string,
  csrfToken: string
) {
  return deleteConsoleModelProviderInstance(instanceId, csrfToken);
}
