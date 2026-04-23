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
  previewSettingsModelProviderModels: vi.fn(),
  createSettingsModelProviderInstance: vi.fn(),
  updateSettingsModelProviderInstance: vi.fn(),
  updateSettingsModelProviderRouting: vi.fn(),
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
import { ModelProviderInstanceDrawer } from '../components/model-providers/ModelProviderInstanceDrawer';
import { SettingsModelProvidersSection } from '../pages/settings-page/SettingsModelProvidersSection';

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

  fireEvent.click(within(catalogRow).getByRole('button', { name: '配置' }));

  await screen.findByText('查看供应商实例');

  return screen.findByRole('dialog');
}

function clickProviderInstanceTitle(modal: HTMLElement, displayName: string) {
  fireEvent.click(
    within(modal).getByText(displayName, {
      selector: '.model-provider-panel__instance-title'
    })
  );
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
        is_primary: true,
        configured_models: [
          {
            model_id: 'gpt-4o-mini',
            enabled: true
          },
          {
            model_id: 'gpt-4o',
            enabled: true
          }
        ],
        enabled_model_ids: ['gpt-4o-mini', 'gpt-4o'],
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
        status: 'ready',
        config_json: {
          base_url: 'https://backup.openai.example/v1',
          api_key: 'back****cret'
        },
        is_primary: false,
        configured_models: [
          {
            model_id: 'gpt-4.1-mini',
            enabled: true
          }
        ],
        enabled_model_ids: ['gpt-4.1-mini'],
        catalog_refresh_status: 'ready',
        catalog_last_error_message: null,
        catalog_refreshed_at: '2026-04-18T09:58:00Z',
        model_count: 1
      }
    ]);
    modelProvidersApi.updateSettingsModelProviderRouting.mockResolvedValue({
      provider_code: 'openai_compatible',
      routing_mode: 'manual_primary',
      primary_instance_id: 'provider-2',
      primary_instance_display_name: 'OpenAI Backup'
    });
    modelProvidersApi.previewSettingsModelProviderModels.mockResolvedValue({
      models: [
        {
          model_id: 'gpt-4o-mini',
          display_name: 'gpt-4o-mini',
          source: 'dynamic',
          supports_streaming: true,
          supports_tool_call: true,
          supports_multimodal: false,
          context_window: null,
          max_output_tokens: null,
          parameter_form: null,
          provider_metadata: {}
        }
      ],
      preview_token: 'preview-1',
      expires_at: '2026-04-22T12:00:00Z'
    });
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

  test('renders provider family rows and upgrades to the latest version from the catalog version column', async () => {
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

    expect(
      within(catalogRow).getByRole('button', { name: /更\s*新/ })
    ).toBeInTheDocument();
    expect(within(catalogRow).queryByRole('button', { name: '版本管理' })).not.toBeInTheDocument();
    fireEvent.click(within(catalogRow).getByRole('button', { name: /更\s*新/ }));

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
    const versionSelect = within(catalogRow).getByRole('combobox', {
      name: '切换 OpenAI Compatible 版本'
    });
    fireEvent.mouseDown(versionSelect);
    fireEvent.click(await screen.findByText('0.1.0'));

    await waitFor(() => {
      expect(pluginsApi.switchSettingsPluginFamilyVersion).toHaveBeenCalledWith(
        'openai_compatible',
        'installation-1',
        'csrf-123'
      );
    });

    fireEvent.click(
      within(catalogRow).getByRole('button', { name: '配置' })
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
      screen.queryByRole('button', { name: '配置' })
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
      await screen.findByRole('button', { name: '配置' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '当前实例' })
    ).not.toBeInTheDocument();

    const catalogRow = await screen.findByRole('row', {
      name: /OpenAI Compatible/
    });
    expect(
      within(catalogRow).getByRole('button', { name: '配置' })
    ).toBeInTheDocument();
    expect(
      within(catalogRow).getByRole('button', { name: '添加' })
    ).toBeInTheDocument();
    expect(
      within(catalogRow).queryByRole('button', { name: '版本管理' })
    ).not.toBeInTheDocument();
    expect(
      within(catalogRow).queryByRole('link', { name: '文档' })
    ).not.toBeInTheDocument();
  }, 20000);

  test(
    'wires preview and create submission from the model provider drawer into the settings api',
    { timeout: 20000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);
      modelProvidersApi.createSettingsModelProviderInstance.mockResolvedValue({
        id: 'provider-3',
        installation_id: modelProviderCatalogEntries[0].installation_id,
        provider_code: modelProviderCatalogEntries[0].provider_code,
        protocol: modelProviderCatalogEntries[0].protocol,
        display_name: 'OpenAI Draft',
        status: 'ready',
        is_primary: false,
        config_json: {
          base_url: 'https://api.openai.com/v1',
          api_key: 'supe****cret'
        },
        configured_models: [
          {
            model_id: 'gpt-4o-mini',
            enabled: true
          }
        ],
        enabled_model_ids: ['gpt-4o-mini'],
        catalog_refresh_status: 'ready',
        catalog_last_error_message: null,
        catalog_refreshed_at: '2026-04-18T10:05:00Z',
        model_count: 1
      });

      render(
        <AppProviders>
          <SettingsModelProvidersSection canManage />
        </AppProviders>
      );

      fireEvent.click(await screen.findByRole('button', { name: '添加' }));

      expect(await screen.findByText('API 密钥授权配置')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('API Endpoint'), {
        target: { value: 'https://api.openai.com/v1' }
      });
      fireEvent.change(screen.getByLabelText('API Key'), {
        target: { value: 'super-secret' }
      });
      fireEvent.change(screen.getByLabelText('凭据名称'), {
        target: { value: 'OpenAI Draft' }
      });

      fireEvent.click(screen.getByRole('button', { name: /检\s*测/ }));

      await waitFor(() => {
        expect(
          modelProvidersApi.previewSettingsModelProviderModels
        ).toHaveBeenCalledWith(
          {
            installation_id: modelProviderCatalogEntries[0].installation_id,
            config: {
              base_url: 'https://api.openai.com/v1',
              api_key: 'super-secret'
            }
          },
          'csrf-123'
        );
      });

      fireEvent.click(screen.getByRole('button', { name: '添加模型' }));
      fireEvent.change(screen.getByLabelText('模型 ID 1'), {
        target: { value: 'gpt-4o-mini' }
      });

      fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

      await waitFor(() => {
        expect(
          modelProvidersApi.createSettingsModelProviderInstance
        ).toHaveBeenCalledWith(
          {
            installation_id: modelProviderCatalogEntries[0].installation_id,
            display_name: 'OpenAI Draft',
            config: {
              base_url: 'https://api.openai.com/v1',
              api_key: 'super-secret'
            },
            configured_models: [
              {
                model_id: 'gpt-4o-mini',
                enabled: true
              }
            ],
            preview_token: 'preview-1'
          },
          'csrf-123'
        );
      });
    }
  );

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
    'opens provider instances modal from installed provider row as a management list',
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
      expect(
        within(modal).getByText(
          '为该供应商选择一个主实例；agent-flow 和运行时都会按这个主实例解析。'
        )
      ).toBeInTheDocument();
      expect(within(modal).getAllByText('生效模型').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getAllByText('缓存模型').length).toBeGreaterThanOrEqual(1);
      expect(within(modal).getByText('OpenAI Backup')).toBeInTheDocument();
    }
  );

  test(
    'switches the primary instance from the provider instances modal and reflects it in the catalog row',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);

      let instancesState = [
        {
          id: 'provider-1',
          installation_id: modelProviderCatalogEntries[0].installation_id,
          provider_code: modelProviderCatalogEntries[0].provider_code,
          protocol: modelProviderCatalogEntries[0].protocol,
          display_name: 'OpenAI Production',
          status: 'ready',
          is_primary: true,
          config_json: {
            base_url: 'https://api.openai.com/v1',
            api_key: 'supe****cret'
          },
          configured_models: [
            {
              model_id: 'gpt-4o-mini',
              enabled: true
            }
          ],
          enabled_model_ids: ['gpt-4o-mini'],
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
          status: 'ready',
          is_primary: false,
          config_json: {
            base_url: 'https://backup.openai.example/v1',
            api_key: 'back****cret'
          },
          configured_models: [
            {
              model_id: 'gpt-4.1-mini',
              enabled: true
            }
          ],
          enabled_model_ids: ['gpt-4.1-mini'],
          catalog_refresh_status: 'ready',
          catalog_last_error_message: null,
          catalog_refreshed_at: '2026-04-18T09:58:00Z',
          model_count: 1
        }
      ];

      modelProvidersApi.fetchSettingsModelProviderInstances.mockImplementation(
        async () => instancesState
      );
      modelProvidersApi.updateSettingsModelProviderRouting.mockImplementation(
        async (providerCode, input, csrfToken) => {
          expect(providerCode).toBe('openai_compatible');
          expect(csrfToken).toBe('csrf-123');

          instancesState = instancesState.map((instance) => ({
            ...instance,
            is_primary: instance.id === input.primary_instance_id
          }));

          const nextPrimary = instancesState.find(
            (instance) => instance.id === input.primary_instance_id
          );

          return {
            provider_code: providerCode,
            routing_mode: input.routing_mode,
            primary_instance_id: input.primary_instance_id,
            primary_instance_display_name: nextPrimary?.display_name ?? ''
          };
        }
      );

      renderApp('/settings/model-providers');

      const modal = await openProviderInstancesModal();
      const primarySelect = within(modal).getByRole('combobox', {
        name: '主实例'
      });

      fireEvent.mouseDown(primarySelect);
      const [backupOption] = await screen.findAllByText((_, element) => {
        if (!element) {
          return false;
        }

        return (
          element.matches('.ant-select-item-option-content') &&
          Boolean(element.textContent?.includes('OpenAI Backup'))
        );
      });
      fireEvent.click(backupOption);

      await waitFor(() => {
        expect(
          modelProvidersApi.updateSettingsModelProviderRouting
        ).toHaveBeenCalledWith(
          'openai_compatible',
          {
            routing_mode: 'manual_primary',
            primary_instance_id: 'provider-2'
          },
          'csrf-123'
        );
      });

      await waitFor(() => {
        expect(screen.getByText('主实例：OpenAI Backup')).toBeInTheDocument();
      });
    }
  );

  test(
    'runs candidate refresh and delete from the provider instances modal',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);
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

      const modal = await openProviderInstancesModal();

      clickProviderInstanceTitle(modal, 'OpenAI Production');

      fireEvent.click(
        await screen.findByRole('button', { name: '刷新候选模型 OpenAI Production' })
      );
      await waitFor(() => {
        expect(
          modelProvidersApi.validateSettingsModelProviderInstance
        ).toHaveBeenCalledWith('provider-1', 'csrf-123');
      });

      fireEvent.click(
        screen.getByRole('button', { name: '刷新模型 OpenAI Production' })
      );
      await waitFor(() => {
        expect(
          modelProvidersApi.refreshSettingsModelProviderModels
        ).toHaveBeenCalledWith('provider-1', 'csrf-123');
      });

      fireEvent.click(
        screen.getByRole('button', { name: '删除实例 OpenAI Production' })
      );
      await waitFor(() => {
        expect(
          modelProvidersApi.deleteSettingsModelProviderInstance
        ).toHaveBeenCalledWith('provider-1', 'csrf-123');
      });
    }
  );

  test(
    'loads candidate models from the draft drawer and submits grouped configured model rows',
    { timeout: 15000 },
    async () => {
      const previewModels = vi.fn().mockResolvedValue({
        models: [
          {
            model_id: 'gpt-4o-mini',
            display_name: 'gpt-4o-mini',
            source: 'dynamic',
            supports_streaming: true,
            supports_tool_call: true,
            supports_multimodal: false,
            context_window: null,
            max_output_tokens: null,
            parameter_form: null,
            provider_metadata: {}
          }
        ],
        preview_token: 'preview-1',
        expires_at: '2026-04-22T12:00:00Z'
      });
      const submit = vi.fn().mockResolvedValue(undefined);

      render(
        <ModelProviderInstanceDrawer
          open
          mode="create"
          catalogEntry={modelProviderCatalogEntries[0]}
          instance={null}
          submitting={false}
          onClose={() => undefined}
          onSubmit={submit}
          onPreviewModels={previewModels}
          onRevealSecret={async () => 'super-secret'}
        />
      );

      await screen.findByRole('dialog');
      expect(screen.getByText('API 密钥授权配置')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '添加模型' })).toBeInTheDocument();
      expect(screen.queryByText('校验模型')).not.toBeInTheDocument();
      expect(screen.queryByText('validate_model')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('organization')).not.toBeInTheDocument();
      expect(screen.getByText('高级配置（可选）')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /检\s*测/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /保\s*存/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /取\s*消/ })).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('API Endpoint'), {
        target: { value: 'https://api.openai.com/v1' }
      });
      fireEvent.change(screen.getByLabelText('API Key'), {
        target: { value: 'super-secret' }
      });
      fireEvent.change(screen.getByLabelText('凭据名称'), {
        target: { value: 'OpenAI Production' }
      });

      const expectedConfig = {
        base_url: 'https://api.openai.com/v1',
        api_key: 'super-secret'
      };

      fireEvent.click(screen.getByRole('button', { name: /检\s*测/ }));

      await waitFor(() => {
        expect(previewModels).toHaveBeenCalledWith(expectedConfig);
      });

      const cachedModelSelect = screen.getByRole('combobox', { name: '缓存模型' });
      fireEvent.mouseDown(cachedModelSelect);
      fireEvent.click(await screen.findByText('gpt-4o-mini'));

      expect(screen.getByLabelText('模型 ID 1')).toHaveValue('gpt-4o-mini');

      fireEvent.click(screen.getByRole('button', { name: '添加模型' }));
      fireEvent.click(screen.getByRole('button', { name: '添加模型' }));

      fireEvent.change(screen.getByLabelText('模型 ID 2'), {
        target: { value: 'manual-model-id' }
      });
      fireEvent.click(screen.getByRole('switch', { name: '启用模型 2' }));

      previewModels.mockResolvedValueOnce({
        models: [
          {
            model_id: 'gpt-4.1-mini',
            display_name: 'gpt-4.1-mini',
            source: 'dynamic',
            supports_streaming: true,
            supports_tool_call: true,
            supports_multimodal: false,
            context_window: null,
            max_output_tokens: null,
            parameter_form: null,
            provider_metadata: {}
          }
        ],
        preview_token: 'preview-2',
        expires_at: '2026-04-22T13:00:00Z'
      });

      fireEvent.click(screen.getByRole('button', { name: /检\s*测/ }));

      await waitFor(() => {
        expect(previewModels).toHaveBeenCalledTimes(2);
      });

      fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({
          display_name: 'OpenAI Production',
          config: expectedConfig,
          configured_models: [
            {
              model_id: 'gpt-4o-mini',
              enabled: true
            },
            {
              model_id: 'manual-model-id',
              enabled: false
            }
          ],
          preview_token: 'preview-2'
        });
      });
      expect(previewModels).toHaveBeenNthCalledWith(2, expectedConfig);
    }
  );

  test(
    'folds advanced provider fields into a collapsed section in the edit drawer',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);

      renderApp('/settings/model-providers');

      const modal = await openProviderInstancesModal();
      clickProviderInstanceTitle(modal, 'OpenAI Production');
      fireEvent.click(
        within(modal).getByRole('button', {
          name: '编辑 API Key OpenAI Production'
        })
      );

      expect(await screen.findByText('编辑 API 密钥配置')).toBeInTheDocument();
      expect(screen.getByLabelText('API Endpoint')).toBeInTheDocument();
      expect(screen.queryByText('organization')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('高级配置（可选）'));

      expect(await screen.findByLabelText('organization')).toBeInTheDocument();
      expect(screen.getByLabelText('default_headers')).toBeInTheDocument();
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
      clickProviderInstanceTitle(modal, 'OpenAI Production');
      fireEvent.click(
        within(modal).getByRole('button', {
          name: '编辑 API Key OpenAI Production'
        })
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
    'fetches cached models for the selected instance and renders them in the expanded panel',
    { timeout: 15000 },
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);

      renderApp('/settings/model-providers');

      const modal = await openProviderInstancesModal();
      clickProviderInstanceTitle(modal, 'OpenAI Production');

      await waitFor(() => {
        expect(
          modelProvidersApi.fetchSettingsModelProviderModels
        ).toHaveBeenCalledWith('provider-1');
      });
      expect(
        await within(modal).findByText(primaryContractProviderModels[0].model_id)
      ).toBeInTheDocument();
      expect(
        within(modal).getByRole('combobox', { name: '候选缓存 OpenAI Production' })
      ).toBeInTheDocument();
      expect(
        within(modal).getByText('Base URL')
      ).toBeInTheDocument();
      expect(
        within(modal).getByText('2026-04-18 10:01:00')
      ).toBeInTheDocument();
    }
  );

  test(
    'renders provider instances as a collapsed management list with base url grouped under refreshed time',
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
        within(modal).getByText('OpenAI Production', {
          selector: '.model-provider-panel__instance-title'
        })
      ).toBeInTheDocument();
      expect(
        within(modal).getByRole('combobox', { name: '主实例' })
      ).toBeInTheDocument();
      expect(within(modal).queryByText('Base URL')).not.toBeInTheDocument();
      expect(within(modal).queryByText('2026-04-18 10:01:00')).not.toBeInTheDocument();

      clickProviderInstanceTitle(modal, 'OpenAI Production');

      expect(await within(modal).findByText('Base URL')).toBeInTheDocument();
      expect(within(modal).getByText('2026-04-18 10:01:00')).toBeInTheDocument();
      expect(within(modal).getAllByText(/gpt-4o-mini/).length).toBeGreaterThanOrEqual(1);
      expect(
        modal.querySelector('.model-provider-panel__instance-content')
      ).toBeNull();
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

  test('renders upload entry and removes the version management entry point', async () => {
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
    expect(
      within(catalogRow).queryByRole('button', { name: '版本管理' })
    ).not.toBeInTheDocument();
  }, 10000);
});
