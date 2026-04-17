import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Grid } from 'antd';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const orchestrationApi = vi.hoisted(() => ({
  orchestrationQueryKey: (applicationId: string) =>
    ['applications', applicationId, 'orchestration'] as const,
  fetchOrchestrationState: vi.fn()
}));

const runtimeApi = vi.hoisted(() => ({
  nodeLastRunQueryKey: (applicationId: string, nodeId: string) =>
    ['applications', applicationId, 'runtime', 'nodes', nodeId, 'last-run'] as const,
  fetchNodeLastRun: vi.fn(),
  startNodeDebugPreview: vi.fn(),
  buildNodeDebugPreviewInput: vi.fn()
}));

vi.mock('../api/orchestration', () => orchestrationApi);
vi.mock('../api/runtime', () => runtimeApi);

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';
import { AppProviders } from '../../../app/AppProviders';
import { resetAuthStore, useAuthStore } from '../../../state/auth-store';
import { AgentFlowEditorPage } from '../pages/AgentFlowEditorPage';

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
    resetAuthStore();
    authenticate();
    vi.spyOn(Grid, 'useBreakpoint').mockReturnValue({ lg: true } as never);

    orchestrationApi.fetchOrchestrationState.mockReset();
    runtimeApi.fetchNodeLastRun.mockReset();
    runtimeApi.startNodeDebugPreview.mockReset();
    runtimeApi.buildNodeDebugPreviewInput.mockReset();

    orchestrationApi.fetchOrchestrationState.mockResolvedValue(createInitialState());
    runtimeApi.fetchNodeLastRun.mockResolvedValueOnce(null).mockResolvedValue(
      sampleNodeLastRun()
    );
    runtimeApi.startNodeDebugPreview.mockResolvedValue(sampleNodeLastRun());
    runtimeApi.buildNodeDebugPreviewInput.mockReturnValue({
      input_payload: {
        'node-start': {
          query: '总结退款政策'
        }
      }
    });
  });

  test('runs node preview and refreshes last-run cards', async () => {
    render(
      <AppProviders>
        <AgentFlowEditorPage
          applicationId="app-1"
          applicationName="Support Agent"
        />
      </AppProviders>
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
          }
        },
        'csrf-123'
      );
    });
    fireEvent.click(screen.getByRole('tab', { name: '上次运行' }));

    expect(await screen.findByText('运行摘要')).toBeInTheDocument();
    expect(await screen.findByText('debug_node_preview')).toBeInTheDocument();
    expect(await screen.findByText('总结退款政策')).toBeInTheDocument();
  }, 30_000);
});
