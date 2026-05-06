import { describe, expect, test, vi } from 'vitest';
import * as transport from '../transport';

import {
  createConsoleDataModel,
  createConsoleDataModelField,
  createConsoleDataModelScopeGrant,
  deleteConsoleDataModelField,
  fetchConsoleDataModelAdvisorFindings,
  fetchConsoleDataModelOpenApiDocument,
  fetchConsoleDataModelRecordPreview,
  fetchConsoleDataModelScopeGrants,
  fetchConsoleDataModels,
  fetchConsoleDataSourceInstances,
  updateConsoleDataModel,
  updateConsoleDataModelApiExposure,
  updateConsoleDataModelField,
  updateConsoleDataModelScopeGrant,
  updateConsoleDataSourceDefaults
} from '../console-data-models';

describe('console-data-models client', () => {
  const apiFetchSpy = vi
    .spyOn(transport, 'apiFetch')
    .mockImplementation(async (input) => input as never);

  test('transport spy is active', () => {
    expect(apiFetchSpy).toBeDefined();
  });

  test('fetchConsoleDataSourceInstances reads the data source collection', async () => {
    await expect(fetchConsoleDataSourceInstances()).resolves.toMatchObject({
      path: '/api/console/data-sources/instances'
    });
  });

  test('updateConsoleDataSourceDefaults patches defaults with CSRF', async () => {
    await expect(
      updateConsoleDataSourceDefaults(
        'source-1',
        {
          default_data_model_status: 'draft',
          default_api_exposure_status: 'draft'
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/data-sources/instances/source-1/defaults',
      method: 'PATCH',
      csrfToken: 'csrf-123'
    });
  });

  test('fetchConsoleDataModels can filter by data source', async () => {
    await expect(
      fetchConsoleDataModels({ data_source_instance_id: 'main_source' })
    ).resolves.toMatchObject({
      path: '/api/console/models?data_source_instance_id=main_source'
    });
  });

  test('create and update Data Models use the console model routes', async () => {
    await expect(
      createConsoleDataModel(
        {
          scope_kind: 'workspace',
          data_source_instance_id: 'source-1',
          external_resource_key: 'contacts',
          external_table_id: 'crm.contacts',
          code: 'orders',
          title: 'Orders',
          status: 'draft'
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/models',
      method: 'POST',
      body: {
        scope_kind: 'workspace',
        data_source_instance_id: 'source-1',
        external_resource_key: 'contacts',
        external_table_id: 'crm.contacts',
        code: 'orders',
        title: 'Orders',
        status: 'draft'
      },
      csrfToken: 'csrf-123'
    });

    await expect(
      updateConsoleDataModel(
        'model-1',
        {
          status: 'published',
          external_table_id: 'crm.contacts.v2'
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1',
      method: 'PATCH',
      body: {
        status: 'published',
        external_table_id: 'crm.contacts.v2'
      },
      csrfToken: 'csrf-123'
    });
  });

  test('updates API exposure requests through the model patch route', async () => {
    await expect(
      updateConsoleDataModelApiExposure(
        'model-1',
        {
          api_exposure_status: 'api_exposed_no_permission'
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1',
      method: 'PATCH',
      body: {
        api_exposure_status: 'api_exposed_no_permission'
      },
      csrfToken: 'csrf-123'
    });
  });

  test('field mutations use field routes and confirmation query', async () => {
    await expect(
      createConsoleDataModelField(
        'model-1',
        {
          code: 'email',
          title: 'Email',
          field_kind: 'string',
          is_required: true,
          is_unique: false,
          default_value: null,
          display_interface: 'input',
          display_options: {},
          relation_target_model_id: null,
          relation_options: {}
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1/fields',
      method: 'POST',
      csrfToken: 'csrf-123'
    });

    await expect(
      updateConsoleDataModelField(
        'model-1',
        'field-1',
        {
          title: 'Email',
          is_required: false,
          is_unique: true,
          default_value: null,
          display_interface: 'input',
          display_options: {},
          relation_options: {}
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1/fields/field-1',
      method: 'PATCH',
      csrfToken: 'csrf-123'
    });

    await expect(
      deleteConsoleDataModelField('model-1', 'field-1', 'csrf-123')
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1/fields/field-1?confirmed=true',
      method: 'DELETE',
      csrfToken: 'csrf-123'
    });
  });

  test('scope grant list and mutations use scope-grant routes', async () => {
    await expect(
      fetchConsoleDataModelScopeGrants('model-1')
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1/scope-grants'
    });

    await expect(
      createConsoleDataModelScopeGrant(
        'model-1',
        {
          scope_kind: 'system',
          scope_id: '00000000-0000-0000-0000-000000000000',
          enabled: true,
          permission_profile: 'system_all',
          confirm_unsafe_external_source_system_all: true
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1/scope-grants',
      method: 'POST',
      csrfToken: 'csrf-123'
    });

    await expect(
      updateConsoleDataModelScopeGrant(
        'model-1',
        'grant-1',
        {
          enabled: false,
          permission_profile: 'owner',
          confirm_unsafe_external_source_system_all: false
        },
        'csrf-123'
      )
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1/scope-grants/grant-1',
      method: 'PATCH',
      csrfToken: 'csrf-123'
    });
  });

  test('advisor and runtime record preview use existing read routes', async () => {
    await expect(
      fetchConsoleDataModelAdvisorFindings('model-1')
    ).resolves.toMatchObject({
      path: '/api/console/models/model-1/advisor-findings'
    });

    await expect(
      fetchConsoleDataModelRecordPreview('orders')
    ).resolves.toMatchObject({
      path: '/api/runtime/models/orders/records?page=1&page_size=20'
    });

    await expect(
      fetchConsoleDataModelOpenApiDocument('model-1')
    ).resolves.toMatchObject({
      path: '/api/console/docs/data-models/model-1/openapi.json'
    });
  });
});
