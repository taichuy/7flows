import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { Grid } from 'antd';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
  settingsApiDocsCategoryOperationsQueryKey: vi.fn(),
  settingsApiDocsOperationSpecQueryKey: vi.fn(),
  fetchSettingsApiDocsCatalog: vi.fn(),
  fetchSettingsApiDocsCategoryOperations: vi.fn(),
  fetchSettingsApiOperationSpec: vi.fn()
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
  settingsModelProviderModelsQueryKey: vi.fn(),
  fetchSettingsModelProviderCatalog: vi.fn(),
  fetchSettingsModelProviderInstances: vi.fn(),
  fetchSettingsModelProviderOptions: vi.fn(),
  fetchSettingsModelProviderMainInstance: vi.fn(),
  fetchSettingsModelProviderModels: vi.fn(),
  previewSettingsModelProviderModels: vi.fn(),
  createSettingsModelProviderInstance: vi.fn(),
  updateSettingsModelProviderInstance: vi.fn(),
  updateSettingsModelProviderMainInstance: vi.fn(),
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
  fetchSettingsPluginTask: vi.fn()
}));

const systemRuntimeApi = vi.hoisted(() => ({
  settingsSystemRuntimeQueryKey: ['settings', 'system-runtime'],
  fetchSettingsSystemRuntimeProfile: vi.fn()
}));

const fileManagementApi = vi.hoisted(() => ({
  settingsFileStoragesQueryKey: ['settings', 'files', 'storages'],
  settingsFileTablesQueryKey: ['settings', 'files', 'tables'],
  fetchSettingsFileStorages: vi.fn(),
  createSettingsFileStorage: vi.fn(),
  updateSettingsFileStorage: vi.fn(),
  deleteSettingsFileStorage: vi.fn(),
  fetchSettingsFileTables: vi.fn(),
  createSettingsFileTable: vi.fn(),
  updateSettingsFileTableBinding: vi.fn(),
  deleteSettingsFileTable: vi.fn()
}));

const hostInfrastructureApi = vi.hoisted(() => ({
  settingsHostInfrastructureProvidersQueryKey: [
    'settings',
    'host-infrastructure',
    'providers'
  ],
  fetchSettingsHostInfrastructureProviders: vi.fn(),
  saveSettingsHostInfrastructureProviderConfig: vi.fn()
}));

const dataModelsApi = vi.hoisted(() => ({
  settingsDataSourcesQueryKey: ['settings', 'data-models', 'sources'],
  settingsDataModelsQueryKey: vi.fn((sourceId: string) => [
    'settings',
    'data-models',
    'models',
    sourceId
  ]),
  settingsDataModelScopeGrantsQueryKey: vi.fn((modelId: string) => [
    'settings',
    'data-models',
    'scope-grants',
    modelId
  ]),
  settingsDataModelAdvisorFindingsQueryKey: vi.fn((modelId: string) => [
    'settings',
    'data-models',
    'advisor',
    modelId
  ]),
  settingsDataModelRecordPreviewQueryKey: vi.fn((modelCode: string) => [
    'settings',
    'data-models',
    'record-preview',
    modelCode
  ]),
  fetchSettingsDataSourceInstances: vi.fn(),
  updateSettingsDataSourceDefaults: vi.fn(),
  fetchSettingsDataModels: vi.fn(),
  createSettingsDataModel: vi.fn(),
  updateSettingsDataModel: vi.fn(),
  updateSettingsDataModelApiExposure: vi.fn(),
  fetchSettingsDataModelScopeGrants: vi.fn(),
  createSettingsDataModelField: vi.fn(),
  updateSettingsDataModelField: vi.fn(),
  deleteSettingsDataModelField: vi.fn(),
  createSettingsDataModelScopeGrant: vi.fn(),
  updateSettingsDataModelScopeGrant: vi.fn(),
  fetchSettingsDataModelAdvisorFindings: vi.fn(),
  fetchSettingsDataModelRecordPreview: vi.fn()
}));

