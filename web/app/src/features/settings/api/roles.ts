import {
  createConsoleRole,
  deleteConsoleRole,
  fetchConsoleRolePermissions,
  listConsoleRoles,
  replaceConsoleRolePermissions,
  updateConsoleRole,
  type ConsoleRole,
  type ConsoleRolePermissions,
  type CreateConsoleRoleInput,
  type ReplaceConsoleRolePermissionsInput,
  type UpdateConsoleRoleInput
} from '@1flowbase/api-client';

export type SettingsRole = ConsoleRole;
export type SettingsRolePermissions = ConsoleRolePermissions;

export const settingsRolesQueryKey = ['settings', 'roles'] as const;
export const settingsRolePermissionsQueryKey = (roleCode: string) =>
  ['settings', 'roles', roleCode, 'permissions'] as const;

export function fetchSettingsRoles(): Promise<SettingsRole[]> {
  return listConsoleRoles();
}

export function createSettingsRole(
  input: CreateConsoleRoleInput,
  csrfToken: string
): Promise<SettingsRole> {
  return createConsoleRole(input, csrfToken);
}

export function updateSettingsRole(
  roleCode: string,
  input: UpdateConsoleRoleInput,
  csrfToken: string
): Promise<void> {
  return updateConsoleRole(roleCode, input, csrfToken);
}

export function deleteSettingsRole(roleCode: string, csrfToken: string): Promise<void> {
  return deleteConsoleRole(roleCode, csrfToken);
}

export function fetchSettingsRolePermissions(
  roleCode: string
): Promise<SettingsRolePermissions> {
  return fetchConsoleRolePermissions(roleCode);
}

export function replaceSettingsRolePermissions(
  roleCode: string,
  input: ReplaceConsoleRolePermissionsInput,
  csrfToken: string
): Promise<void> {
  return replaceConsoleRolePermissions(roleCode, input, csrfToken);
}
