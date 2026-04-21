import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { Grid } from 'antd';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  modelProviderCatalogEntries,
  primaryContractProviderModels
} from '../../../test/model-provider-contract-fixtures';

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
  settingsApiDocsOperationSpecQueryKey: vi.fn((operationId: string) => [
    'settings',
    'docs',
    'operation',
    operationId,
    'openapi'
  ]),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiDocsCategoryOperations: vi.fn(),
  fetchSettingsApiDocsOperationSpec: vi.fn()
}));

const modelProvidersApi = vi.hoisted(() => ({
  settingsModelProviderCatalogQueryKey: [
    'settings',
    'model-providers',
    'catalog'
  ],
  settingsModelProviderInstancesQueryKey: [
    'settings',
    'model-providers',
    'instances'
  ],
  settingsModelProviderOptionsQueryKey: [
    'settings',
    'model-providers',
    'options'
  ],
  settingsModelProviderModelsQueryKey: vi.fn((instanceId: string) => [
    'settings',
    'model-providers',
    'models',
    instanceId
  ]),
  fetchSettingsModelProviderCatalog: vi.fn(),
  fetchSettingsModelProviderInstances: vi.fn(),
  fetchSettingsModelProviderModels: vi.fn(),
  createSettingsModelProviderInstance: vi.fn(),
  updateSettingsModelProviderInstance: vi.fn(),
  revealSettingsModelProviderSecret: vi.fn(),
  validateSettingsModelProviderInstance: vi.fn(),
  refreshSettingsModelProviderModels: vi.fn(),
  deleteSettingsModelProviderInstance: vi.fn()
}));

const pluginsApi = vi.hoisted(() => ({
  settingsOfficialPluginsQueryKey: ['settings', 'plugins', 'official-catalog'],
  settingsPluginFamiliesQueryKey: ['settings', 'plugins', 'families'],
  fetchSettingsPluginFamilies: vi.fn(),
  fetchSettingsOfficialPluginCatalog: vi.fn(),
  installSettingsOfficialPlugin: vi.fn(),
  uploadSettingsPluginPackage: vi.fn(),
  upgradeSettingsPluginFamilyLatest: vi.fn(),
  switchSettingsPluginFamilyVersion: vi.fn(),
  deleteSettingsPluginFamily: vi.fn(),
  fetchSettingsPluginTask: vi.fn()
}));

vi.mock('../api/members', () => membersApi);
vi.mock('../api/roles', () => rolesApi);
vi.mock('../api/permissions', () => permissionsApi);
vi.mock('../api/api-docs', () => docsApi);
vi.mock('../api/model-providers', () => modelProvidersApi);
vi.mock('../api/plugins', () => pluginsApi);
vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: () => <div data-testid="settings-page-scalar">Scalar</div>
}));

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

async function openProviderInstancesModal() {
  const catalogRow = await screen.findByRole('row', {
    name: /OpenAI Compatible/
  });
  fireEvent.click(within(catalogRow).getByRole('button', { name: '查看实例' }));

  await screen.findByText('查看供应商实例');

  return screen.findByRole('dialog');
}

