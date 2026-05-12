import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  APPLICATION_PUBLIC_RUNTIME_PATHS,
  createConsoleApplicationApiKey,
  fetchConsoleApplicationApiDocsCategoryOperations,
  fetchConsoleApplicationApiDocsCategorySpec,
  fetchConsoleApplicationApiOperationSpec,
  getConsoleApplicationApiMapping,
  getConsoleApplicationApiPublication,
  listConsoleApplicationApiKeys,
  publishConsoleApplicationApiVersion,
  replaceConsoleApplicationApiMapping,
  revokeConsoleApplicationApiKey,
  updateConsoleApplicationApiStatus
} from '../application-public-api';

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data, meta: null }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function rawJsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

describe('application public API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('uses application-scoped console paths for key lifecycle', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'key-1',
          name: 'Server key',
          token: 'sk-secret',
          token_prefix: 'sk-1234',
          creator_user_id: 'user-1',
          enabled: true,
          expires_at: null,
          last_used_at: null,
          created_at: '2026-05-09T00:00:00Z',
          updated_at: '2026-05-09T00:00:00Z'
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await listConsoleApplicationApiKeys('app-1', 'http://localhost:7800');
    await createConsoleApplicationApiKey(
      'app-1',
      { name: 'Server key', expires_at: null },
      'csrf-1',
      'http://localhost:7800'
    );
    await revokeConsoleApplicationApiKey(
      'app-1',
      'key-1',
      'csrf-1',
      'http://localhost:7800'
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:7800/api/console/applications/app-1/api-keys',
      expect.objectContaining({ method: 'GET' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:7800/api/console/applications/app-1/api-keys',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-1' }),
        body: JSON.stringify({ name: 'Server key', expires_at: null })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:7800/api/console/applications/app-1/api-keys/key-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf-1' })
      })
    );
  });

  test('uses application-scoped console paths for mapping and publication', async () => {
    const mapping = {
      input: {
        query_target: 'start.query',
        model_target: null,
        inputs_target: 'start.inputs',
        history_target: 'start.history',
        attachments_target: 'start.attachments'
      },
      output: {
        answer_selector: 'answer',
        usage_selector: 'usage',
        files_selector: null,
        error_selector: 'error'
      }
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(mapping))
      .mockResolvedValueOnce(jsonResponse(mapping))
      .mockResolvedValueOnce(
        jsonResponse({ id: 'pub-1', mapping_snapshot: mapping })
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 'pub-2', mapping_snapshot: mapping })
      )
      .mockResolvedValueOnce(
        jsonResponse({ application_id: 'app-1', api_enabled: false })
      );

    await getConsoleApplicationApiMapping('app-1', 'http://localhost:7800');
    await replaceConsoleApplicationApiMapping(
      'app-1',
      mapping,
      'csrf-1',
      'http://localhost:7800'
    );
    await getConsoleApplicationApiPublication('app-1', 'http://localhost:7800');
    await publishConsoleApplicationApiVersion(
      'app-1',
      { mapping, api_enabled: true },
      'csrf-1',
      'http://localhost:7800'
    );
    await updateConsoleApplicationApiStatus(
      'app-1',
      { api_enabled: false },
      'csrf-1',
      'http://localhost:7800'
    );

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:7800/api/console/applications/app-1/api-mapping',
      'http://localhost:7800/api/console/applications/app-1/api-mapping',
      'http://localhost:7800/api/console/applications/app-1/api-publication',
      'http://localhost:7800/api/console/applications/app-1/api-publications',
      'http://localhost:7800/api/console/applications/app-1/api-status'
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(mapping)
      })
    );
    expect(fetchMock.mock.calls[3]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mapping, api_enabled: true })
      })
    );
    expect(fetchMock.mock.calls[4]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ api_enabled: false })
      })
    );
  });

  test('uses application-scoped docs routes and raw OpenAPI responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ id: 'openai-compatible-api', operations: [] })
      )
      .mockResolvedValueOnce(rawJsonResponse({ openapi: '3.1.0', paths: {} }))
      .mockResolvedValueOnce(rawJsonResponse({ openapi: '3.1.0', paths: {} }));

    await fetchConsoleApplicationApiDocsCategoryOperations(
      'app-1',
      'openai-compatible-api',
      'http://localhost:7800'
    );
    await fetchConsoleApplicationApiDocsCategorySpec(
      'app-1',
      'openai-compatible-api',
      'http://localhost:7800'
    );
    await fetchConsoleApplicationApiOperationSpec(
      'app-1',
      'applicationOpenAiCreateChatCompletion',
      'http://localhost:7800'
    );

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:7800/api/console/applications/app-1/api-docs/categories/openai-compatible-api/operations',
      'http://localhost:7800/api/console/applications/app-1/api-docs/categories/openai-compatible-api/openapi.json',
      'http://localhost:7800/api/console/applications/app-1/api-docs/operations/applicationOpenAiCreateChatCompletion/openapi.json'
    ]);
  });

  test('passes locale through application-scoped docs routes', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ id: 'openai-compatible-api', operations: [] })
      )
      .mockResolvedValueOnce(rawJsonResponse({ openapi: '3.1.0', paths: {} }))
      .mockResolvedValueOnce(rawJsonResponse({ openapi: '3.1.0', paths: {} }));

    await fetchConsoleApplicationApiDocsCategoryOperations(
      'app-1',
      'openai-compatible-api',
      'http://localhost:7800',
      'zh_Hans'
    );
    await fetchConsoleApplicationApiDocsCategorySpec(
      'app-1',
      'openai-compatible-api',
      'http://localhost:7800',
      'zh_Hans'
    );
    await fetchConsoleApplicationApiOperationSpec(
      'app-1',
      'applicationOpenAiCreateChatCompletion',
      'http://localhost:7800',
      'zh_Hans'
    );

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:7800/api/console/applications/app-1/api-docs/categories/openai-compatible-api/operations?locale=zh_Hans',
      'http://localhost:7800/api/console/applications/app-1/api-docs/categories/openai-compatible-api/openapi.json?locale=zh_Hans',
      'http://localhost:7800/api/console/applications/app-1/api-docs/operations/applicationOpenAiCreateChatCompletion/openapi.json?locale=zh_Hans'
    ]);
  });

  test('keeps public runtime path examples application-id-free', () => {
    expect(Object.values(APPLICATION_PUBLIC_RUNTIME_PATHS)).toEqual([
      '/api/1flowbase/runs',
      '/api/1flowbase/files',
      '/v1/chat/completions',
      '/v1/messages'
    ]);
    for (const path of Object.values(APPLICATION_PUBLIC_RUNTIME_PATHS)) {
      expect(path).not.toContain('application');
    }
  });
});
