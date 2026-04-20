import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@1flowbase/api-client', () => ({
  fetchConsoleApiDocsCatalog: vi.fn().mockResolvedValue({ categories: [] }),
  fetchConsoleApiDocsCategoryOperations: vi.fn().mockResolvedValue({
    id: 'console',
    operations: []
  }),
  fetchConsoleApiOperationSpec: vi.fn().mockResolvedValue({ openapi: '3.1.0' }),
  listConsoleMembers: vi.fn().mockResolvedValue([]),
  createConsoleMember: vi.fn().mockResolvedValue({ id: 'member-1' }),
  disableConsoleMember: vi.fn().mockResolvedValue(undefined),
  resetConsoleMemberPassword: vi.fn().mockResolvedValue(undefined),
  replaceConsoleMemberRoles: vi.fn().mockResolvedValue(undefined),
  listConsolePermissions: vi.fn().mockResolvedValue([]),
  listConsoleRoles: vi.fn().mockResolvedValue([]),
  createConsoleRole: vi.fn().mockResolvedValue({ code: 'manager' }),
  updateConsoleRole: vi.fn().mockResolvedValue(undefined),
  deleteConsoleRole: vi.fn().mockResolvedValue(undefined),
  fetchConsoleRolePermissions: vi.fn().mockResolvedValue({
    role_code: 'manager',
    permission_codes: []
  }),
  replaceConsoleRolePermissions: vi.fn().mockResolvedValue(undefined),
  listConsoleModelProviderCatalog: vi.fn().mockResolvedValue({
    locale_meta: {
      requested_locale: null,
      resolved_locale: 'zh_Hans',
      user_preferred_locale: null,
      accept_language: null,
      fallback_locale: 'en_US',
      supported_locales: ['zh_Hans', 'en_US']
    },
    i18n_catalog: {},
    entries: []
  }),
  listConsoleModelProviderInstances: vi.fn().mockResolvedValue([]),
  listConsoleModelProviderOptions: vi.fn().mockResolvedValue([]),
  getConsoleModelProviderModels: vi.fn().mockResolvedValue({
    provider_instance_id: 'provider-1',
    models: []
  }),
  createConsoleModelProviderInstance: vi.fn().mockResolvedValue({
    id: 'provider-1'
  }),
  updateConsoleModelProviderInstance: vi.fn().mockResolvedValue(undefined),
  validateConsoleModelProviderInstance: vi.fn().mockResolvedValue({
    instance: { id: 'provider-1' },
    output: {}
  }),
  refreshConsoleModelProviderModels: vi.fn().mockResolvedValue({
    provider_instance_id: 'provider-1',
    models: []
  }),
  revealConsoleModelProviderSecret: vi.fn().mockResolvedValue({
    key: 'api_key',
    value: 'super-secret'
  }),
  deleteConsoleModelProviderInstance: vi.fn().mockResolvedValue(undefined),
  listConsolePluginFamilies: vi.fn().mockResolvedValue({
    locale_meta: {
      requested_locale: null,
      resolved_locale: 'zh_Hans',
      user_preferred_locale: null,
      accept_language: null,
      fallback_locale: 'en_US',
      supported_locales: ['zh_Hans', 'en_US']
    },
    i18n_catalog: {},
    entries: []
  }),
  listConsoleOfficialPluginCatalog: vi.fn().mockResolvedValue({
    source_kind: 'official_registry',
    entries: []
  }),
  installConsoleOfficialPlugin: vi.fn().mockResolvedValue({
    installation: { id: 'installation-1' }
  }),
  uploadConsolePluginPackage: vi.fn().mockResolvedValue({
    installation: { id: 'installation-upload' }
  }),
  upgradeConsolePluginFamilyLatest: vi.fn().mockResolvedValue({
    id: 'task-upgrade'
  }),
  switchConsolePluginFamilyVersion: vi.fn().mockResolvedValue({
    id: 'task-switch'
  }),
  getConsolePluginTask: vi.fn().mockResolvedValue({
    id: 'task-1'
  }),
  fetchConsoleSystemRuntimeProfile: vi.fn().mockResolvedValue({
    topology: { relationship: 'same_host' },
    hosts: []
  })
}));

