import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const membersApi = vi.hoisted(() => ({
  settingsMembersQueryKey: ['settings', 'members'],
  fetchSettingsMembers: vi.fn(),
  createSettingsMember: vi.fn(),
  disableSettingsMember: vi.fn(),
  resetSettingsMemberPassword: vi.fn(),
  replaceSettingsMemberRoles: vi.fn()
}));

const rolesApi = vi.hoisted(() => ({
  settingsRolesQueryKey: ['settings', 'roles'],
  settingsRolePermissionsQueryKey: vi.fn((roleCode: string) => [
    'settings',
    'roles',
    roleCode,
    'permissions'
  ]),
  fetchSettingsRoles: vi.fn(),
  createSettingsRole: vi.fn(),
  updateSettingsRole: vi.fn(),
  deleteSettingsRole: vi.fn(),
  fetchSettingsRolePermissions: vi.fn(),
  replaceSettingsRolePermissions: vi.fn()
}));

const permissionsApi = vi.hoisted(() => ({
  settingsPermissionsQueryKey: ['settings', 'permissions'],
  fetchSettingsPermissions: vi.fn()
}));

const docsApi = vi.hoisted(() => ({
  settingsApiDocsCatalogQueryKey: ['settings', 'docs', 'catalog'],
  settingsApiDocsCategoryOperationsQueryKey: vi.fn((categoryId: string) => [
    'settings',
    'docs',
    'category',
    categoryId,
    'operations'
  ]),
  settingsApiDocSpecQueryKey: vi.fn((operationId: string) => [
    'settings',
    'docs',
    'operation',
    operationId
  ]),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiDocsCategoryOperations: vi.fn(),
  fetchSettingsApiOperationSpec: vi.fn()
}));

vi.mock('../../features/settings/api/members', () => membersApi);
vi.mock('../../features/settings/api/roles', () => rolesApi);
vi.mock('../../features/settings/api/permissions', () => permissionsApi);
vi.mock('../../features/settings/api/api-docs', () => docsApi);

import { AppProviders } from '../../app/AppProviders';
import { AppRouterProvider } from '../../app/router';
import { resetAuthStore, useAuthStore } from '../../state/auth-store';

function authenticateWithPermissions(
  permissions: string[],
  effectiveDisplayRole: 'manager' | 'root' = 'manager'
) {
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'csrf-123',
    actor: {
      id: 'user-1',
      account: effectiveDisplayRole,
      effective_display_role: effectiveDisplayRole,
      current_workspace_id: 'workspace-1'
    },
    me: {
      id: 'user-1',
      account: effectiveDisplayRole,
      email: 'user@example.com',
      phone: null,
      nickname: 'User',
      name: 'User',
      avatar_url: null,
      introduction: '',
      effective_display_role: effectiveDisplayRole,
      permissions
    }
  });
}

function renderApp(pathname: string) {
  window.history.pushState({}, '', pathname);

  return render(
    <AppProviders>
      <AppRouterProvider />
    </AppProviders>
  );
}

describe('section shell routing', () => {
  beforeEach(() => {
    resetAuthStore();
    membersApi.fetchSettingsMembers.mockResolvedValue([]);
    rolesApi.fetchSettingsRoles.mockResolvedValue([]);
    rolesApi.fetchSettingsRolePermissions.mockResolvedValue({
      role_code: 'manager',
      permission_codes: []
    });
    permissionsApi.fetchSettingsPermissions.mockResolvedValue([]);
    docsApi.fetchSettingsApiDocsCatalog.mockResolvedValue({
      title: '1Flowse API',
      version: '0.1.0',
      categories: []
    });
    docsApi.fetchSettingsApiDocsCategoryOperations.mockResolvedValue({
      id: 'console',
      label: 'console',
      operations: []
    });
    docsApi.fetchSettingsApiOperationSpec.mockResolvedValue({
      openapi: '3.1.0',
      info: { title: '1Flowse API', version: '0.1.0' },
      paths: {},
      components: {}
    });
  });

  test('redirects /me to /me/profile', async () => {
    authenticateWithPermissions(['route_page.view.all']);

    renderApp('/me');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/me/profile');
    });
  });

  test('redirects /settings to /settings/members when docs is hidden but members is visible', async () => {
    authenticateWithPermissions(['route_page.view.all', 'user.view.all']);

    renderApp('/settings');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/members');
    });
    expect(await screen.findByRole('heading', { name: '用户管理', level: 4 })).toBeInTheDocument();
  }, 10000);

  test('redirects /settings/docs to /settings/roles when docs is hidden but roles is visible', async () => {
    authenticateWithPermissions(['route_page.view.all', 'role_permission.view.all']);

    renderApp('/settings/docs');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/roles');
    });
    expect(await screen.findByRole('heading', { name: '角色权限管理', level: 3 })).toBeInTheDocument();
  });
});
