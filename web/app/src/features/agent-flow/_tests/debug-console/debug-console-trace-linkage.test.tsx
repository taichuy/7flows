import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import * as runtimeApi from '../../api/runtime';
import { AgentFlowCanvasFrame } from '../../components/editor/AgentFlowCanvasFrame';
import { AgentFlowEditorStoreProvider } from '../../store/editor/AgentFlowEditorStoreProvider';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import { resetAuthStore, useAuthStore } from '../../../../state/auth-store';
import { renderReactFlowScene } from '../../../../test/renderers/render-react-flow-scene';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-25T10:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
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
        output_payload: { text: '退款政策摘要' },
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
    events: []
  };
}

function TraceLinkageProbe() {
  const selectedNodeId = useAgentFlowEditorStore((state) => state.selectedNodeId);
  const pendingLocateNodeId = useAgentFlowEditorStore(
    (state) => state.pendingLocateNodeId
  );
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);
  const [lastLocatedNodeId, setLastLocatedNodeId] = useState('none');

  useEffect(() => {
    if (!pendingLocateNodeId) {
      return;
    }

    setLastLocatedNodeId(pendingLocateNodeId);
  }, [pendingLocateNodeId]);

  return (
    <div>
      <div data-testid="trace-linkage-selected-node">
        {selectedNodeId ?? 'none'}
      </div>
      <div data-testid="trace-linkage-pending-locate">
        {pendingLocateNodeId ?? 'none'}
      </div>
      <div data-testid="trace-linkage-last-locate">
        {lastLocatedNodeId}
      </div>
      <button
        type="button"
        onClick={() =>
          setSelection({
            selectedNodeId: 'node-answer',
            selectedNodeIds: ['node-answer'],
            selectedEdgeId: null
          })
        }
      >
        选择 Answer
      </button>
    </div>
  );
}

function renderEditor(ui: ReactNode) {
  return renderReactFlowScene(ui as ReactElement);
}

async function openConsoleAndRun() {
  fireEvent.click(await screen.findByRole('button', { name: '调试整流' }));
  fireEvent.change(screen.getByPlaceholderText('输入调试消息...'), {
    target: { value: '请总结退款政策' }
  });
  fireEvent.click(screen.getByRole('button', { name: '发送调试消息' }));

  await waitFor(() => {
    expect(runtimeApi.startFlowDebugRun).toHaveBeenCalledWith(
      'app-1',
      { input_payload: { 'node-start': { query: '请总结退款政策' } } },
      'csrf-123'
    );
  });
  fireEvent.click(screen.getByRole('tab', { name: 'Trace' }));
}

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
  vi.spyOn(runtimeApi, 'fetchNodeLastRun').mockResolvedValue(null);
  vi.spyOn(runtimeApi, 'startFlowDebugRun').mockResolvedValue(
    createSucceededRunDetail()
  );
});

describe('debug console trace linkage', () => {
  test('locates canvas node when clicking a trace row', async () => {
    renderEditor(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <AgentFlowCanvasFrame
          applicationId="app-1"
          applicationName="Support Agent"
          nodeContributions={[]}
        />
        <TraceLinkageProbe />
      </AgentFlowEditorStoreProvider>
    );

    await openConsoleAndRun();
    const tracePanel = screen.getByRole('tabpanel', { name: 'Trace' });

    fireEvent.click(within(tracePanel).getByRole('button', { name: /清除筛选/ }));
    fireEvent.click(within(tracePanel).getByRole('button', { name: /Answer/ }));

    await waitFor(() => {
      expect(screen.getByTestId('trace-linkage-last-locate')).toHaveTextContent(
        'node-answer'
      );
    });
    await waitFor(() => {
      expect(
        screen.getByTestId('trace-linkage-pending-locate')
      ).toHaveTextContent('none');
    });
    expect(screen.getByTestId('trace-linkage-selected-node')).toHaveTextContent(
      'node-llm'
    );
  }, 20_000);

  test('filters trace rows when a node is selected on canvas', async () => {
    renderEditor(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <AgentFlowCanvasFrame
          applicationId="app-1"
          applicationName="Support Agent"
          nodeContributions={[]}
        />
        <TraceLinkageProbe />
      </AgentFlowEditorStoreProvider>
    );

    await openConsoleAndRun();

    const tracePanel = screen.getByRole('tabpanel', { name: 'Trace' });

    expect(screen.getByTestId('trace-linkage-selected-node')).toHaveTextContent('node-llm');
    expect(within(tracePanel).getByRole('button', { name: /LLM/ })).toBeInTheDocument();
    expect(within(tracePanel).queryByRole('button', { name: /Answer/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '选择 Answer' }));

    await waitFor(() => {
      expect(screen.getByTestId('trace-linkage-selected-node')).toHaveTextContent('node-answer');
    });
    expect(within(tracePanel).getByRole('button', { name: /Answer/ })).toBeInTheDocument();
    expect(within(tracePanel).queryByRole('button', { name: /LLM/ })).not.toBeInTheDocument();
  }, 20_000);
});
