import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@1flowbase/api-client', () => ({
  fetchConsoleDataModels: vi.fn().mockResolvedValue([]),
  getDefaultApiBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:7800')
}));

import {
  fetchConsoleDataModels,
  type ConsoleDataModel,
  type ConsoleDataModelStatus
} from '@1flowbase/api-client';

import {
  dataModelOptionsQueryKey,
  fetchDataModelOptions,
  listAgentFlowDataModelOptions
} from '../../api/data-model-options';

const baseModel = {
  id: 'model-1',
  scope_kind: 'workspace',
  scope_id: 'workspace-1',
  code: 'customer',
  title: 'Customer',
  status: 'published',
  api_exposure_status: 'api_exposed_ready',
  runtime_availability: 'available',
  data_source_instance_id: null,
  source_kind: 'main_source',
  external_resource_key: null,
  physical_table_name: 'data_customer',
  acl_namespace: 'data_model.customer',
  audit_namespace: 'data_model.customer',
  fields: []
} satisfies Omit<ConsoleDataModel, 'status'> & {
  status: ConsoleDataModelStatus;
};

function createModel(
  overrides: Partial<ConsoleDataModel> & { status?: ConsoleDataModelStatus } = {}
): ConsoleDataModel {
  return {
    ...baseModel,
    ...overrides,
    fields: overrides.fields ?? baseModel.fields
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('agent flow data model options api', () => {
  test('uses a stable query key', () => {
    expect(dataModelOptionsQueryKey).toEqual([
      'agent-flow',
      'data-model-options'
    ]);
  });

  test('maps data model status and field metadata into selectable options', () => {
    const options = listAgentFlowDataModelOptions([
      createModel({
        id: 'model-published',
        code: 'customer',
        title: 'Customer',
        status: 'published',
        fields: [
          {
            id: 'field-2',
            code: 'name',
            title: 'Name',
            physical_column_name: 'name',
            external_field_key: null,
            field_kind: 'text',
            is_required: true,
            is_unique: false,
            default_value: null,
            display_interface: null,
            display_options: {},
            relation_target_model_id: null,
            relation_options: {},
            sort_order: 20
          },
          {
            id: 'field-1',
            code: 'email',
            title: '',
            physical_column_name: 'email',
            external_field_key: null,
            field_kind: 'email',
            is_required: false,
            is_unique: true,
            default_value: null,
            display_interface: null,
            display_options: {},
            relation_target_model_id: null,
            relation_options: {},
            sort_order: 10
          }
        ]
      }),
      createModel({
        id: 'model-draft',
        code: 'draft_model',
        title: '',
        status: 'draft'
      }),
      createModel({
        id: 'model-disabled',
        code: 'disabled_model',
        title: 'Disabled Model',
        status: 'disabled'
      }),
      createModel({
        id: 'model-broken',
        code: 'broken_model',
        title: 'Broken Model',
        status: 'broken'
      })
    ]);

    expect(options).toEqual([
      {
        value: 'customer',
        label: 'Customer',
        state: 'enabled',
        disabled: false,
        disabledReason: null,
        modelId: 'model-published',
        modelCode: 'customer',
        fields: [
          {
            code: 'email',
            title: 'email',
            valueType: 'email',
            required: false
          },
          {
            code: 'name',
            title: 'Name',
            valueType: 'text',
            required: true
          }
        ]
      },
      {
        value: 'draft_model',
        label: 'draft_model',
        state: 'unpublished',
        disabled: true,
        disabledReason: 'Data Model is not published',
        modelId: 'model-draft',
        modelCode: 'draft_model',
        fields: []
      },
      {
        value: 'disabled_model',
        label: 'Disabled Model',
        state: 'disabled',
        disabled: true,
        disabledReason: 'Data Model is disabled',
        modelId: 'model-disabled',
        modelCode: 'disabled_model',
        fields: []
      },
      {
        value: 'broken_model',
        label: 'Broken Model',
        state: 'broken',
        disabled: true,
        disabledReason: 'Data Model is broken',
        modelId: 'model-broken',
        modelCode: 'broken_model',
        fields: []
      }
    ]);
  });

  test('passes the resolved applications api base url to the console client', async () => {
    vi.mocked(fetchConsoleDataModels).mockResolvedValue([
      createModel({ id: 'model-1', code: 'order', title: 'Order' })
    ]);

    await expect(fetchDataModelOptions()).resolves.toMatchObject([
      {
        value: 'order',
        label: 'Order',
        state: 'enabled'
      }
    ]);

    expect(fetchConsoleDataModels).toHaveBeenCalledWith(
      {},
      'http://127.0.0.1:7800'
    );
  });
});