import {
  fetchConsoleApiDocsCatalog,
  fetchConsoleApiDocsCategoryOperations,
  fetchConsoleApiOperationSpec,
  listConsoleMembers,
  createConsoleMember,
  disableConsoleMember,
  resetConsoleMemberPassword,
  replaceConsoleMemberRoles,
  listConsolePermissions,
  listConsoleRoles,
  createConsoleRole,
  updateConsoleRole,
  deleteConsoleRole,
  fetchConsoleRolePermissions,
  replaceConsoleRolePermissions,
  listConsoleModelProviderCatalog,
  listConsoleModelProviderInstances,
  listConsoleModelProviderOptions,
  getConsoleModelProviderModels,
  createConsoleModelProviderInstance,
  updateConsoleModelProviderInstance,
  validateConsoleModelProviderInstance,
  refreshConsoleModelProviderModels,
  revealConsoleModelProviderSecret,
  deleteConsoleModelProviderInstance,
  listConsolePluginFamilies,
  listConsoleOfficialPluginCatalog,
  installConsoleOfficialPlugin,
  uploadConsolePluginPackage,
  upgradeConsolePluginFamilyLatest,
  switchConsolePluginFamilyVersion,
  getConsolePluginTask
} from '@1flowbase/api-client';

import {
  settingsApiDocsCatalogQueryKey,
  settingsApiDocsCategoryOperationsQueryKey,
  settingsApiDocsOperationSpecQueryKey,
  fetchSettingsApiDocsCatalog,
  fetchSettingsApiDocsCategoryOperations,
  fetchSettingsApiDocsOperationSpec
} from '../api-docs';
import {
  settingsMembersQueryKey,
  fetchSettingsMembers,
  createSettingsMember,
  disableSettingsMember,
  resetSettingsMemberPassword,
  replaceSettingsMemberRoles
} from '../members';
import {
  settingsPermissionsQueryKey,
  fetchSettingsPermissions
} from '../permissions';
import {
  settingsRolesQueryKey,
  settingsRolePermissionsQueryKey,
  fetchSettingsRoles,
  createSettingsRole,
  updateSettingsRole,
  deleteSettingsRole,
  fetchSettingsRolePermissions,
  replaceSettingsRolePermissions
} from '../roles';
import {
  settingsModelProviderCatalogQueryKey,
  settingsModelProviderInstancesQueryKey,
  settingsModelProviderOptionsQueryKey,
  settingsModelProviderModelsQueryKey,
  fetchSettingsModelProviderCatalog,
  fetchSettingsModelProviderInstances,
  fetchSettingsModelProviderOptions,
  fetchSettingsModelProviderModels,
  createSettingsModelProviderInstance,
  updateSettingsModelProviderInstance,
  validateSettingsModelProviderInstance,
  refreshSettingsModelProviderModels,
  revealSettingsModelProviderSecret,
  deleteSettingsModelProviderInstance
} from '../model-providers';
import {
  settingsPluginFamiliesQueryKey,
  settingsOfficialPluginsQueryKey,
  fetchSettingsPluginFamilies,
  fetchSettingsOfficialPluginCatalog,
  installSettingsOfficialPlugin,
  uploadSettingsPluginPackage,
  upgradeSettingsPluginFamilyLatest,
  switchSettingsPluginFamilyVersion,
  fetchSettingsPluginTask
} from '../plugins';

afterEach(() => {
  vi.clearAllMocks();
});