vi.mock('../api/members', () => membersApi);
vi.mock('../api/roles', () => rolesApi);
vi.mock('../api/permissions', () => permissionsApi);
vi.mock('../api/api-docs', () => docsApi);
vi.mock('../api/model-providers', () => modelProvidersApi);
vi.mock('../api/plugins', () => pluginsApi);
vi.mock('../api/system-runtime', () => systemRuntimeApi);
vi.mock('../api/file-management', () => fileManagementApi);
vi.mock('../api/host-infrastructure', () => hostInfrastructureApi);
vi.mock('../api/data-models', () => dataModelsApi);
vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: () => <div data-testid="settings-page-scalar">Scalar</div>
}));

import { AppProviders } from '../../../app/AppProviders';
import { AppRouterProvider } from '../../../app/router';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';

const useBreakpointSpy = vi.spyOn(Grid, 'useBreakpoint');
const antdStaticMessageWarning =
  'Static function can not consume context like dynamic theme';
const consoleWarn = console.warn;
const consoleError = console.error;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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
      nickname: 'root',
      name: 'root',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'root',
      permissions: [
        'state_model.view.all',
        'state_model.manage.all',
        'api_reference.view.all'
      ]
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

function findDataModelsNavigation() {
  return screen.findByRole('link', { name: '数据源' }, { timeout: 5000 });
}

async function openContactsDataModelEditor() {
  await screen.findByText('Contacts', {}, { timeout: 10_000 });
  const contactsRow = screen
    .getAllByRole('row')
    .find((row) => within(row).queryByText('Contacts'));
  expect(contactsRow).toBeDefined();

  fireEvent.click(
    within(contactsRow as HTMLElement).getByRole('button', { name: '编辑' })
  );

  expect(await screen.findByText('编辑 Contacts')).toBeInTheDocument();
  return screen.findByRole('region', { name: 'Data Model 详情' });
}

function settingsDataModelField(
  id: string,
  code: string,
  title: string,
  fieldKind = 'string',
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    code,
    title,
    physical_column_name: code,
    external_field_key: null,
    field_kind: fieldKind,
    is_required: false,
    is_unique: false,
    default_value: null,
    display_interface: 'input',
    display_options: {},
    relation_target_model_id: null,
    relation_options: {},
    sort_order: 0,
    ...overrides
  };
}

function settingsDataModel(
  id: string,
  code: string,
  title: string,
  fields: ReturnType<typeof settingsDataModelField>[],
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    scope_kind: 'system',
    scope_id: '00000000-0000-0000-0000-000000000000',
    code,
    title,
    status: 'published',
    api_exposure_status: 'published_not_exposed',
    runtime_availability: 'available',
    data_source_instance_id: 'main_source',
    source_kind: 'main_source',
    external_resource_key: null,
    external_table_id: null,
    physical_table_name: `dm_${code}`,
    acl_namespace: `data_model.${code}`,
    audit_namespace: `data_model.${code}`,
    fields,
    ...overrides
  };
}

const contactsModel = settingsDataModel(
  'model-1',
  'contacts',
  'Contacts',
  [
    settingsDataModelField('field-1', 'email', 'Email', 'string', {
      external_field_key: 'email',
      is_required: true,
      is_unique: true
    })
  ],
  {
    scope_kind: 'workspace',
    scope_id: 'workspace-1',
    data_source_instance_id: 'source-1',
    source_kind: 'external_source',
    external_resource_key: 'contacts',
    external_table_id: 'crm.contacts',
    physical_table_name: 'dm_contacts'
  }
);

