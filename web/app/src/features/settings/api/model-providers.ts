import {
  createConsoleModelProviderInstance,
  deleteConsoleModelProviderInstance,
  listConsoleModelProviderCatalog,
  listConsoleModelProviderInstances,
  listConsoleModelProviderOptions,
  refreshConsoleModelProviderModels,
  updateConsoleModelProviderInstance,
  validateConsoleModelProviderInstance,
  type ConsoleModelProviderCatalogEntry,
  type ConsoleModelProviderInstance,
  type ConsoleModelProviderOptions,
  type ConsoleModelProviderModelCatalog,
  type ConsoleValidateModelProviderResult,
  type CreateConsoleModelProviderInput,
  type UpdateConsoleModelProviderInput
} from '@1flowbase/api-client';

export type SettingsModelProviderCatalogEntry = ConsoleModelProviderCatalogEntry;
export type SettingsModelProviderInstance = ConsoleModelProviderInstance;
export type SettingsModelProviderOptions = ConsoleModelProviderOptions;
export type SettingsModelProviderModelCatalog = ConsoleModelProviderModelCatalog;
export type SettingsValidateModelProviderResult = ConsoleValidateModelProviderResult;
export type CreateSettingsModelProviderInput = CreateConsoleModelProviderInput;
export type UpdateSettingsModelProviderInput = UpdateConsoleModelProviderInput;

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

export function fetchSettingsModelProviderCatalog() {
  return listConsoleModelProviderCatalog();
}

export function fetchSettingsModelProviderInstances() {
  return listConsoleModelProviderInstances();
}

export function fetchSettingsModelProviderOptions() {
  return listConsoleModelProviderOptions();
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

export function deleteSettingsModelProviderInstance(
  instanceId: string,
  csrfToken: string
) {
  return deleteConsoleModelProviderInstance(instanceId, csrfToken);
}
