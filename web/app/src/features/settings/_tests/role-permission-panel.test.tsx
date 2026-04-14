import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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

vi.mock('../api/roles', () => rolesApi);
vi.mock('../api/permissions', () => permissionsApi);

import { AppProviders } from '../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import { RolePermissionPanel } from '../components/RolePermissionPanel';

function authenticate() {
  useAuthStore.getState().setAuthenticated({
    csrfToken: 'csrf-123',
    actor: {
      id: 'user-1',
      account: 'root',
      effective_display_role: 'root',
      current_workspace_id: 'workspace-1'
    },
    me: {
      id: 'user-1',
      account: 'root',
      email: 'root@example.com',
      phone: null,
      nickname: 'Root',
      name: 'Root',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'root',
      permissions: ['role_permission.manage.all']
    }
  });
}

function renderPanel() {
  return render(
    <AppProviders>
      <RolePermissionPanel canManageRoles />
    </AppProviders>
  );
}

describe('RolePermissionPanel', () => {
  beforeEach(() => {
    resetAuthStore();
    authenticate();
    rolesApi.fetchSettingsRoles.mockResolvedValue([
      {
        code: 'manager',
        name: 'Manager',
        scope_kind: 'workspace',
        is_builtin: true,
        is_editable: true,
        auto_grant_new_permissions: false,
        is_default_member_role: true,
        permission_codes: []
      }
    ]);
    rolesApi.fetchSettingsRolePermissions.mockResolvedValue({
      role_code: 'manager',
      permission_codes: []
    });
    rolesApi.createSettingsRole.mockResolvedValue({
      code: 'qa',
      name: 'QA',
      scope_kind: 'workspace',
      is_builtin: false,
      is_editable: true,
      auto_grant_new_permissions: true,
      is_default_member_role: false,
      permission_codes: []
    });
    rolesApi.updateSettingsRole.mockResolvedValue(undefined);
    permissionsApi.fetchSettingsPermissions.mockResolvedValue([]);
  });

  test(
    'submits auto_grant_new_permissions and is_default_member_role from the create and edit dialogs',
    async () => {
      renderPanel();

      await screen.findByRole('heading', { name: '角色权限管理', level: 3 });

      fireEvent.click(screen.getByRole('button', { name: /新建角色/ }));

      const createDialog = await screen.findByRole('dialog');
      fireEvent.change(within(createDialog).getByLabelText('角色名称'), {
        target: { value: 'QA' }
      });
      fireEvent.change(within(createDialog).getByLabelText('角色编码'), {
        target: { value: 'qa' }
      });
      fireEvent.click(
        within(createDialog).getByRole('checkbox', { name: '自动接收后续新增权限' })
      );
      fireEvent.click(within(createDialog).getByRole('button', { name: 'OK' }));

      await waitFor(() => {
        expect(rolesApi.createSettingsRole).toHaveBeenCalledWith(
          {
            code: 'qa',
            name: 'QA',
            introduction: '',
            auto_grant_new_permissions: true,
            is_default_member_role: false
          },
          'csrf-123'
        );
      });

      fireEvent.click(screen.getByRole('button', { name: /编辑基本信息/ }));

      const editDialog = await screen.findByRole('dialog');
      expect(
        within(editDialog).getByRole('checkbox', { name: '默认新用户角色' })
      ).toBeChecked();
      expect(
        within(editDialog).getByRole('checkbox', { name: '自动接收后续新增权限' })
      ).not.toBeChecked();

      fireEvent.change(within(editDialog).getByLabelText('角色名称'), {
        target: { value: 'Manager Updated' }
      });
      fireEvent.click(
        within(editDialog).getByRole('checkbox', { name: '自动接收后续新增权限' })
      );
      fireEvent.click(
        within(editDialog).getByRole('checkbox', { name: '默认新用户角色' })
      );
      fireEvent.click(within(editDialog).getByRole('button', { name: 'OK' }));

      await waitFor(() => {
        expect(rolesApi.updateSettingsRole).toHaveBeenCalledWith(
          'manager',
          {
            name: 'Manager Updated',
            introduction: '',
            auto_grant_new_permissions: true,
            is_default_member_role: false
          },
          'csrf-123'
        );
      });
    },
    20000
  );
});