const mainSourceModels = [
  settingsDataModel('model-attachments', 'attachments', 'Attachments', [
    settingsDataModelField('attachment-name', 'name', '文件名'),
    settingsDataModelField('attachment-size', 'size', '文件大小', 'integer')
  ]),
  settingsDataModel('model-users', 'users', '用户', [
    settingsDataModelField('user-username', 'username', '用户名', 'string', {
      is_required: true,
      is_unique: true
    }),
    settingsDataModelField(
      'user-display-name',
      'display_name',
      '显示名称',
      'string',
      {
        is_required: true
      }
    ),
    settingsDataModelField('user-email', 'email', '邮箱', 'string', {
      is_unique: true
    }),
    settingsDataModelField('user-status', 'status', '状态', 'string', {
      is_required: true
    }),
    settingsDataModelField('user-role-codes', 'role_codes', '角色', 'json'),
    settingsDataModelField(
      'user-created-at',
      'created_time',
      '创建时间',
      'datetime',
      {
        is_required: true
      }
    ),
    settingsDataModelField(
      'user-last-login-at',
      'last_login_at',
      '最后登录时间',
      'datetime'
    )
  ]),
  settingsDataModel('model-roles', 'roles', '角色', [
    settingsDataModelField('role-code', 'code', '角色标识', 'string', {
      is_required: true,
      is_unique: true
    }),
    settingsDataModelField('role-name', 'name', '角色名称', 'string', {
      is_required: true
    }),
    settingsDataModelField(
      'role-scope-kind',
      'scope_kind',
      '作用域',
      'string',
      {
        is_required: true
      }
    ),
    settingsDataModelField(
      'role-builtin',
      'is_builtin',
      '内置角色',
      'boolean',
      {
        is_required: true
      }
    ),
    settingsDataModelField(
      'role-default-member',
      'is_default_member_role',
      '默认成员角色',
      'boolean',
      { is_required: true }
    ),
    settingsDataModelField(
      'role-created-at',
      'created_time',
      '创建时间',
      'datetime',
      {
        is_required: true
      }
    )
  ])
];