describe('settings api wrappers', () => {
  test('forwards api docs query keys and request helpers', async () => {
    expect(settingsApiDocsCatalogQueryKey).toEqual(['settings', 'docs', 'catalog']);
    expect(settingsApiDocsCategoryOperationsQueryKey('console')).toEqual([
      'settings',
      'docs',
      'category',
      'console',
      'operations'
    ]);
    expect(settingsApiDocsOperationSpecQueryKey('op-1')).toEqual([
      'settings',
      'docs',
      'operation',
      'op-1',
      'openapi'
    ]);

    await fetchSettingsApiDocsCatalog();
    await fetchSettingsApiDocsCategoryOperations('console');
    await fetchSettingsApiDocsOperationSpec('op-1');

    expect(fetchConsoleApiDocsCatalog).toHaveBeenCalledTimes(1);
    expect(fetchConsoleApiDocsCategoryOperations).toHaveBeenCalledWith('console');
    expect(fetchConsoleApiOperationSpec).toHaveBeenCalledWith('op-1');
  });

  test('forwards members, permissions, and roles helpers', async () => {
    const memberInput = { email: 'member@example.com', name: 'Member' };
    const passwordInput = { password: 'password-123' };
    const memberRolesInput = { role_codes: ['manager'] };
    const roleInput = { code: 'manager', name: 'Manager' };
    const roleUpdateInput = { name: 'Platform Manager' };
    const rolePermissionsInput = { permission_codes: ['state_model.view.all'] };

    expect(settingsMembersQueryKey).toEqual(['settings', 'members']);
    expect(settingsPermissionsQueryKey).toEqual(['settings', 'permissions']);
    expect(settingsRolesQueryKey).toEqual(['settings', 'roles']);
    expect(settingsRolePermissionsQueryKey('manager')).toEqual([
      'settings',
      'roles',
      'manager',
      'permissions'
    ]);

    await fetchSettingsMembers();
    await createSettingsMember(memberInput as never, 'csrf-123');
    await disableSettingsMember('member-1', 'csrf-123');
    await resetSettingsMemberPassword('member-1', passwordInput as never, 'csrf-123');
    await replaceSettingsMemberRoles('member-1', memberRolesInput as never, 'csrf-123');
    await fetchSettingsPermissions();
    await fetchSettingsRoles();
    await createSettingsRole(roleInput as never, 'csrf-123');
    await updateSettingsRole('manager', roleUpdateInput as never, 'csrf-123');
    await deleteSettingsRole('manager', 'csrf-123');
    await fetchSettingsRolePermissions('manager');
    await replaceSettingsRolePermissions('manager', rolePermissionsInput as never, 'csrf-123');

    expect(listConsoleMembers).toHaveBeenCalledTimes(1);
    expect(createConsoleMember).toHaveBeenCalledWith(memberInput, 'csrf-123');
    expect(disableConsoleMember).toHaveBeenCalledWith('member-1', 'csrf-123');
    expect(resetConsoleMemberPassword).toHaveBeenCalledWith(
      'member-1',
      passwordInput,
      'csrf-123'
    );
    expect(replaceConsoleMemberRoles).toHaveBeenCalledWith(
      'member-1',
      memberRolesInput,
      'csrf-123'
    );
    expect(listConsolePermissions).toHaveBeenCalledTimes(1);
    expect(listConsoleRoles).toHaveBeenCalledTimes(1);
    expect(createConsoleRole).toHaveBeenCalledWith(roleInput, 'csrf-123');
    expect(updateConsoleRole).toHaveBeenCalledWith('manager', roleUpdateInput, 'csrf-123');
    expect(deleteConsoleRole).toHaveBeenCalledWith('manager', 'csrf-123');
    expect(fetchConsoleRolePermissions).toHaveBeenCalledWith('manager');
    expect(replaceConsoleRolePermissions).toHaveBeenCalledWith(
      'manager',
      rolePermissionsInput,
      'csrf-123'
    );
  });

  test('forwards model provider query keys and request helpers', async () => {
    const createInput = {
      provider_code: 'openai_compatible',
      display_name: 'OpenAI Production'
    };
    const updateInput = {
      display_name: 'OpenAI Backup'
    };

    expect(settingsModelProviderCatalogQueryKey).toEqual([
      'settings',
      'model-providers',
      'catalog'
    ]);
    expect(settingsModelProviderInstancesQueryKey).toEqual([
      'settings',
      'model-providers',
      'instances'
    ]);
    expect(settingsModelProviderOptionsQueryKey).toEqual([
      'settings',
      'model-providers',
      'options'
    ]);
    expect(settingsModelProviderModelsQueryKey('provider-1')).toEqual([
      'settings',
      'model-providers',
      'models',
      'provider-1'
    ]);

    await expect(fetchSettingsModelProviderCatalog()).resolves.toEqual([]);
    await fetchSettingsModelProviderInstances();
    await fetchSettingsModelProviderOptions();
    await fetchSettingsModelProviderModels('provider-1');
    await createSettingsModelProviderInstance(createInput as never, 'csrf-123');
    await updateSettingsModelProviderInstance('provider-1', updateInput as never, 'csrf-123');
    await validateSettingsModelProviderInstance('provider-1', 'csrf-123');
    await refreshSettingsModelProviderModels('provider-1', 'csrf-123');
    await revealSettingsModelProviderSecret('provider-1', 'api_key', 'csrf-123');
    await deleteSettingsModelProviderInstance('provider-1', 'csrf-123');

    expect(listConsoleModelProviderCatalog).toHaveBeenCalledTimes(1);
    expect(listConsoleModelProviderInstances).toHaveBeenCalledTimes(1);
    expect(listConsoleModelProviderOptions).toHaveBeenCalledTimes(1);
    expect(getConsoleModelProviderModels).toHaveBeenCalledWith('provider-1');
    expect(createConsoleModelProviderInstance).toHaveBeenCalledWith(
      createInput,
      'csrf-123'
    );
    expect(updateConsoleModelProviderInstance).toHaveBeenCalledWith(
      'provider-1',
      updateInput,
      'csrf-123'
    );
    expect(validateConsoleModelProviderInstance).toHaveBeenCalledWith(
      'provider-1',
      'csrf-123'
    );
    expect(refreshConsoleModelProviderModels).toHaveBeenCalledWith(
      'provider-1',
      'csrf-123'
    );
    expect(revealConsoleModelProviderSecret).toHaveBeenCalledWith(
      'provider-1',
      'api_key',
      'csrf-123'
    );
    expect(deleteConsoleModelProviderInstance).toHaveBeenCalledWith(
      'provider-1',
      'csrf-123'
    );
  });

  test('forwards plugin query keys and request helpers', async () => {
    const uploadFile = new File(['zip'], 'provider.zip', {
      type: 'application/zip'
    });
    vi.mocked(listConsolePluginFamilies).mockResolvedValueOnce({
      locale_meta: {
        requested_locale: null,
        resolved_locale: 'zh_Hans',
        user_preferred_locale: null,
        accept_language: null,
        fallback_locale: 'en_US',
        supported_locales: ['zh_Hans', 'en_US']
      },
      i18n_catalog: {
        'plugin.openai_compatible': {
          zh_Hans: {
            plugin: {
              label: 'OpenAI 兼容插件'
            },
            provider: {
              label: 'OpenAI Compatible'
            }
          },
          en_US: {
            plugin: {
              label: 'OpenAI-Compatible API Provider'
            },
            provider: {
              label: 'OpenAI Compatible'
            }
          }
        }
      },
      entries: [
        {
          provider_code: 'openai_compatible',
          plugin_type: 'model_provider',
          namespace: 'plugin.openai_compatible',
          label_key: 'plugin.label',
          description_key: 'plugin.description',
          provider_label_key: 'provider.label',
          protocol: 'openai_compatible',
          help_url: 'https://platform.openai.com/docs/api-reference',
          default_base_url: 'https://api.openai.com/v1',
          model_discovery_mode: 'hybrid',
          current_installation_id: 'installation-1',
          current_version: '0.3.7',
          latest_version: '0.3.7',
          has_update: false,
          installed_versions: []
        }
      ]
    });
    vi.mocked(listConsoleOfficialPluginCatalog).mockResolvedValueOnce({
      source_kind: 'official_registry',
      source_label: '官方源',
      registry_url: 'https://official.example.com/official-registry.json',
      locale_meta: {
        requested_locale: null,
        resolved_locale: 'zh_Hans',
        user_preferred_locale: null,
        accept_language: null,
        fallback_locale: 'en_US',
        supported_locales: ['zh_Hans', 'en_US']
      },
      i18n_catalog: {
        'plugin.openai_compatible': {
          zh_Hans: {
            plugin: {
              label: 'OpenAI 兼容插件'
            },
            provider: {
              label: 'OpenAI Compatible'
            }
          },
          en_US: {
            plugin: {
              label: 'OpenAI-Compatible API Provider'
            },
            provider: {
              label: 'OpenAI Compatible'
            }
          }
        }
      },
      entries: [
        {
          plugin_id: '1flowbase.openai_compatible',
          plugin_type: 'model_provider',
          provider_code: 'openai_compatible',
          namespace: 'plugin.openai_compatible',
          label_key: 'plugin.label',
          description_key: 'plugin.description',
          provider_label_key: 'provider.label',
          protocol: 'openai_compatible',
          latest_version: '0.3.7',
          selected_artifact: {
            os: 'linux',
            arch: 'amd64',
            libc: 'musl',
            rust_target: 'x86_64-unknown-linux-musl',
            download_url: 'https://example.com/openai.1flowbasepkg',
            checksum: 'sha256:abc123',
            signature_algorithm: 'ed25519',
            signing_key_id: 'official-key-2026-04'
          },
          help_url: 'https://platform.openai.com/docs/api-reference',
          model_discovery_mode: 'hybrid',
          install_status: 'not_installed'
        }
      ]
    });

    expect(settingsPluginFamiliesQueryKey).toEqual([
      'settings',
      'plugins',
      'families'
    ]);
    expect(settingsOfficialPluginsQueryKey).toEqual([
      'settings',
      'plugins',
      'official-catalog'
    ]);

    await expect(fetchSettingsPluginFamilies()).resolves.toEqual([
      expect.objectContaining({
        provider_code: 'openai_compatible',
        display_name: 'OpenAI Compatible',
        plugin_type: 'model_provider',
        current_version: '0.3.7'
      })
    ]);
    await expect(fetchSettingsOfficialPluginCatalog()).resolves.toEqual(
      expect.objectContaining({
        source_kind: 'official_registry',
        entries: [
          expect.objectContaining({
            plugin_id: '1flowbase.openai_compatible',
            display_name: 'OpenAI Compatible',
            plugin_type: 'model_provider',
            latest_version: '0.3.7'
          })
        ]
      })
    );
    await installSettingsOfficialPlugin('openai_compatible@0.2.0', 'csrf-123');
    await uploadSettingsPluginPackage(uploadFile, 'csrf-123');
    await upgradeSettingsPluginFamilyLatest('openai_compatible', 'csrf-123');
    await switchSettingsPluginFamilyVersion(
      'openai_compatible',
      'installation-1',
      'csrf-123'
    );
    await fetchSettingsPluginTask('task-1');

    expect(listConsolePluginFamilies).toHaveBeenCalledWith({
      plugin_type: 'model_provider'
    });
    expect(listConsoleOfficialPluginCatalog).toHaveBeenCalledWith({
      plugin_type: 'model_provider'
    });
    expect(installConsoleOfficialPlugin).toHaveBeenCalledWith(
      { plugin_id: 'openai_compatible@0.2.0' },
      'csrf-123'
    );
    expect(uploadConsolePluginPackage).toHaveBeenCalledWith(uploadFile, 'csrf-123');
    expect(upgradeConsolePluginFamilyLatest).toHaveBeenCalledWith(
      'openai_compatible',
      'csrf-123'
    );
    expect(switchConsolePluginFamilyVersion).toHaveBeenCalledWith(
      'openai_compatible',
      { installation_id: 'installation-1' },
      'csrf-123'
    );
    expect(getConsolePluginTask).toHaveBeenCalledWith('task-1');
  });
});
