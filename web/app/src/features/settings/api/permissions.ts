import {
  listConsolePermissions,
  type ConsolePermission
} from '@1flowbase/api-client';

export type SettingsPermission = ConsolePermission;

export const settingsPermissionsQueryKey = ['settings', 'permissions'] as const;

export function fetchSettingsPermissions(): Promise<SettingsPermission[]> {
  return listConsolePermissions();
}
