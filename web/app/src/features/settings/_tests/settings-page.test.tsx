import { render, screen, waitFor } from '@testing-library/react';
import { Grid } from 'antd';
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
  settingsApiDocSpecQueryKey: vi.fn((operationId: string) => [
    'settings',
    'docs',
    'operation',
    operationId
  ]),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiOperationSpec: vi.fn()
}));

vi.mock('../api/members', () => membersApi);
vi.mock('../api/roles', () => rolesApi);
vi.mock('../api/permissions', () => permissionsApi);
vi.mock('../api/api-docs', () => docsApi);

import { AppProviders } from '../../../app/AppProviders';
import { AppRouterProvider } from '../../../app/router';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';

const useBreakpointSpy = vi.spyOn(Grid, 'useBreakpoint');

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
      email: `${effectiveDisplayRole}@example.com`,
      phone: null,
      nickname: effectiveDisplayRole,
      name: effectiveDisplayRole,
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

describe('SettingsPage', () => {
  beforeEach(() => {
    resetAuthStore();
    useBreakpointSpy.mockReturnValue({
      xs: true,
      sm: true,
      md: true,
      lg: true,
      xl: false,
      xxl: false
    });
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
      operations: []
    });
    docsApi.fetchSettingsApiOperationSpec.mockResolvedValue({
      openapi: '3.1.0',
      info: { title: '1Flowse API', version: '0.1.0' },
      paths: {},
      components: {}
    });
  });

  test('shows API 文档 only for root or api_reference.view.all', async () => {
    const rootView = (() => {
      authenticateWithPermissions([], 'root');
      return renderApp('/settings');
    })();

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/docs');
    });
    expect(await screen.findByTitle('API 文档')).toBeInTheDocument();
    rootView.unmount();

    resetAuthStore();
    authenticateWithPermissions(['route_page.view.all', 'api_reference.view.all']);
    const grantedView = renderApp('/settings');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/docs');
    });
    expect(await screen.findByTitle('API 文档')).toBeInTheDocument();
    grantedView.unmount();

    resetAuthStore();
    authenticateWithPermissions(['route_page.view.all', 'user.view.all']);
    renderApp('/settings');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/members');
    });
    expect(screen.queryByTitle('API 文档')).not.toBeInTheDocument();
  });

  test('renders /settings/members when user.view.all is present', async () => {
    authenticateWithPermissions(['route_page.view.all', 'user.view.all']);

    renderApp('/settings/members');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/members');
    });
    expect(await screen.findByRole('heading', { name: '设置', level: 4 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Section navigation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '用户管理', level: 4 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新建用户' })).not.toBeInTheDocument();
  });

  test('redirects /settings/docs to /settings/members when docs is hidden but members is visible', async () => {
    authenticateWithPermissions(['route_page.view.all', 'user.view.all']);

    renderApp('/settings/docs');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/members');
    });
    expect(await screen.findByRole('heading', { name: '设置', level: 4 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '用户管理', level: 4 })).toBeInTheDocument();
  });

  test('renders the empty settings state when no section is visible', async () => {
    authenticateWithPermissions(['route_page.view.all']);

    renderApp('/settings');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings');
    });
    expect(await screen.findByText(/当前账号暂无可访问内容/)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Section navigation' })).not.toBeInTheDocument();
  });
});
