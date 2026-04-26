import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import * as runtimeApi from '../api/runtime';
import { buildAgentFlowDebugSessionStorageKey } from '../hooks/runtime/useAgentFlowDebugSession';
import { AgentFlowEditorShell } from '../components/editor/AgentFlowEditorShell';
import { renderReactFlowScene } from '../../../test/renderers/render-react-flow-scene';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-17T09:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
  };
}

function sampleNodeLastRun() {
  return {
    flow_run: {
      id: 'run-1',
      application_id: 'app-1',
      flow_id: 'flow-1',
      draft_id: 'draft-1',
      compiled_plan_id: 'plan-1',
      run_mode: 'debug_node_preview' as const,
      status: 'succeeded',
      target_node_id: 'node-llm',
      input_payload: {
        'node-start.query': '总结退款政策'
      },
      output_payload: {
        resolved_inputs: {
          user_prompt: '总结退款政策'
        }
      },
      error_payload: null,
      created_by: 'user-1',
      started_at: '2026-04-17T09:00:00Z',
      finished_at: '2026-04-17T09:00:01Z',
      created_at: '2026-04-17T09:00:00Z'
    },
    node_run: {
      id: 'node-run-1',
      flow_run_id: 'run-1',
      node_id: 'node-llm',
      node_type: 'llm',
      node_alias: 'LLM',
      status: 'succeeded',
      input_payload: {
        user_prompt: '总结退款政策'
      },
      output_payload: {
        rendered_templates: {}
      },
      error_payload: null,
      metrics_payload: {
        output_contract_count: 1
      },
      started_at: '2026-04-17T09:00:00Z',
      finished_at: '2026-04-17T09:00:01Z'
    },
    checkpoints: [],
    events: [
      {
        id: 'event-1',
        flow_run_id: 'run-1',
        node_run_id: 'node-run-1',
        sequence: 1,
        event_type: 'node_preview_started',
        payload: {
          target_node_id: 'node-llm'
        },
        created_at: '2026-04-17T09:00:00Z'
      },
      {
        id: 'event-2',
        flow_run_id: 'run-1',
        node_run_id: 'node-run-1',
        sequence: 2,
        event_type: 'node_preview_completed',
        payload: {
          target_node_id: 'node-llm'
        },
        created_at: '2026-04-17T09:00:01Z'
      }
    ]
  };
}

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
      nickname: 'Root',
      name: 'Root',
      avatar_url: null,
      introduction: '',
      effective_display_role: 'root',
      permissions: ['application.view.all', 'application.edit.own']
    }
  });
}

describe('node last run runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    resetAuthStore();
    authenticate();

    vi
      .spyOn(runtimeApi, 'fetchNodeLastRun')
      .mockResolvedValueOnce(null)
      .mockResolvedValue(sampleNodeLastRun());
    vi.spyOn(runtimeApi, 'startNodeDebugPreview').mockResolvedValue(sampleNodeLastRun());
  });

  test('runs node preview from cached variables and refreshes last-run cards', async () => {
    window.localStorage.setItem(
      buildAgentFlowDebugSessionStorageKey('app-1', 'draft-1'),
      JSON.stringify({
        version: 1,
        inputValues: { query: '总结退款政策' }
      })
    );

    renderReactFlowScene(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '运行当前节点' }));

    await waitFor(() => {
      expect(runtimeApi.startNodeDebugPreview).toHaveBeenCalledWith(
        'app-1',
        'node-llm',
        {
          input_payload: {
            'node-start': {
              query: '总结退款政策'
            }
          },
          document: expect.objectContaining({
            schemaVersion: '1flowbase.flow/v1'
          })
        },
        'csrf-123'
      );
    });
    fireEvent.click(screen.getByRole('tab', { name: '上次运行' }));

    expect(await screen.findByText('运行摘要')).toBeInTheDocument();
    expect(await screen.findByText('debug_node_preview')).toBeInTheDocument();
    expect(await screen.findByLabelText('输入 JSON')).toHaveTextContent('总结退款政策');
  }, 30_000);

  test('asks for referenced variables before running when cache is empty', async () => {
    renderReactFlowScene(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '运行当前节点' }));

    expect(await screen.findByText('输入节点引用变量')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/node-start\.query/), {
      target: { value: '总结退款政策' }
    });
    fireEvent.click(within(screen.getByRole('dialog', { name: '输入节点引用变量' })).getByRole('button', { name: /运\s*行/ }));

    await waitFor(() => {
      expect(runtimeApi.startNodeDebugPreview).toHaveBeenCalledWith(
        'app-1',
        'node-llm',
        {
          input_payload: {
            'node-start': {
              query: '总结退款政策'
            }
          },
          document: expect.objectContaining({
            schemaVersion: '1flowbase.flow/v1'
          })
        },
        'csrf-123'
      );
    });
  }, 30_000);
});
