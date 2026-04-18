import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  settingsModelProviderCatalogQueryKey: ['settings', 'model-providers', 'catalog'],
  settingsModelProviderInstancesQueryKey: ['settings', 'model-providers', 'instances'],
  settingsModelProviderOptionsQueryKey: ['settings', 'model-providers', 'options'],
  fetchSettingsModelProviderCatalog: vi.fn(),
  fetchSettingsModelProviderInstances: vi.fn(),
  createSettingsModelProviderInstance: vi.fn(),
  updateSettingsModelProviderInstance: vi.fn(),
  validateSettingsModelProviderInstance: vi.fn(),
  refreshSettingsModelProviderModels: vi.fn(),
  deleteSettingsModelProviderInstance: vi.fn()
}));

const pluginsApi = vi.hoisted(() => ({
  settingsOfficialPluginsQueryKey: ['settings', 'plugins', 'official-catalog'],
  fetchSettingsOfficialPluginCatalog: vi.fn(),
  installSettingsOfficialPlugin: vi.fn(),
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
      title: '1Flowbase API',
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
      info: { title: '1Flowbase API', version: '0.1.0' },
      paths: {},
      components: {}
    });
    modelProvidersApi.fetchSettingsModelProviderCatalog.mockResolvedValue([
      {
        installation_id: 'installation-1',
        provider_code: 'openai_compatible',
        plugin_id: 'openai_compatible@0.1.0',
        plugin_version: '0.1.0',
        display_name: 'OpenAI Compatible',
        protocol: 'openai_compatible',
        help_url: 'https://platform.openai.com/docs/api-reference',
        default_base_url: 'https://api.openai.com/v1',
        model_discovery_mode: 'hybrid',
        supports_model_fetch_without_credentials: false,
        enabled: true,
        form_schema: [
          { key: 'base_url', field_type: 'string', required: true },
          { key: 'api_key', field_type: 'secret', required: true }
        ],
        predefined_models: [
          {
            model_id: 'gpt-4o-mini',
            display_name: 'GPT-4o mini',
            source: 'static',
            supports_streaming: true,
            supports_tool_call: true,
            supports_multimodal: false,
            context_window: 128000,
            max_output_tokens: 16384,
            provider_metadata: {}
          }
        ]
      }
    ]);
    modelProvidersApi.fetchSettingsModelProviderInstances.mockResolvedValue([
      {
        id: 'provider-1',
        installation_id: 'installation-1',
        provider_code: 'openai_compatible',
        protocol: 'openai_compatible',
        display_name: 'OpenAI Production',
        status: 'ready',
        config_json: {
          base_url: 'https://api.openai.com/v1'
        },
        last_validated_at: '2026-04-18T10:00:00Z',
        last_validation_status: 'succeeded',
        last_validation_message: 'validated',
        catalog_refresh_status: 'ready',
        catalog_last_error_message: null,
        catalog_refreshed_at: '2026-04-18T10:01:00Z',
        model_count: 1
      }
    ]);
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue([]);
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
        verification_status: 'valid',
        enabled: true,
        install_path: '/tmp/openai-compatible',
        checksum: 'sha256:abc123',
        signature_status: 'unsigned',
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

  test(
    'renders catalog and instance metadata for view-only users without manage actions',
    async () => {
      authenticateWithPermissions(['route_page.view.all', 'state_model.view.all']);

      renderApp('/settings/model-providers');

      await waitFor(() => {
        expect(window.location.pathname).toBe('/settings/model-providers');
      });
      await waitFor(() => {
        expect(modelProvidersApi.fetchSettingsModelProviderCatalog).toHaveBeenCalled();
        expect(modelProvidersApi.fetchSettingsModelProviderInstances).toHaveBeenCalled();
      });

      expect(
        await screen.findByRole('heading', { name: '模型供应商', level: 4 }, { timeout: 10000 })
      ).toBeInTheDocument();
      expect(
        (await screen.findAllByText('OpenAI Compatible', {}, { timeout: 10000 })).length
      ).toBeGreaterThanOrEqual(1);
      expect(
        await screen.findByText('OpenAI Production', {}, { timeout: 10000 })
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '新建实例' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /编辑 OpenAI Production/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /验证 OpenAI Production/ })).not.toBeInTheDocument();
    },
    10000
  );

  test('shows create and row-level manage actions when state_model.manage.all is present', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);

    renderApp('/settings/model-providers');

    expect(await screen.findByRole('button', { name: '新建实例' })).toBeInTheDocument();

    const providerRow = await screen.findByRole('row', { name: /OpenAI Production/ });
    expect(within(providerRow).getByRole('button', { name: /编辑 OpenAI Production/ })).toBeInTheDocument();
    expect(within(providerRow).getByRole('button', { name: /验证 OpenAI Production/ })).toBeInTheDocument();
    expect(within(providerRow).getByRole('button', { name: /刷新模型 OpenAI Production/ })).toBeInTheDocument();
    expect(within(providerRow).getByRole('button', { name: /删除 OpenAI Production/ })).toBeInTheDocument();
  });

  test('renders official install cards beneath the installed provider area', async () => {
    authenticateWithPermissions([
      'route_page.view.all',
      'state_model.view.all',
      'state_model.manage.all'
    ]);
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue([
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
    ]);

    renderApp('/settings/model-providers');

    await waitFor(() => {
      expect(pluginsApi.fetchSettingsOfficialPluginCatalog).toHaveBeenCalled();
    });
    expect(
      await screen.findByRole('heading', { name: '安装模型供应商' }, { timeout: 10000 })
    ).toBeInTheDocument();
    expect(
      await screen.findByRole(
        'button',
        { name: '安装到当前 workspace' },
        { timeout: 10000 }
      )
    ).toBeInTheDocument();
  });

  test(
    'polls install task until the official plugin finishes installing',
    async () => {
      authenticateWithPermissions([
        'route_page.view.all',
        'state_model.view.all',
        'state_model.manage.all'
      ]);
      pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue([
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
      ]);
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
          verification_status: 'valid',
          enabled: true,
          install_path: '/tmp/openai-compatible',
          checksum: 'sha256:abc123',
          signature_status: 'unsigned',
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

      await waitFor(() => {
        expect(pluginsApi.installSettingsOfficialPlugin).toHaveBeenCalledWith(
          '1flowbase.openai_compatible',
          'csrf-123'
        );
        expect(screen.getAllByText('安装中').length).toBeGreaterThanOrEqual(1);
      });

      await waitFor(() => {
        expect(pluginsApi.fetchSettingsPluginTask).toHaveBeenCalled();
      }, { timeout: 4000 });

      await waitFor(() => {
        expect(pluginsApi.fetchSettingsPluginTask).toHaveBeenCalledTimes(2);
        expect(screen.getByText('已安装到当前 workspace')).toBeInTheDocument();
      }, { timeout: 4000 });
    },
    15000
  );
});
