import { describe, expect, test, vi } from 'vitest';

import type { JsBlockHostDataEffect } from '@1flowbase/page-runtime';

import {
  createFrontstageJsBlockDataEffectHandler,
  type FrontstageJsBlockDataEffectClient
} from '../../lib/js-block-data-effect-handler';

function createEffect(
  overrides: Partial<JsBlockHostDataEffect> = {}
): JsBlockHostDataEffect {
  return {
    type: 'data',
    requestId: 'request-1',
    effectId: 'effect-1',
    operation: 'query',
    payload: { model: 'orders' },
    ...overrides
  };
}

function createClient(): FrontstageJsBlockDataEffectClient {
  return {
    fetchConsoleRuntimeModelRecords: vi
      .fn()
      .mockResolvedValue({ items: [{ id: 'order-1' }], total: 1 }),
    createConsoleRuntimeModelRecord: vi
      .fn()
      .mockResolvedValue({ id: 'order-2', title: 'Created' }),
    updateConsoleRuntimeModelRecord: vi
      .fn()
      .mockResolvedValue({ id: 'order-1', title: 'Updated' }),
    deleteConsoleRuntimeModelRecord: vi.fn().mockResolvedValue({ deleted: true })
  };
}

describe('createFrontstageJsBlockDataEffectHandler', () => {
  test('maps query effects to runtime model record fetches with supported payload fields', async () => {
    const client = createClient();
    const handler = createFrontstageJsBlockDataEffectHandler({
      baseUrl: 'http://api.test',
      client
    });

    const result = await handler(
      createEffect({
        operation: 'query',
        payload: {
          model: 'orders',
          page: 2,
          pageSize: 25,
          filter: { field: 'status', operator: 'eq', value: 'open' },
          sort: { field: 'created_at', direction: 'desc' },
          expand: ['customer', 'items']
        }
      })
    );

    expect(result).toEqual({ items: [{ id: 'order-1' }], total: 1 });
    expect(client.fetchConsoleRuntimeModelRecords).toHaveBeenCalledWith(
      'orders',
      {
        page: 2,
        page_size: 25,
        filter: { field: 'status', operator: 'eq', value: 'open' },
        sort: { field: 'created_at', direction: 'desc' },
        expand: ['customer', 'items']
      },
      'http://api.test'
    );
  });

  test('accepts page_size, string filter, string sort, and string expand for query effects', async () => {
    const client = createClient();
    const handler = createFrontstageJsBlockDataEffectHandler({
      baseUrl: 'http://api.test',
      client
    });

    await handler(
      createEffect({
        operation: 'query',
        payload: {
          model: 'orders',
          page_size: 50,
          filter: 'status:eq:open',
          sort: 'created_at:desc',
          expand: 'customer'
        }
      })
    );

    expect(client.fetchConsoleRuntimeModelRecords).toHaveBeenCalledWith(
      'orders',
      {
        page_size: 50,
        filter: 'status:eq:open',
        sort: 'created_at:desc',
        expand: 'customer'
      },
      'http://api.test'
    );
  });

  test('maps create, update, and delete write effects to runtime model record mutations', async () => {
    const client = createClient();
    const handler = createFrontstageJsBlockDataEffectHandler({
      csrfToken: 'csrf-123',
      baseUrl: 'http://api.test',
      client
    });

    await expect(
      handler(
        createEffect({
          operation: 'create',
          payload: { model: 'orders', input: { title: 'Created' } }
        })
      )
    ).resolves.toEqual({ id: 'order-2', title: 'Created' });

    await expect(
      handler(
        createEffect({
          operation: 'update',
          payload: {
            model: 'orders',
            id: 'order-1',
            input: { title: 'Updated' }
          }
        })
      )
    ).resolves.toEqual({ id: 'order-1', title: 'Updated' });

    await expect(
      handler(
        createEffect({
          operation: 'delete',
          payload: { model: 'orders', id: 'order-1' }
        })
      )
    ).resolves.toEqual({ deleted: true });

    expect(client.createConsoleRuntimeModelRecord).toHaveBeenCalledWith(
      'orders',
      { title: 'Created' },
      'csrf-123',
      'http://api.test'
    );
    expect(client.updateConsoleRuntimeModelRecord).toHaveBeenCalledWith(
      'orders',
      'order-1',
      { title: 'Updated' },
      'csrf-123',
      'http://api.test'
    );
    expect(client.deleteConsoleRuntimeModelRecord).toHaveBeenCalledWith(
      'orders',
      'order-1',
      'csrf-123',
      'http://api.test'
    );
  });

  test('rejects write effects without csrfToken before calling the api client', async () => {
    const client = createClient();
    const handler = createFrontstageJsBlockDataEffectHandler({ client });

    await expect(
      handler(
        createEffect({
          operation: 'create',
          payload: { model: 'orders', input: { title: 'Created' } }
        })
      )
    ).rejects.toThrow('JS Block data write effect requires csrfToken.');
    expect(client.createConsoleRuntimeModelRecord).not.toHaveBeenCalled();
  });

  test('rejects unknown operations with a stable error', async () => {
    const client = createClient();
    const handler = createFrontstageJsBlockDataEffectHandler({ client });

    await expect(
      handler(createEffect({ operation: 'archive' }))
    ).rejects.toThrow('JS Block data effect operation is not supported: archive.');
    expect(client.fetchConsoleRuntimeModelRecords).not.toHaveBeenCalled();
  });

  test('rejects invalid payload shapes with stable errors', async () => {
    const handler = createFrontstageJsBlockDataEffectHandler({
      csrfToken: 'csrf-123',
      client: createClient()
    });

    await expect(
      handler(createEffect({ payload: null }))
    ).rejects.toThrow('JS Block data effect payload must be an object.');
    await expect(
      handler(createEffect({ payload: { page: 1 } }))
    ).rejects.toThrow(
      'JS Block data effect payload.model must be a non-empty string.'
    );
    await expect(
      handler(
        createEffect({
          operation: 'create',
          payload: { model: 'orders', input: 'bad-input' }
        })
      )
    ).rejects.toThrow(
      'JS Block data effect payload.input must be an object.'
    );
    await expect(
      handler(
        createEffect({
          operation: 'update',
          payload: { model: 'orders', input: {} }
        })
      )
    ).rejects.toThrow(
      'JS Block data effect payload.id must be a non-empty string.'
    );
    await expect(
      handler(createEffect({ payload: { model: 'orders', page: 0 } }))
    ).rejects.toThrow(
      'JS Block data effect payload.page must be a positive integer.'
    );
  });
});
