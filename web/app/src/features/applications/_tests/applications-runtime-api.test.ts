import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@1flowbase/api-client', () => ({
  completeConsoleCallbackTask: vi.fn().mockResolvedValue(undefined),
  getConsoleApplicationRunDetail: vi.fn().mockResolvedValue({
    flow_run: { id: 'run-1' },
    node_runs: [],
    checkpoints: [],
    callback_tasks: [],
    events: []
  }),
  getConsoleApplicationRuns: vi.fn().mockResolvedValue([]),
  getConsoleRuntimeDebugStream: vi.fn().mockResolvedValue({ parts: [] }),
  resumeConsoleFlowRun: vi.fn().mockResolvedValue(undefined),
  getDefaultApiBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:7800')
}));

import {
  completeConsoleCallbackTask,
  getConsoleApplicationRunDetail,
  getConsoleApplicationRuns,
  getConsoleRuntimeDebugStream,
  resumeConsoleFlowRun
} from '@1flowbase/api-client';

import {
  applicationRunDetailQueryKey,
  applicationRunsQueryKey,
  applicationRuntimeDebugStreamQueryKey,
  completeCallbackTask,
  fetchApplicationRunDetail,
  fetchApplicationRuns,
  fetchRuntimeDebugStream,
  resumeFlowRun
} from '../api/runtime';

afterEach(() => {
  vi.clearAllMocks();
});

describe('applications runtime api', () => {
  test('builds stable runtime query keys', () => {
    expect(applicationRunsQueryKey('app-1')).toEqual([
      'applications',
      'app-1',
      'runtime',
      'runs',
      1,
      20,
      'all',
      'started_at',
      'desc'
    ]);
    expect(applicationRunDetailQueryKey('app-1', 'run-1')).toEqual([
      'applications',
      'app-1',
      'runtime',
      'runs',
      'run-1'
    ]);
    expect(applicationRuntimeDebugStreamQueryKey('app-1', 'run-1')).toEqual([
      'applications',
      'app-1',
      'runtime',
      'runs',
      'run-1',
      'debug-stream'
    ]);
  });

  test('passes the resolved base url to runtime read requests', async () => {
    await fetchApplicationRuns('app-1');
    await fetchApplicationRunDetail('app-1', 'run-1');
    await fetchRuntimeDebugStream('app-1', 'run-1');

    expect(getConsoleApplicationRuns).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        page: 1,
        page_size: 20,
        sort_by: 'started_at',
        sort_order: 'desc'
      }),
      'http://127.0.0.1:7800'
    );
    expect(getConsoleApplicationRunDetail).toHaveBeenCalledWith(
      'app-1',
      'run-1',
      'http://127.0.0.1:7800'
    );
    expect(getConsoleRuntimeDebugStream).toHaveBeenCalledWith(
      'app-1',
      'run-1',
      'http://127.0.0.1:7800'
    );
  });

  test('maps runtime mutation payloads before calling the console client', async () => {
    await resumeFlowRun(
      'app-1',
      'run-1',
      'checkpoint-1',
      { approved: true },
      'csrf-123'
    );
    await completeCallbackTask(
      'app-1',
      'callback-1',
      { decision: 'approve' },
      'csrf-123'
    );

    expect(resumeConsoleFlowRun).toHaveBeenCalledWith(
      'app-1',
      'run-1',
      {
        checkpoint_id: 'checkpoint-1',
        input_payload: { approved: true }
      },
      'csrf-123',
      'http://127.0.0.1:7800'
    );
    expect(completeConsoleCallbackTask).toHaveBeenCalledWith(
      'app-1',
      'callback-1',
      {
        response_payload: { decision: 'approve' }
      },
      'csrf-123',
      'http://127.0.0.1:7800'
    );
  });
});
