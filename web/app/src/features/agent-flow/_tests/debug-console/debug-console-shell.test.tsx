import { fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import * as runtimeApi from '../../api/runtime';
import { AgentFlowEditorShell } from '../../components/editor/AgentFlowEditorShell';
import { resetAuthStore, useAuthStore } from '../../../../state/auth-store';
import { renderReactFlowScene } from '../../../../test/renderers/render-react-flow-scene';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-25T09:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
  };
}

function renderShell(ui: ReactElement) {
  return renderReactFlowScene(ui);
}

describe('debug console shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    vi.spyOn(runtimeApi, 'startFlowDebugRun').mockResolvedValue({
      flow_run: {
        id: 'flow-run-1',
        application_id: 'app-1',
        flow_id: 'flow-1',
        draft_id: 'draft-1',
        compiled_plan_id: 'plan-1',
        run_mode: 'debug_flow_run',
        status: 'running',
        target_node_id: null,
        input_payload: {},
        output_payload: {},
        error_payload: null,
        created_by: 'user-1',
        started_at: '2026-04-25T09:00:00Z',
        finished_at: null,
        created_at: '2026-04-25T09:00:00Z'
      },
      node_runs: [],
      checkpoints: [],
      callback_tasks: [],
      events: []
    });
    vi.spyOn(runtimeApi, 'buildFlowDebugRunInput').mockReturnValue({
      input_payload: {
        'node-start': { query: '请总结退款政策' }
      }
    });
    vi.spyOn(runtimeApi, 'fetchNodeLastRun').mockResolvedValue(null);
    vi.spyOn(runtimeApi, 'fetchApplicationRunDetail').mockResolvedValue({
      flow_run: {
        id: 'flow-run-1',
        application_id: 'app-1',
        flow_id: 'flow-1',
        draft_id: 'draft-1',
        compiled_plan_id: 'plan-1',
        run_mode: 'debug_flow_run',
        status: 'running',
        target_node_id: null,
        input_payload: {},
        output_payload: {},
        error_payload: null,
        created_by: 'user-1',
        started_at: '2026-04-25T09:00:00Z',
        finished_at: null,
        created_at: '2026-04-25T09:00:00Z'
      },
      node_runs: [],
      checkpoints: [],
      callback_tasks: [],
      events: []
    });
  });

  test('opens a docked debug console from overlay and keeps inspector separate', async () => {
    renderShell(
      <AgentFlowEditorShell
        applicationId="app-1"
        applicationName="Support Agent"
        initialState={createInitialState()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '调试整流' }));

    expect(runtimeApi.startFlowDebugRun).not.toHaveBeenCalled();
    expect(
      screen.getByRole('complementary', { name: '调试控制台' })
    ).toBeInTheDocument();
    expect(screen.getByText('Conversation')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '设置' })).toBeInTheDocument();
  }, 20_000);
});
