import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import * as runtimeApi from '../../api/runtime';
import {
  buildAgentFlowDebugSessionStorageKey,
  useAgentFlowDebugSession
} from '../../hooks/runtime/useAgentFlowDebugSession';
import { resetAuthStore, useAuthStore } from '../../../../state/auth-store';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function createSucceededRunDetail() {
  return {
    flow_run: {
      id: 'flow-run-1',
      application_id: 'app-1',
      flow_id: 'flow-1',
      draft_id: 'draft-1',
      compiled_plan_id: 'plan-1',
      run_mode: 'debug_flow_run' as const,
      status: 'succeeded',
      target_node_id: null,
      input_payload: {
        'node-start': { query: '请总结退款政策' }
      },
      output_payload: {
        answer: '退款政策摘要'
      },
      error_payload: null,
      created_by: 'user-1',
      started_at: '2026-04-25T10:00:00Z',
      finished_at: '2026-04-25T10:00:02Z',
      created_at: '2026-04-25T10:00:00Z'
    },
    node_runs: [
      {
        id: 'node-run-start',
        flow_run_id: 'flow-run-1',
        node_id: 'node-start',
        node_type: 'start',
        node_alias: 'Start',
        status: 'succeeded',
        input_payload: {},
        output_payload: { query: '请总结退款政策' },
        error_payload: null,
        metrics_payload: {},
        started_at: '2026-04-25T10:00:00Z',
        finished_at: '2026-04-25T10:00:00Z'
      },
      {
        id: 'node-run-llm',
        flow_run_id: 'flow-run-1',
        node_id: 'node-llm',
        node_type: 'llm',
        node_alias: 'LLM',
        status: 'succeeded',
        input_payload: { user_prompt: '请总结退款政策' },
        output_payload: {
          text: '退款政策摘要',
          usage: { total_tokens: 128 },
          raw_response: { id: 'chatcmpl-1' }
        },
        error_payload: null,
        metrics_payload: { total_tokens: 128 },
        started_at: '2026-04-25T10:00:00Z',
        finished_at: '2026-04-25T10:00:01Z'
      },
      {
        id: 'node-run-answer',
        flow_run_id: 'flow-run-1',
        node_id: 'node-answer',
        node_type: 'answer',
        node_alias: 'Answer',
        status: 'succeeded',
        input_payload: { answer_template: '退款政策摘要' },
        output_payload: { answer: '退款政策摘要' },
        error_payload: null,
        metrics_payload: {},
        started_at: '2026-04-25T10:00:01Z',
        finished_at: '2026-04-25T10:00:02Z'
      }
    ],
    checkpoints: [],
    callback_tasks: [],
    events: [
      {
        id: 'event-1',
        flow_run_id: 'flow-run-1',
        node_run_id: null,
        sequence: 1,
        event_type: 'flow.started',
        payload: {},
        created_at: '2026-04-25T10:00:00Z'
      }
    ]
  };
}

