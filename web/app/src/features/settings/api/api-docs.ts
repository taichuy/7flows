import {
  fetchConsoleApiDocsCatalog,
  fetchConsoleApiDocsCategoryOperations,
  fetchConsoleApiOperationSpec,
  type ConsoleApiDocsCatalog,
  type ConsoleApiDocsCategoryOperations
} from '@1flowse/api-client';

export type SettingsApiDocsCatalog = ConsoleApiDocsCatalog;
export type SettingsApiDocsCategoryOperations = ConsoleApiDocsCategoryOperations;

export const settingsApiDocsCatalogQueryKey = ['settings', 'docs', 'catalog'] as const;
export const settingsApiDocsCategoryOperationsQueryKey = (categoryId: string) =>
  ['settings', 'docs', 'category', categoryId, 'operations'] as const;
export const settingsApiDocsOperationSpecQueryKey = (operationId: string) =>
  ['settings', 'docs', 'operation', operationId, 'openapi'] as const;

export function fetchSettingsApiDocsCatalog(): Promise<SettingsApiDocsCatalog> {
  return fetchConsoleApiDocsCatalog();
}

export function fetchSettingsApiDocsCategoryOperations(
  categoryId: string
): Promise<SettingsApiDocsCategoryOperations> {
  return fetchConsoleApiDocsCategoryOperations(categoryId);
}

export function fetchSettingsApiDocsOperationSpec(operationId: string) {
  return fetchConsoleApiOperationSpec(operationId);
}
