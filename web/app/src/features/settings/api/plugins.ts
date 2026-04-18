import {
  getConsolePluginTask,
  installConsoleOfficialPlugin,
  listConsoleOfficialPluginCatalog,
  type ConsoleOfficialPluginCatalogEntry,
  type ConsolePluginTask
} from '@1flowbase/api-client';

export type SettingsOfficialPluginCatalogEntry = ConsoleOfficialPluginCatalogEntry;
export type SettingsPluginTask = ConsolePluginTask;

export const settingsOfficialPluginsQueryKey = [
  'settings',
  'plugins',
  'official-catalog'
] as const;

export function fetchSettingsOfficialPluginCatalog() {
  return listConsoleOfficialPluginCatalog();
}

export function installSettingsOfficialPlugin(
  plugin_id: string,
  csrfToken: string
) {
  return installConsoleOfficialPlugin({ plugin_id }, csrfToken);
}

export function fetchSettingsPluginTask(taskId: string) {
  return getConsolePluginTask(taskId);
}