describe('ModelProvidersPage', () => {
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
      title: '1flowbase API',
      version: '0.1.0',
      categories: []
    });
    docsApi.fetchSettingsApiDocsCategoryOperations.mockResolvedValue({
      id: 'console',
      label: '控制面',
      operations: []
    });
    docsApi.fetchSettingsApiDocsOperationSpec.mockResolvedValue({
      openapi: '3.1.0',
      info: { title: '1flowbase API', version: '0.1.0' },
      paths: {},
      components: {}
    });
    modelProvidersApi.fetchSettingsModelProviderCatalog.mockResolvedValue(
      modelProviderCatalogEntries
    );
    modelProvidersApi.fetchSettingsModelProviderInstances.mockResolvedValue([
      {
        id: 'provider-1',
        installation_id: modelProviderCatalogEntries[0].installation_id,
        provider_code: modelProviderCatalogEntries[0].provider_code,
        protocol: modelProviderCatalogEntries[0].protocol,
        display_name: 'OpenAI Production',
        status: 'ready',
        config_json: {
          base_url: 'https://api.openai.com/v1',
          api_key: 'supe****cret'
        },
        last_validated_at: '2026-04-18T10:00:00Z',
        last_validation_status: 'succeeded',
        last_validation_message: 'validated',
        catalog_refresh_status: 'ready',
        catalog_last_error_message: null,
        catalog_refreshed_at: '2026-04-18T10:01:00Z',
        model_count: 1
      },
      {
        id: 'provider-2',
        installation_id: modelProviderCatalogEntries[0].installation_id,
        provider_code: modelProviderCatalogEntries[0].provider_code,
        protocol: modelProviderCatalogEntries[0].protocol,
        display_name: 'OpenAI Backup',
        status: 'disabled',
        config_json: {
          base_url: 'https://backup.openai.example/v1',
          api_key: 'back****cret'
        },
        last_validated_at: null,
        last_validation_status: null,
        last_validation_message: null,
        catalog_refresh_status: 'idle',
        catalog_last_error_message: null,
        catalog_refreshed_at: null,
        model_count: 0
      }
    ]);
    modelProvidersApi.fetchSettingsModelProviderModels.mockResolvedValue({
      provider_instance_id: 'provider-1',
      refresh_status: 'ready',
      source: 'hybrid',
      last_error_message: null,
      refreshed_at: '2026-04-18T10:01:00Z',
      models: primaryContractProviderModels
    });
    modelProvidersApi.revealSettingsModelProviderSecret.mockResolvedValue({
      key: 'api_key',
      value: 'super-secret'
    });
    pluginsApi.fetchSettingsPluginFamilies.mockResolvedValue([
      {
        provider_code: 'openai_compatible',
        display_name: 'OpenAI Compatible',
        protocol: 'openai_compatible',
        help_url: 'https://platform.openai.com/docs/api-reference',
        default_base_url: 'https://api.openai.com/v1',
        model_discovery_mode: 'hybrid',
        current_installation_id: 'installation-1',
        current_version: '0.1.0',
        latest_version: '0.2.0',
        has_update: true,
        installed_versions: [
          {
            installation_id: 'installation-2',
            plugin_version: '0.2.0',
            source_kind: 'official_registry',
            trust_level: 'verified_official',
            created_at: '2026-04-19T09:00:00Z',
            is_current: false
          },
          {
            installation_id: 'installation-1',
            plugin_version: '0.1.0',
            source_kind: 'official_registry',
            trust_level: 'verified_official',
            created_at: '2026-04-18T09:00:00Z',
            is_current: true
          }
        ]
      }
    ]);
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue({
      source_kind: 'official_registry',
      source_label: '官方源',
      registry_url: 'https://official.example.com/official-registry.json',
      entries: []
    });
    pluginsApi.installSettingsOfficialPlugin.mockResolvedValue({
      installation: {
        id: 'installation-1',
        provider_code: 'openai_compatible',
        plugin_id: 'openai_compatible@0.1.0',
        plugin_version: '0.1.0',
        contract_version: '1flowbase.provider/v1',
        protocol: 'openai_compatible',
        display_name: 'OpenAI Compatible',
        source_kind: 'official_registry',
        trust_level: 'verified_official',
        verification_status: 'valid',
        enabled: true,
        install_path: '/tmp/openai-compatible',
        checksum: 'sha256:abc123',
        signature_status: 'unsigned',
        signature_algorithm: null,
        signing_key_id: null,
        metadata_json: {},
        created_at: '2026-04-18T21:00:00Z',
        updated_at: '2026-04-18T21:00:00Z'
      },
      task: {
        id: 'task-1',
        installation_id: 'installation-1',
        workspace_id: 'workspace-1',
        provider_code: 'openai_compatible',
        task_kind: 'assign',
        status: 'success',
        status_message: 'assigned',
        detail_json: {},
        created_at: '2026-04-18T21:00:00Z',
        updated_at: '2026-04-18T21:00:00Z',
        finished_at: '2026-04-18T21:00:00Z'
      }
    });
    pluginsApi.upgradeSettingsPluginFamilyLatest.mockResolvedValue({
      id: 'task-upgrade',
      installation_id: 'installation-2',
      workspace_id: 'workspace-1',
      provider_code: 'openai_compatible',
      task_kind: 'switch_version',
      status: 'success',
      status_message: 'switched',
      detail_json: {
        previous_installation_id: 'installation-1',
        previous_version: '0.1.0',
        target_installation_id: 'installation-2',
        target_version: '0.2.0',
        migrated_instance_count: 2
      },
      created_at: '2026-04-19T10:00:00Z',
      updated_at: '2026-04-19T10:00:00Z',
      finished_at: '2026-04-19T10:00:00Z'
    });
    pluginsApi.switchSettingsPluginFamilyVersion.mockResolvedValue({
      id: 'task-switch',
      installation_id: 'installation-1',
      workspace_id: 'workspace-1',
      provider_code: 'openai_compatible',
      task_kind: 'switch_version',
      status: 'success',
      status_message: 'switched',
      detail_json: {
        previous_installation_id: 'installation-2',
        previous_version: '0.2.0',
        target_installation_id: 'installation-1',
        target_version: '0.1.0',
        migrated_instance_count: 2
      },
      created_at: '2026-04-19T10:05:00Z',
      updated_at: '2026-04-19T10:05:00Z',
      finished_at: '2026-04-19T10:05:00Z'
    });
    pluginsApi.deleteSettingsPluginFamily.mockResolvedValue({
      id: 'task-delete',
      installation_id: 'installation-1',
      workspace_id: 'workspace-1',
      provider_code: 'openai_compatible',
      task_kind: 'uninstall',
      status: 'success',
      status_message: 'deleted',
      detail_json: {
        deleted_instance_count: 2,
        deleted_installation_count: 1
      },
      created_at: '2026-04-19T10:10:00Z',
      updated_at: '2026-04-19T10:10:00Z',
      finished_at: '2026-04-19T10:10:00Z'
    });
    pluginsApi.fetchSettingsPluginTask.mockResolvedValue({
      id: 'task-1',
      installation_id: 'installation-1',
      workspace_id: 'workspace-1',
      provider_code: 'openai_compatible',
      task_kind: 'assign',
      status: 'success',
      status_message: 'assigned',
      detail_json: {},
      created_at: '2026-04-18T21:00:00Z',
      updated_at: '2026-04-18T21:00:00Z',
      finished_at: '2026-04-18T21:00:00Z'
    });
  });

  test('renders provider family rows and upgrades to the latest version from version management', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);

    renderApp('/settings/model-providers');

    await waitFor(() => {
      expect(pluginsApi.fetchSettingsPluginFamilies).toHaveBeenCalled();
    });
    expect(await screen.findByText('0.1.0')).toBeInTheDocument();
    expect(
      screen.queryByText('当前使用 0.1.0，最新版本 0.2.0')
    ).not.toBeInTheDocument();

    const catalogRow = await screen.findByRole('row', {
      name: /OpenAI Compatible/
    });
    fireEvent.click(
      within(catalogRow).getByRole('button', { name: '版本管理' })
    );

    expect(await screen.findByText('升级到最新版本')).toBeInTheDocument();
    expect(screen.getAllByText('0.2.0')).toHaveLength(1);
    expect(screen.getByText('其他本地版本')).toBeInTheDocument();
    expect(screen.queryByText('最新')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '升级到最新版本' }));

    await waitFor(() => {
      expect(pluginsApi.upgradeSettingsPluginFamilyLatest).toHaveBeenCalledWith(
        'openai_compatible',
        'csrf-123'
      );
    });
  }, 20000);

  test('switches provider family version and shows a follow-up warning in the instances modal', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);
    pluginsApi.fetchSettingsPluginFamilies.mockResolvedValue([
      {
        provider_code: 'openai_compatible',
        display_name: 'OpenAI Compatible',
        protocol: 'openai_compatible',
        help_url: 'https://platform.openai.com/docs/api-reference',
        default_base_url: 'https://api.openai.com/v1',
        model_discovery_mode: 'hybrid',
        current_installation_id: 'installation-2',
        current_version: '0.2.0',
        latest_version: '0.2.0',
        has_update: false,
        installed_versions: [
          {
            installation_id: 'installation-2',
            plugin_version: '0.2.0',
            source_kind: 'official_registry',
            trust_level: 'verified_official',
            created_at: '2026-04-19T09:00:00Z',
            is_current: true
          },
          {
            installation_id: 'installation-1',
            plugin_version: '0.1.0',
            source_kind: 'official_registry',
            trust_level: 'verified_official',
            created_at: '2026-04-18T09:00:00Z',
            is_current: false
          }
        ]
      }
    ]);

    renderApp('/settings/model-providers');

    await waitFor(() => {
      expect(pluginsApi.fetchSettingsPluginFamilies).toHaveBeenCalled();
    });

    const catalogRow = await screen.findByRole('row', {
      name: /OpenAI Compatible/
    });
    fireEvent.click(
      within(catalogRow).getByRole('button', { name: '版本管理' })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: '回退到该版本' })
    );

    await waitFor(() => {
      expect(pluginsApi.switchSettingsPluginFamilyVersion).toHaveBeenCalledWith(
        'openai_compatible',
        'installation-1',
        'csrf-123'
      );
    });

    fireEvent.click(
      within(catalogRow).getByRole('button', { name: '查看实例' })
    );
    expect(
      await screen.findByText(
        '该供应商刚完成版本切换，建议刷新模型并验证关键实例。'
      )
    ).toBeInTheDocument();
  }, 20000);

  test('deletes a provider family after confirmation', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);

    renderApp('/settings/model-providers');

    const catalogRow = await screen.findByRole('row', {
      name: /OpenAI Compatible/
    });
    fireEvent.click(within(catalogRow).getByRole('button', { name: '删除' }));

    expect((await screen.findAllByText('删除供应商')).length).toBeGreaterThan(
      0
    );
    expect(
      screen.getByText(
        '删除后会一并清理该供应商的全部实例、安装记录和本地插件文件。'
      )
    ).toBeInTheDocument();

    const confirmDialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: /删\s*除/ })
    );

    await waitFor(() => {
      expect(pluginsApi.deleteSettingsPluginFamily).toHaveBeenCalledWith(
        'openai_compatible',
        'csrf-123'
      );
    });
  }, 20000);

  test('renders catalog and instance metadata for view-only users without manage actions', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all'
    ]);

    renderApp('/settings/model-providers');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings/model-providers');
    });
    await waitFor(() => {
      expect(
        modelProvidersApi.fetchSettingsModelProviderCatalog
      ).toHaveBeenCalled();
      expect(
        modelProvidersApi.fetchSettingsModelProviderInstances
      ).toHaveBeenCalled();
    });

    expect(
      await screen.findByRole(
        'heading',
        { name: '模型供应商', level: 4 },
        { timeout: 10000 }
      )
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText('OpenAI Compatible', {}, { timeout: 10000 }))
        .length
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.queryByRole('heading', { name: '当前实例' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '查看实例' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('OpenAI Production')).not.toBeInTheDocument();
  }, 10000);

  test('shows create and row-level manage actions when state_model.manage.all is present', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);

    renderApp('/settings/model-providers');

    expect(
      await screen.findByRole('button', { name: '查看实例' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '当前实例' })
    ).not.toBeInTheDocument();

    const catalogRow = await screen.findByRole('row', {
      name: /OpenAI Compatible/
    });
    expect(
      within(catalogRow).getByRole('button', { name: '查看实例' })
    ).toBeInTheDocument();
    expect(
      within(catalogRow).getByRole('button', { name: '添加' })
    ).toBeInTheDocument();
    expect(
      within(catalogRow).queryByRole('link', { name: '文档' })
    ).not.toBeInTheDocument();
  }, 20000);

  test('switches provider version from the catalog version column', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);

    renderApp('/settings/model-providers');

    const versionSelect = await screen.findByRole('combobox', {
      name: '切换 OpenAI Compatible 版本'
    });

    fireEvent.mouseDown(versionSelect);
    fireEvent.click(await screen.findByText('0.2.0'));

    const confirmDialog = await screen.findByRole('dialog');
    expect(within(confirmDialog).getAllByText('切换版本').length).toBeGreaterThan(
      0
    );
    expect(
      within(confirmDialog).getByText(
        '切换后会统一迁移该供应商下的全部实例；完成后建议刷新模型并验证关键实例。'
      )
    ).toBeInTheDocument();

    fireEvent.click(
      within(confirmDialog).getByRole('button', { name: '确认切换' })
    );

    await waitFor(() => {
      expect(pluginsApi.switchSettingsPluginFamilyVersion).toHaveBeenCalledWith(
        'openai_compatible',
        'installation-2',
        'csrf-123'
      );
    });
  }, 20000);

  test('renders provider catalog headers in the expected order', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);

    renderApp('/settings/model-providers');

    const headers = await screen.findAllByRole('columnheader');
    const catalogHeaders = headers
      .map((header) => header.textContent?.trim() ?? '')
      .filter((text) => ['操作', '名称', '状态', '版本', '说明'].includes(text));

    expect(catalogHeaders.slice(0, 5)).toEqual([
      '操作',
      '名称',
      '状态',
      '版本',
      '说明'
    ]);
  }, 10000);

  test(
    'opens provider instances modal from installed provider row and defaults to the ready instance',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);

      renderApp('/settings/model-providers');

      const modal = await openProviderInstancesModal();
      expect(
        within(modal).getAllByText('OpenAI Production').length
      ).toBeGreaterThanOrEqual(1);
      expect(within(modal).getByText('succeeded')).toBeInTheDocument();
      expect(
        within(modal).getByRole('combobox', { name: '选择实例' })
      ).toBeInTheDocument();
      expect(
        within(modal).getByRole('button', { name: '验证实例' })
      ).toBeInTheDocument();
      expect(
        within(modal).getByRole('button', { name: '刷新模型' })
      ).toBeInTheDocument();
      expect(
        within(modal).getByRole('button', { name: '删除实例' })
      ).toBeInTheDocument();
    }
  );

  test(
    'runs validate refresh and delete from the provider instances modal',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);
      modelProvidersApi.validateSettingsModelProviderInstance.mockResolvedValue(
        {
          instance: {
            id: 'provider-1'
          },
          output: {}
        }
      );
      modelProvidersApi.refreshSettingsModelProviderModels.mockResolvedValue({
        provider_instance_id: 'provider-1',
        refresh_status: 'ready',
        source: 'remote',
        last_error_message: null,
        refreshed_at: '2026-04-18T10:03:00Z',
        models: []
      });
      modelProvidersApi.deleteSettingsModelProviderInstance.mockResolvedValue({
        deleted: true
      });

      renderApp('/settings/model-providers');

      await openProviderInstancesModal();

      fireEvent.click(await screen.findByRole('button', { name: '验证实例' }));
      await waitFor(() => {
        expect(
          modelProvidersApi.validateSettingsModelProviderInstance
        ).toHaveBeenCalledWith('provider-1', 'csrf-123');
      });

      fireEvent.click(screen.getByRole('button', { name: '刷新模型' }));
      await waitFor(() => {
        expect(
          modelProvidersApi.refreshSettingsModelProviderModels
        ).toHaveBeenCalledWith('provider-1', 'csrf-123');
      });

      fireEvent.click(screen.getByRole('button', { name: '删除实例' }));
      await waitFor(() => {
        expect(
          modelProvidersApi.deleteSettingsModelProviderInstance
        ).toHaveBeenCalledWith('provider-1', 'csrf-123');
      });
    }
  );

  test(
    'masks api key by default and reveals it only after explicit action',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);

      renderApp('/settings/model-providers');

      const modal = await openProviderInstancesModal();
      fireEvent.click(
        within(modal).getByRole('button', { name: '编辑 API Key' })
      );

      expect(await screen.findByText('编辑 API 密钥配置')).toBeInTheDocument();
      expect(screen.getByDisplayValue('supe****cret')).toBeInTheDocument();
      expect(
        screen.queryByDisplayValue('super-secret')
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }));

      await waitFor(() => {
        expect(
          modelProvidersApi.revealSettingsModelProviderSecret
        ).toHaveBeenCalledWith('provider-1', 'api_key', 'csrf-123');
      });
      expect(
        await screen.findByDisplayValue('super-secret')
      ).toBeInTheDocument();
    }
  );

  test(
    'fetches models for the selected instance and renders them as a dropdown',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);

      renderApp('/settings/model-providers');

      const modal = await openProviderInstancesModal();
      fireEvent.click(within(modal).getByRole('button', { name: '获取模型' }));

      await waitFor(() => {
        expect(
          modelProvidersApi.fetchSettingsModelProviderModels
        ).toHaveBeenCalledWith('provider-1');
      });
      expect(
        await within(modal).findByRole('combobox', { name: '可用模型' })
      ).toBeInTheDocument();
      expect(
        within(modal).getByText(primaryContractProviderModels[0].display_name)
      ).toBeInTheDocument();
    }
  );

  test('renders official install cards beneath the installed provider area', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);
    pluginsApi.fetchSettingsPluginFamilies.mockResolvedValue([]);
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue({
      source_kind: 'official_registry',
      source_label: '官方源',
      registry_url: 'https://official.example.com/official-registry.json',
      entries: [
        {
          plugin_id: '1flowbase.openai_compatible',
          provider_code: 'openai_compatible',
          display_name: 'OpenAI Compatible',
          description:
            '面向 OpenAI 兼容 Chat Completions API 的 provider 插件。',
          latest_version: '0.1.0',
          protocol: 'openai_compatible',
          help_url:
            'https://github.com/taichuy/1flowbase-official-plugins/tree/main/models/openai_compatible',
          model_discovery_mode: 'hybrid',
          install_status: 'not_installed'
        }
      ]
    });

    renderApp('/settings/model-providers');

    await waitFor(() => {
      expect(pluginsApi.fetchSettingsOfficialPluginCatalog).toHaveBeenCalled();
    });
    expect(
      (
        await screen.findAllByRole(
          'heading',
          { name: '模型供应商' },
          { timeout: 10000 }
        )
      ).length
    ).toBeGreaterThan(0);
    expect(
      await screen.findByRole(
        'button',
        { name: '安装到当前 workspace' },
        { timeout: 10000 }
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '面向 OpenAI 兼容 Chat Completions API 的 provider 插件。'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('协议：openai_compatible')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('预置模型与运行时发现合并显示')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('来源：官方源')).not.toBeInTheDocument();
    expect(
      screen.queryByText('1flowbase.openai_compatible')
    ).not.toBeInTheDocument();
  });

  test('deduplicates official install cards for the same provider and keeps only one latest entry', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);
    pluginsApi.fetchSettingsPluginFamilies.mockResolvedValue([]);
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue({
      source_kind: 'official_registry',
      source_label: '官方源',
      registry_url: 'https://official.example.com/official-registry.json',
      entries: [
        {
          plugin_id: '1flowbase.openai_compatible@0.1.0',
          provider_code: 'openai_compatible',
          display_name: 'OpenAI Compatible',
          latest_version: '0.1.0',
          protocol: 'openai_compatible',
          help_url: 'https://example.com/openai-010',
          model_discovery_mode: 'hybrid',
          install_status: 'installed'
        },
        {
          plugin_id: '1flowbase.openai_compatible@0.2.0',
          provider_code: 'openai_compatible',
          display_name: 'OpenAI Compatible',
          latest_version: '0.2.0',
          protocol: 'openai_compatible',
          help_url: 'https://example.com/openai-020',
          model_discovery_mode: 'hybrid',
          install_status: 'not_installed'
        }
      ]
    });

    renderApp('/settings/model-providers');

    await waitFor(() => {
      expect(pluginsApi.fetchSettingsOfficialPluginCatalog).toHaveBeenCalled();
    });

    expect(await screen.findByText('0.2.0')).toBeInTheDocument();
    expect(screen.getByText('latest')).toBeInTheDocument();
    expect(screen.getByText('hybrid')).toBeInTheDocument();
    expect(screen.queryByText('0.1.0')).not.toBeInTheDocument();
  });

  test('polls install task until the official plugin finishes installing', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);
    pluginsApi.fetchSettingsPluginFamilies.mockResolvedValue([]);
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue({
      source_kind: 'official_registry',
      source_label: '官方源',
      registry_url: 'https://official.example.com/official-registry.json',
      entries: [
        {
          plugin_id: '1flowbase.openai_compatible',
          provider_code: 'openai_compatible',
          display_name: 'OpenAI Compatible',
          latest_version: '0.1.0',
          protocol: 'openai_compatible',
          help_url:
            'https://github.com/taichuy/1flowbase-official-plugins/tree/main/models/openai_compatible',
          model_discovery_mode: 'hybrid',
          install_status: 'not_installed'
        }
      ]
    });
    pluginsApi.installSettingsOfficialPlugin.mockResolvedValue({
      installation: {
        id: 'installation-1',
        provider_code: 'openai_compatible',
        plugin_id: 'openai_compatible@0.1.0',
        plugin_version: '0.1.0',
        contract_version: '1flowbase.provider/v1',
        protocol: 'openai_compatible',
        display_name: 'OpenAI Compatible',
        source_kind: 'official_registry',
        trust_level: 'verified_official',
        verification_status: 'valid',
        enabled: true,
        install_path: '/tmp/openai-compatible',
        checksum: 'sha256:abc123',
        signature_status: 'unsigned',
        signature_algorithm: null,
        signing_key_id: null,
        metadata_json: {},
        created_at: '2026-04-18T21:00:00Z',
        updated_at: '2026-04-18T21:00:00Z'
      },
      task: {
        id: 'task-1',
        installation_id: 'installation-1',
        workspace_id: 'workspace-1',
        provider_code: 'openai_compatible',
        task_kind: 'assign',
        status: 'running',
        status_message: null,
        detail_json: {},
        created_at: '2026-04-18T21:00:00Z',
        updated_at: '2026-04-18T21:00:00Z',
        finished_at: null
      }
    });
    pluginsApi.fetchSettingsPluginTask
      .mockResolvedValueOnce({
        id: 'task-1',
        installation_id: 'installation-1',
        workspace_id: 'workspace-1',
        provider_code: 'openai_compatible',
        task_kind: 'assign',
        status: 'running',
        status_message: null,
        detail_json: {},
        created_at: '2026-04-18T21:00:00Z',
        updated_at: '2026-04-18T21:00:00Z',
        finished_at: null
      })
      .mockResolvedValueOnce({
        id: 'task-1',
        installation_id: 'installation-1',
        workspace_id: 'workspace-1',
        provider_code: 'openai_compatible',
        task_kind: 'assign',
        status: 'success',
        status_message: 'assigned',
        detail_json: {},
        created_at: '2026-04-18T21:00:00Z',
        updated_at: '2026-04-18T21:00:01Z',
        finished_at: '2026-04-18T21:00:01Z'
      });

    renderApp('/settings/model-providers');
    await waitFor(() => {
      expect(pluginsApi.fetchSettingsOfficialPluginCatalog).toHaveBeenCalled();
    });

    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: '安装到当前 workspace' },
        { timeout: 10000 }
      )
    );

    const installButtons = await screen.findAllByRole(
      'button',
      { name: '安装到当前 workspace' },
      { timeout: 10000 }
    );
    fireEvent.click(installButtons[installButtons.length - 1]!);

    await waitFor(() => {
      expect(pluginsApi.installSettingsOfficialPlugin).toHaveBeenCalledWith(
        '1flowbase.openai_compatible',
        'csrf-123'
      );
      expect(screen.getAllByText('安装中').length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(
      () => {
        expect(pluginsApi.fetchSettingsPluginTask).toHaveBeenCalled();
      },
      { timeout: 4000 }
    );

    await waitFor(
      () => {
        expect(pluginsApi.fetchSettingsPluginTask).toHaveBeenCalledTimes(2);
        expect(screen.getByText('已安装到当前 workspace')).toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  }, 15000);

  test('renders official source metadata, upload entry, and source trust labels', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);
    pluginsApi.fetchSettingsPluginFamilies.mockResolvedValue([
      {
        provider_code: 'openai_compatible',
        display_name: 'OpenAI Compatible',
        protocol: 'openai_compatible',
        help_url: 'https://platform.openai.com/docs/api-reference',
        default_base_url: 'https://api.openai.com/v1',
        model_discovery_mode: 'hybrid',
        current_installation_id: 'installation-upload-1',
        current_version: '0.2.0',
        latest_version: '0.2.0',
        has_update: false,
        installed_versions: [
          {
            installation_id: 'installation-upload-1',
            plugin_version: '0.2.0',
            source_kind: 'uploaded',
            trust_level: 'verified_official',
            created_at: '2026-04-19T14:00:00Z',
            is_current: true
          }
        ]
      }
    ]);
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue({
      source_kind: 'mirror_registry',
      source_label: '镜像源',
      registry_url: 'https://mirror.example.com/official-registry.json',
      entries: [
        {
          plugin_id: '1flowbase.openai_compatible',
          provider_code: 'openai_compatible',
          display_name: 'OpenAI Compatible',
          protocol: 'openai_compatible',
          latest_version: '0.2.0',
          help_url: 'https://platform.openai.com/docs/api-reference',
          model_discovery_mode: 'hybrid',
          install_status: 'assigned'
        }
      ]
    });

    renderApp('/settings/model-providers');

    expect(
      await screen.findByRole('button', { name: '上传插件' })
    ).toBeInTheDocument();

    const catalogRow = await screen.findByRole('row', {
      name: /OpenAI Compatible/
    });
    fireEvent.click(
      within(catalogRow).getByRole('button', { name: '版本管理' })
    );

    expect(await screen.findByText('官方签发')).toBeInTheDocument();
    expect(await screen.findByText('手工上传')).toBeInTheDocument();
  });
});