function createWaitingHumanRunDetail() {
  return {
    flow_run: {
      id: 'flow-run-2',
      application_id: 'app-1',
      flow_id: 'flow-1',
      draft_id: 'draft-1',
      compiled_plan_id: 'plan-1',
      run_mode: 'debug_flow_run' as const,
      status: 'waiting_human',
      target_node_id: null,
      input_payload: {
        'node-start': { query: '请人工审核退款申请' }
      },
      output_payload: {},
      error_payload: null,
      created_by: 'user-1',
      started_at: '2026-04-25T11:00:00Z',
      finished_at: null,
      created_at: '2026-04-25T11:00:00Z'
    },
    node_runs: [
      {
        id: 'node-run-start',
        flow_run_id: 'flow-run-2',
        node_id: 'node-start',
        node_type: 'start',
        node_alias: 'Start',
        status: 'succeeded',
        input_payload: {},
        output_payload: { query: '请人工审核退款申请' },
        error_payload: null,
        metrics_payload: {},
        started_at: '2026-04-25T11:00:00Z',
        finished_at: '2026-04-25T11:00:00Z'
      },
      {
        id: 'node-run-human',
        flow_run_id: 'flow-run-2',
        node_id: 'node-human',
        node_type: 'human',
        node_alias: '人工审核',
        status: 'waiting_human',
        input_payload: {},
        output_payload: {},
        error_payload: null,
        metrics_payload: {},
        started_at: '2026-04-25T11:00:01Z',
        finished_at: null
      }
    ],
    checkpoints: [
      {
        id: 'checkpoint-1',
        flow_run_id: 'flow-run-2',
        node_run_id: 'node-run-human',
        status: 'waiting_human',
        reason: '等待人工审核',
        locator_payload: { node_id: 'node-human' },
        variable_snapshot: { ticket_id: 'ticket-1' },
        external_ref_payload: { prompt: '请确认是否批准退款' },
        created_at: '2026-04-25T11:00:01Z'
      }
    ],
    callback_tasks: [],
    events: []
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetAuthStore();
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
      nickname: 'Root',
      name: 'Root',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'root',
      permissions: ['application.view.all', 'application.edit.own']
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAgentFlowDebugSession', () => {
  test('initializes a new draft with an empty query input', () => {
    const queryClient = createQueryClient();
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const { result } = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.runContext.remembered).toBe(false);
    expect(result.current.runContext.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'query',
          value: ''
        })
      ])
    );
  });

  test('restores node preview variable cache from durable runtime snapshot', async () => {
    const queryClient = createQueryClient();
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const fetchSnapshotSpy = vi
      .spyOn(runtimeApi, 'fetchDebugVariableSnapshot')
      .mockResolvedValue({
        variable_cache: {
          'node-llm': {
            text: '沿用 durable 输出'
          }
        }
      });

    const { result } = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(result.current.getNodePreviewVariableCache()).toEqual(
        expect.objectContaining({
          'node-llm': expect.objectContaining({
            text: '沿用 durable 输出'
          })
        })
      );
    });
    expect(result.current.variableGroups[0]).toEqual(
      expect.objectContaining({
        title: 'LLM',
        items: expect.arrayContaining([
          expect.objectContaining({
            key: 'node-llm.text',
            value: '沿用 durable 输出'
          })
        ])
      })
    );
    expect(fetchSnapshotSpy).toHaveBeenCalledWith(
      'app-1',
      {
        debugSessionId: expect.stringMatching(/^app-1:draft-1:/)
      }
    );
  });

  test('reuses persisted debug session id when the editor remounts', async () => {
    const queryClient = createQueryClient();
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const fetchSnapshotSpy = vi
      .spyOn(runtimeApi, 'fetchDebugVariableSnapshot')
      .mockResolvedValue({ variable_cache: {} });

    const view = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(fetchSnapshotSpy).toHaveBeenCalledTimes(1);
    });
    const firstSessionId = view.result.current.debugSessionId;

    view.unmount();

    const utils = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => {
      expect(fetchSnapshotSpy).toHaveBeenCalledTimes(2);
    });

    expect(utils.result.current.debugSessionId).toBe(firstSessionId);
    expect(fetchSnapshotSpy).toHaveBeenLastCalledWith('app-1', {
      debugSessionId: firstSessionId
    });
  });

  test('ignores a delayed durable snapshot after resetting variable cache', async () => {
    const queryClient = createQueryClient();
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    let resolveSnapshot:
      | ((value: runtimeApi.DebugVariableSnapshot) => void)
      | null = null;
    vi.spyOn(runtimeApi, 'fetchDebugVariableSnapshot')
      .mockReturnValueOnce(
        new Promise<runtimeApi.DebugVariableSnapshot>((resolve) => {
          resolveSnapshot = resolve;
        })
      )
      .mockResolvedValue({ variable_cache: {} });

    const { result } = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    act(() => {
      result.current.resetVariableCache();
    });
    await act(async () => {
      resolveSnapshot?.({
        variable_cache: {
          'node-llm': {
            text: '迟到输出'
          }
        }
      });
    });

    expect(
      result.current.getNodePreviewVariableCache()['node-llm']
    ).toBeUndefined();
  });

  test('creates user and assistant messages after a debug run succeeds', async () => {
    const queryClient = createQueryClient();
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const startFlowDebugRunSpy = vi
      .spyOn(runtimeApi, 'startFlowDebugRun')
      .mockResolvedValue(createSucceededRunDetail());
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const { result } = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.submitPrompt('请总结退款政策');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('completed');
    });

    expect(startFlowDebugRunSpy).toHaveBeenCalledWith(
      'app-1',
      {
        document,
        debug_session_id: expect.stringMatching(/^app-1:draft-1:/),
        input_payload: {
          'node-start': {
            files: [],
            history: [],
            model: '',
            query: '请总结退款政策'
          }
        }
      },
      'csrf-123'
    );
    expect(result.current.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '请总结退款政策'
      }),
      expect.objectContaining({
        role: 'assistant',
        status: 'completed',
        runId: 'flow-run-1',
        content: '退款政策摘要'
      })
    ]);
    expect(result.current.traceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          nodeAlias: 'LLM',
          status: 'succeeded',
          durationMs: 1000
        })
      ])
    );
    expect(result.current.variableGroups.map((group) => group.title)).toEqual(
      expect.arrayContaining([
        'Input Variables',
        'Node Outputs',
        'System Variables',
        'Conversation / Session',
        'Environment'
      ])
    );
    const systemVariablesGroup = result.current.variableGroups.find(
      (group) => group.title === 'System Variables'
    );

    expect(systemVariablesGroup?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'sys.user_id',
          value: 'user-1'
        }),
        expect.objectContaining({
          key: 'sys.workflow_run_id',
          value: 'flow-run-1'
        })
      ])
    );
    const inputVariablesGroup = result.current.variableGroups.find(
      (group) => group.title === 'Input Variables'
    );
    const inputVariablesKeys = (inputVariablesGroup?.items ?? []).map(
      (item) => item.key
    );

    expect(inputVariablesKeys).toContain('node-start.query');
    expect(inputVariablesKeys).not.toContain('node-llm.user_prompt');
    expect(inputVariablesKeys).not.toContain('node-answer.answer_template');
    expect(result.current.getNodePreviewVariableCache()).toEqual(
      expect.objectContaining({
        'node-start': expect.objectContaining({
          query: '请总结退款政策'
        }),
        'node-llm': expect.objectContaining({
          text: '退款政策摘要',
          usage: { total_tokens: 128 }
        })
      })
    );
    expect(
      result.current.getNodePreviewVariableCache()['node-llm']
    ).not.toHaveProperty('raw_response');
    expect(
      result.current.getNodePreviewVariableCache()['node-llm']
    ).not.toHaveProperty('user_prompt');
    expect(
      result.current.getNodePreviewVariableCache()['node-answer']
    ).not.toHaveProperty('answer_template');
    expect(
      JSON.parse(
        window.localStorage.getItem(
          buildAgentFlowDebugSessionStorageKey('app-1', 'draft-1')
        ) ?? '{}'
      ).inputValues.query
    ).toBe('');
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['applications', 'app-1', 'runtime']
    });
  });

  test('maps waiting_human runs to pending assistant state without fake output', async () => {
    const queryClient = createQueryClient();
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    vi.spyOn(runtimeApi, 'startFlowDebugRun').mockResolvedValue(
      createWaitingHumanRunDetail()
    );

    const { result } = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.submitPrompt('请人工审核退款申请');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('waiting_human');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        status: 'waiting_human',
        runId: 'flow-run-2',
        content: ''
      })
    );
    expect(result.current.messages[1]?.rawOutput).toBeNull();
    expect(result.current.traceItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-human',
          nodeAlias: '人工审核',
          status: 'waiting_human'
        })
      ])
    );
  });

  test('reuses last run context from local draft storage', () => {
    const queryClient = createQueryClient();
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes = document.graph.nodes.map((node) =>
      node.id === 'node-start'
        ? {
            ...node,
            config: {
              input_fields: [
                {
                  key: 'language',
                  label: '语言',
                  inputType: 'text',
                  valueType: 'string',
                  required: false
                },
                {
                  key: 'enable_search',
                  label: '启用搜索',
                  inputType: 'checkbox',
                  valueType: 'boolean',
                  required: false
                }
              ]
            }
          }
        : node
    );

    window.localStorage.setItem(
      buildAgentFlowDebugSessionStorageKey('app-1', 'draft-1'),
      JSON.stringify({
        version: 1,
        inputValues: {
          query: '沿用上次输入',
          language: '中文',
          enable_search: false
        }
      })
    );

    const { result } = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    expect(result.current.runContext.remembered).toBe(true);
    expect(result.current.runContext.environmentLabel).toBe('draft');
    expect(result.current.runContext.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'query',
          value: '沿用上次输入'
        }),
        expect.objectContaining({
          key: 'language',
          value: '中文'
        }),
        expect.objectContaining({
          key: 'enable_search',
          value: false
        })
      ])
    );
  });
});
