import {
  fetchConsoleApiDocsCatalog,
  fetchConsoleApiOperationSpec,
  type ConsoleApiDocsCatalog
} from '@1flowse/api-client';

export type SettingsApiDocsCatalog = ConsoleApiDocsCatalog;

export const settingsApiDocsCatalogQueryKey = ['settings', 'docs', 'catalog'] as const;
export const settingsApiDocSpecQueryKey = (operationId: string) =>
  ['settings', 'docs', 'operation', operationId] as const;

export function fetchSettingsApiDocsCatalog(): Promise<SettingsApiDocsCatalog> {
  return fetchConsoleApiDocsCatalog();
}

export function fetchSettingsApiOperationSpec(operationId: string) {
  return fetchConsoleApiOperationSpec(operationId);
}