describe('Settings data models page', () => {
  beforeEach(() => {
    consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation((...args) => consoleWarn(...args));
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => consoleError(...args));

    resetAuthStore();
    authenticate();
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
      role_code: 'root',
      permission_codes: []
    });
    permissionsApi.fetchSettingsPermissions.mockResolvedValue([]);
    docsApi.fetchSettingsApiDocsCatalog.mockResolvedValue({
      title: '1flowbase API',
      version: '0.1.0',
      categories: []
    });
    modelProvidersApi.fetchSettingsModelProviderCatalog.mockResolvedValue([]);
    modelProvidersApi.fetchSettingsModelProviderInstances.mockResolvedValue([]);
    modelProvidersApi.fetchSettingsModelProviderOptions.mockResolvedValue({
      providers: []
    });
    pluginsApi.fetchSettingsPluginFamilies.mockResolvedValue({
      locale_meta: {},
      i18n_catalog: {},
      entries: []
    });
    pluginsApi.fetchSettingsOfficialPluginCatalog.mockResolvedValue({
      source_kind: 'official_registry',
      entries: []
    });
    systemRuntimeApi.fetchSettingsSystemRuntimeProfile.mockResolvedValue({
      topology: { relationship: 'same_host' },
      hosts: []
    });
    fileManagementApi.fetchSettingsFileStorages.mockResolvedValue([]);
    fileManagementApi.fetchSettingsFileTables.mockResolvedValue([]);
    hostInfrastructureApi.fetchSettingsHostInfrastructureProviders.mockResolvedValue(
      []
    );

    dataModelsApi.fetchSettingsDataSourceInstances.mockResolvedValue([
      {
        id: 'main_source',
        source_kind: 'main_source',
        installation_id: 'main_source',
        source_code: 'main_source',
        display_name: '主数据源',
        status: 'ready',
        default_data_model_status: 'published',
        default_api_exposure_status: 'published_not_exposed',
        config_json: {},
        secret_ref: null,
        secret_version: null,
        catalog_refresh_status: null,
        catalog_last_error_message: null,
        catalog_refreshed_at: null
      },
      {
        id: 'source-1',
        source_kind: 'external_source',
        installation_id: 'installation-1',
        source_code: 'hubspot',
        display_name: 'HubSpot',
        status: 'ready',
        default_data_model_status: 'draft',
        default_api_exposure_status: 'draft',
        config_json: {},
        secret_ref: null,
        secret_version: null,
        catalog_refresh_status: 'ready',
        catalog_last_error_message: null,
        catalog_refreshed_at: '2026-04-30T08:00:00Z'
      }
    ]);
    dataModelsApi.fetchSettingsDataModels.mockImplementation(
      (sourceId: string) =>
        Promise.resolve(
          sourceId === 'main_source' ? mainSourceModels : [contactsModel]
        )
    );
    dataModelsApi.fetchSettingsDataModelScopeGrants.mockResolvedValue([
      {
        id: 'grant-owner',
        scope_kind: 'workspace',
        scope_id: 'workspace-1',
        data_model_id: 'model-1',
        enabled: true,
        permission_profile: 'owner'
      },
      {
        id: 'grant-scope',
        scope_kind: 'workspace',
        scope_id: 'workspace-1',
        data_model_id: 'model-1',
        enabled: true,
        permission_profile: 'scope_all'
      },
      {
        id: 'grant-system',
        scope_kind: 'system',
        scope_id: '00000000-0000-0000-0000-000000000000',
        data_model_id: 'model-1',
        enabled: false,
        permission_profile: 'system_all'
      }
    ]);
    dataModelsApi.fetchSettingsDataModelAdvisorFindings.mockResolvedValue([
      {
        id: 'finding-1',
        data_model_id: 'model-1',
        severity: 'blocking',
        code: 'unsafe_external_source',
        message: 'External source needs scope filtering.',
        recommended_action: 'Enable scope filtering.',
        can_acknowledge: false
      },
      {
        id: 'finding-2',
        data_model_id: 'model-1',
        severity: 'high',
        code: 'api_exposed_no_permission',
        message: 'Permission path is incomplete.',
        recommended_action: 'Check API key permissions.',
        can_acknowledge: false
      },
      {
        id: 'finding-3',
        data_model_id: 'model-1',
        severity: 'info',
        code: 'published_not_exposed',
        message: 'Published but not exposed.',
        recommended_action: 'Create API key only if needed.',
        can_acknowledge: true
      }
    ]);
    dataModelsApi.fetchSettingsDataModelRecordPreview.mockResolvedValue({
      items: [
        {
          id: 'record-1',
          email: 'person@example.com'
        }
      ],
      total: 1
    });
    dataModelsApi.updateSettingsDataModel.mockResolvedValue({
      id: 'model-1'
    });
    dataModelsApi.updateSettingsDataModelApiExposure.mockResolvedValue({
      id: 'model-1'
    });
    dataModelsApi.createSettingsDataModel.mockResolvedValue({
      id: 'model-new'
    });
    dataModelsApi.createSettingsDataModelField.mockResolvedValue({
      id: 'field-new'
    });
    dataModelsApi.updateSettingsDataModelField.mockResolvedValue({
      id: 'field-1'
    });
    dataModelsApi.deleteSettingsDataModelField.mockResolvedValue({
      deleted: true
    });
    dataModelsApi.updateSettingsDataModelScopeGrant.mockResolvedValue({
      id: 'grant-owner'
    });
    dataModelsApi.createSettingsDataModelScopeGrant.mockResolvedValue({
      id: 'grant-new'
    });
  });

  afterEach(() => {
    const warningCalls = [
      ...consoleWarnSpy.mock.calls,
      ...consoleErrorSpy.mock.calls
    ].filter((args) =>
      args.some((arg) => String(arg).includes(antdStaticMessageWarning))
    );

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();

    expect(warningCalls).toEqual([]);
  });

  test('shows data source navigation, defaults, and the Data Model table', async () => {
    renderApp('/settings/data-models');

    expect(await findDataModelsNavigation()).toBeInTheDocument();
    expect(await screen.findByText('主数据源')).toBeInTheDocument();
    expect(await screen.findByText('HubSpot')).toBeInTheDocument();
    const hubSpotRow = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('HubSpot'));
    expect(hubSpotRow).toBeDefined();
    expect(
      within(hubSpotRow as HTMLElement).getByLabelText('HubSpot 启用')
    ).toBeChecked();
    fireEvent.click(
      within(hubSpotRow as HTMLElement).getByRole('button', { name: '配置' })
    );
    expect(await screen.findByText('数据源管理')).toBeInTheDocument();
    expect(
      screen.queryByText(
        '管理内建主数据源和外部数据源的默认建模状态、API 暴露策略与 Data Model 访问面。'
      )
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返\s*回/ })).toBeInTheDocument();
    expect(screen.getByLabelText('默认 Data Model 状态')).toBeInTheDocument();
    expect(screen.getByLabelText('默认 API 暴露状态')).toBeInTheDocument();
    expect(
      screen.getByLabelText('默认 Data Model 状态说明')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('默认 API 暴露状态说明')).toBeInTheDocument();
    expect(
      screen.getByText(/draft: 草稿，默认新建为未发布状态/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/published_not_exposed: 默认不生成 API 访问面/)
    ).toBeInTheDocument();
    expect(await screen.findByText('Contacts')).toBeInTheDocument();
    expect(screen.getByText('contacts')).toBeInTheDocument();
  }, 10_000);

  test('shows built-in user and role metadata in the main data source editor', async () => {
    renderApp('/settings/data-models');

    expect(await findDataModelsNavigation()).toBeInTheDocument();
    expect(await screen.findByText('主数据源')).toBeInTheDocument();
    const mainSourceRow = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('主数据源'));
    expect(mainSourceRow).toBeDefined();
    fireEvent.click(
      within(mainSourceRow as HTMLElement).getByRole('button', {
        name: '配置'
      })
    );

    expect(await screen.findByText('Attachments')).toBeInTheDocument();
    const usersRow = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('users'));
    const rolesRow = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('roles'));
    expect(usersRow).toBeDefined();
    expect(rolesRow).toBeDefined();
    expect(
      within(usersRow as HTMLElement).getByText('用户')
    ).toBeInTheDocument();
    expect(within(usersRow as HTMLElement).getByText('7')).toBeInTheDocument();
    expect(
      within(rolesRow as HTMLElement).getByText('角色')
    ).toBeInTheDocument();
    expect(within(rolesRow as HTMLElement).getByText('6')).toBeInTheDocument();

    fireEvent.click(
      within(rolesRow as HTMLElement).getByRole('button', { name: '编辑' })
    );
    expect(await screen.findByText('编辑 角色')).toBeInTheDocument();
    const editorDialog = await screen.findByRole('region', {
      name: 'Data Model 详情'
    });
    expect(
      within(editorDialog).getByRole('tab', { name: '字段' })
    ).toBeInTheDocument();
    expect(within(editorDialog).getByText('角色标识')).toBeInTheDocument();
    expect(within(editorDialog).getByText('默认成员角色')).toBeInTheDocument();
  }, 10_000);

  test('selects a Data Model and exposes detail tabs with safe status controls', async () => {
    renderApp('/settings/data-models?source=source-1');

    const editorDialog = await openContactsDataModelEditor();
    expect(
      await screen.findByRole('tab', { name: '字段' })
    ).toBeInTheDocument();
    expect(
      within(editorDialog).getByTestId('data-model-detail-summary')
    ).toBeInTheDocument();
    expect(
      within(
        within(editorDialog).getByTestId('data-model-detail-summary')
      ).queryByLabelText('Data Model 状态')
    ).not.toBeInTheDocument();
    const detailActions = within(editorDialog).getByTestId(
      'data-model-detail-actions'
    );
    const tabs = within(editorDialog).getByRole('tab', { name: '字段' });
    expect(detailActions).toBeInTheDocument();
    expect(
      detailActions.compareDocumentPosition(tabs) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      within(detailActions).getByRole('button', {
        name: /编\s*辑/
      })
    ).toBeInTheDocument();
    expect(
      within(detailActions).getByLabelText('Data Model 状态')
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '关系' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '权限' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'API' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '记录预览' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Advisor' })).toBeInTheDocument();

    fireEvent.mouseDown(within(detailActions).getByLabelText('Data Model 状态'));
    expect(await screen.findByText('draft')).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('disabled')).toBeInTheDocument();
    expect(screen.getByText('broken')).toBeInTheDocument();
    expect(
      within(editorDialog).getByLabelText('Data Model 状态说明')
    ).toBeInTheDocument();
    expect(
      within(editorDialog).getByText(
        /broken: 当前定义、运行依赖或外部资源异常/
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    expect(
      await screen.findByText('published_not_exposed')
    ).toBeInTheDocument();
    expect(screen.getByText('api_exposed_ready')).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'api_exposed_ready' })
    ).not.toBeInTheDocument();
  });

  test('shows editable grants, record preview, and Advisor severities', async () => {
    renderApp('/settings/data-models?source=source-1');

    await openContactsDataModelEditor();
    fireEvent.click(screen.getByRole('tab', { name: '权限' }));
    expect(await screen.findByText('owner')).toBeInTheDocument();
    expect(screen.getByText('scope_all')).toBeInTheDocument();
    expect(screen.getByText('system_all')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '保存权限' }));
    await waitFor(() =>
      expect(dataModelsApi.updateSettingsDataModelScopeGrant).toHaveBeenCalled()
    );

    fireEvent.click(screen.getByRole('tab', { name: '记录预览' }));
    expect(await screen.findByText('person@example.com')).toBeInTheDocument();
    expect(
      dataModelsApi.fetchSettingsDataModelRecordPreview
    ).toHaveBeenCalledWith('contacts');

    fireEvent.click(screen.getByRole('tab', { name: 'Advisor' }));
    const advisorTab = await screen.findByTestId('data-model-advisor-tab');
    expect(within(advisorTab).getByText('blocking')).toBeInTheDocument();
    expect(within(advisorTab).getByText('high')).toBeInTheDocument();
    expect(within(advisorTab).getByText('info')).toBeInTheDocument();
  }, 20_000);

  test('creates and edits Data Models from the data source section', async () => {
    renderApp('/settings/data-models?source=source-1');

    await screen.findByText('Contacts', {}, { timeout: 10_000 });
    fireEvent.click(screen.getByRole('button', { name: '新建数据表' }));
    const createDialog = await screen.findByRole('dialog', {
      name: '新建 Data Model'
    });
    expect(createDialog).toBeInTheDocument();
    expect(within(createDialog).getByLabelText('Code说明')).toBeInTheDocument();
    expect(
      within(createDialog).getByText(/Code: Data Model 的稳定标识/)
    ).toBeInTheDocument();
    expect(within(createDialog).getByLabelText('标题说明')).toBeInTheDocument();
    expect(
      within(createDialog).getByText(/标题: 管理台展示名称/)
    ).toBeInTheDocument();
    expect(within(createDialog).getByLabelText('状态说明')).toBeInTheDocument();
    expect(
      within(createDialog).getByText(/disabled: 已停用，不进入运行面/)
    ).toBeInTheDocument();
    const titleInput = within(createDialog).getByLabelText('标题');
    const codeInput = within(createDialog).getByLabelText('Code');
    expect(
      titleInput.compareDocumentPosition(codeInput) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Code'), {
      target: { value: 'companies' }
    });
    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: 'Companies' }
    });
    fireEvent.change(screen.getByLabelText('表 ID'), {
      target: { value: 'crm.companies' }
    });
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() =>
      expect(dataModelsApi.createSettingsDataModel).toHaveBeenCalledWith(
        expect.objectContaining({
          scope_kind: 'workspace',
          code: 'companies',
          title: 'Companies',
          status: 'draft',
          data_source_instance_id: 'source-1',
          external_resource_key: 'crm.companies',
          external_table_id: 'crm.companies'
        }),
        'csrf-123'
      )
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '新建 Data Model' })
      ).not.toBeInTheDocument()
    );

    await screen.findByText('Contacts', {}, { timeout: 10_000 });
    const contactsRow = screen
      .getAllByRole('row')
      .find((row) => within(row).queryByText('Contacts'));
    expect(contactsRow).toBeDefined();

    fireEvent.click(
      within(contactsRow as HTMLElement).getByRole('button', { name: '编辑' })
    );
    expect(await screen.findByText('编辑 Contacts')).toBeInTheDocument();
    const editorDialog = await screen.findByRole('region', {
      name: 'Data Model 详情'
    });
    const detailActions = within(editorDialog).getByTestId(
      'data-model-detail-actions'
    );
    expect(
      within(editorDialog).getByRole('tab', { name: '字段' })
    ).toBeInTheDocument();
    expect(within(editorDialog).getByText('crm.contacts')).toBeInTheDocument();

    fireEvent.click(
      within(detailActions).getByRole('button', { name: /编\s*辑/ })
    );
    const editDialog = await screen.findByRole('dialog', {
      name: '编辑 Data Model'
    });
    fireEvent.change(within(editDialog).getByDisplayValue('Contacts'), {
      target: { value: 'Customer Contacts' }
    });
    fireEvent.change(within(editDialog).getByDisplayValue('crm.contacts'), {
      target: { value: 'crm.contacts.v2' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(dataModelsApi.updateSettingsDataModel).toHaveBeenCalledWith(
        'model-1',
        expect.objectContaining({
          title: 'Customer Contacts',
          status: 'published',
          external_table_id: 'crm.contacts.v2'
        }),
        'csrf-123'
      )
    );
  }, 20_000);

  test('manages Data Model fields through the field drawer with delete confirmation', async () => {
    renderApp('/settings/data-models?source=source-1');

    const editorDialog = await openContactsDataModelEditor();
    fireEvent.click(
      within(editorDialog).getByRole('button', { name: '新增字段' })
    );
    expect(await screen.findByLabelText('字段 Code')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('字段 Code'), {
      target: { value: 'company_name' }
    });
    fireEvent.change(screen.getByLabelText('字段标题'), {
      target: { value: 'Company Name' }
    });
    fireEvent.click(screen.getByRole('checkbox', { name: '必填' }));
    fireEvent.click(screen.getByRole('button', { name: '创建字段' }));

    await waitFor(() =>
      expect(dataModelsApi.createSettingsDataModelField).toHaveBeenCalledWith(
        'model-1',
        expect.objectContaining({
          code: 'company_name',
          title: 'Company Name',
          field_kind: 'string',
          is_required: true,
          is_unique: false,
          default_value: null,
          display_interface: 'input',
          display_options: {},
          relation_target_model_id: null,
          relation_options: {}
        }),
        'csrf-123'
      )
    );

    fireEvent.click(await screen.findByText('Email'));
    expect(await screen.findByText('编辑字段')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('字段标题'), {
      target: { value: 'Primary Email' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存字段' }));

    await waitFor(() =>
      expect(dataModelsApi.updateSettingsDataModelField).toHaveBeenCalledWith(
        'model-1',
        'field-1',
        expect.objectContaining({
          title: 'Primary Email',
          is_required: true,
          is_unique: true,
          display_interface: 'input',
          display_options: {},
          relation_options: {}
        }),
        'csrf-123'
      )
    );

    fireEvent.click(await screen.findByText('Email'));
    fireEvent.click(screen.getByRole('button', { name: '删除字段' }));
    expect(await screen.findByText('确认删除字段')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() =>
      expect(dataModelsApi.deleteSettingsDataModelField).toHaveBeenCalledWith(
        'model-1',
        'field-1',
        'csrf-123'
      )
    );
  }, 20_000);

  test('requests and closes API exposure without raw ready or unsafe selectors', async () => {
    renderApp('/settings/data-models?source=source-1');

    await openContactsDataModelEditor();
    fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    expect(
      await screen.findByText('published_not_exposed')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'api_exposed_ready' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'unsafe_external_source' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '请求 API 暴露' }));
    await waitFor(() =>
      expect(
        dataModelsApi.updateSettingsDataModelApiExposure
      ).toHaveBeenCalledWith(
        'model-1',
        { api_exposure_status: 'api_exposed_no_permission' },
        'csrf-123'
      )
    );
  }, 20_000);

  test('closes an existing API exposure request from the API tab', async () => {
    dataModelsApi.fetchSettingsDataModels.mockResolvedValue([
      {
        id: 'model-1',
        scope_kind: 'workspace',
        scope_id: 'workspace-1',
        code: 'contacts',
        title: 'Contacts',
        status: 'published',
        api_exposure_status: 'api_exposed_no_permission',
        runtime_availability: 'available',
        data_source_instance_id: 'source-1',
        source_kind: 'external_source',
        external_resource_key: 'contacts',
        external_table_id: 'crm.contacts',
        physical_table_name: 'dm_contacts',
        acl_namespace: 'data_model.contacts',
        audit_namespace: 'data_model.contacts',
        fields: []
      }
    ]);

    renderApp('/settings/data-models?source=source-1');

    await openContactsDataModelEditor();
    fireEvent.click(screen.getByRole('tab', { name: 'API' }));
    expect(
      await screen.findByText('api_exposed_no_permission')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭 API 暴露' }));

    await waitFor(() =>
      expect(
        dataModelsApi.updateSettingsDataModelApiExposure
      ).toHaveBeenCalledWith(
        'model-1',
        { api_exposure_status: 'published_not_exposed' },
        'csrf-123'
      )
    );
  });
});
