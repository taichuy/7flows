import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  getConsoleApplicationRunNodeLastRun,
  getConsoleDebugVariableSnapshot,
  getConsoleRuntimeDebugArtifact,
  startConsoleFlowDebugRunStream,
  subscribeConsoleFlowDebugRunStream
} from '../console-application-runtime';

function sseResponse(frame: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frame));
        controller.close();
      }
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' }
    }
  );
}

describe('console application runtime stream client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('normalizes runtime event envelope frames and sends cursor query', async () => {
    const onEvent = vi.fn();
    const onCompleted = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse(`id: run-1:2
event: text_delta
data: {"event_id":"run-1:2","run_id":"run-1","node_run_id":"node-run-1","event_type":"text_delta","sequence":2,"created_at":"2026-05-08T00:00:00Z","delta_index":2,"content_type":"text","text":"退款","payload":{"type":"text_delta","node_run_id":"node-run-1","node_id":"node-llm","text":"退款"}}

`)
    );

    await startConsoleFlowDebugRunStream(
      'app-1',
      { input_payload: { 'node-start': { query: '退款' } } },
      'csrf-123',
      { onEvent, onCompleted },
      {
        baseUrl: 'http://127.0.0.1:7800',
        cursor: { from_sequence: 1, last_event_id: 'run-1:1' }
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7800/api/console/applications/app-1/orchestration/debug-runs/stream?from_sequence=1&last_event_id=run-1%3A1',
      expect.objectContaining({
        body: JSON.stringify({
          input_payload: { 'node-start': { query: '退款' } }
        })
      })
    );
    expect(onEvent).toHaveBeenCalledWith({
      type: 'text_delta',
      run_id: 'run-1',
      node_run_id: 'node-run-1',
      node_id: 'node-llm',
      text: '退款',
      event_id: 'run-1:2',
      sequence: 2,
      created_at: '2026-05-08T00:00:00Z',
      delta_index: 2,
      content_type: 'text'
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  test('subscribes to an existing run stream with cursor query', async () => {
    const onEvent = vi.fn();
    const onCompleted = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        sseResponse(
          'id: run-1:42\nevent: replay_expired\ndata: {"type":"replay_expired","run_id":"run-1","from_sequence":42,"reason":"cursor_expired"}\n\n'
        )
      );

    await subscribeConsoleFlowDebugRunStream(
      'app-1',
      'run-1',
      'csrf-123',
      { onEvent, onCompleted },
      {
        baseUrl: 'http://127.0.0.1:7800',
        cursor: { from_sequence: 42 }
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7800/api/console/applications/app-1/orchestration/runs/run-1/debug-stream?from_sequence=42',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          accept: 'text/event-stream',
          'x-csrf-token': 'csrf-123'
        })
      })
    );
    expect(onEvent).toHaveBeenCalledWith({
      type: 'replay_expired',
      run_id: 'run-1',
      from_sequence: 42,
      reason: 'cursor_expired',
      event_id: 'run-1:42'
    });
    expect(onCompleted).toHaveBeenCalledTimes(1);
  });

  test('loads runtime debug artifact content by application scope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"hello":"world"}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    await expect(
      getConsoleRuntimeDebugArtifact(
        'app-1',
        'artifact-1',
        'http://127.0.0.1:7800'
      )
    ).resolves.toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7800/api/console/applications/app-1/orchestration/debug-artifacts/artifact-1',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include'
      })
    );
  });

  test('loads debug variable snapshot without query parameters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"data":{"variable_cache":{}}}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    await expect(
      getConsoleDebugVariableSnapshot('app-1', 'http://127.0.0.1:7800')
    ).resolves.toEqual({ variable_cache: {} });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7800/api/console/applications/app-1/orchestration/debug-variable-snapshot',
      expect.any(Object)
    );
  });

  test('fetches node run detail inside an explicit flow run', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    await expect(
      getConsoleApplicationRunNodeLastRun(
        'app-1',
        'run-1',
        'node-llm',
        'http://127.0.0.1:7800'
      )
    ).resolves.toEqual(null);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7800/api/console/applications/app-1/logs/runs/run-1/nodes/node-llm',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include'
      })
    );
  });
});
