import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const runtimeApi = vi.hoisted(() => ({
  nodeLastRunQueryKey: (applicationId: string, nodeId: string) =>
    ['applications', applicationId, 'runtime', 'nodes', nodeId, 'last-run'] as const,
  fetchNodeLastRun: vi.fn()
}));

vi.mock('../api/runtime', () => runtimeApi);

import { AppProviders } from '../../../app/AppProviders';
import { NodeLastRunTab } from '../components/detail/tabs/NodeLastRunTab';

describe('NodeLastRunTab', () => {
  beforeEach(() => {
    runtimeApi.fetchNodeLastRun.mockReset();
  });

  test('renders empty state when the selected node has not run yet', async () => {
    runtimeApi.fetchNodeLastRun.mockResolvedValueOnce(null);

    render(
      <AppProviders>
        <NodeLastRunTab applicationId="app-1" nodeId="node-llm" />
      </AppProviders>
    );

    expect(await screen.findByText('当前节点还没有运行记录')).toBeInTheDocument();
  });

  test('renders runtime-backed summary, io and metadata cards', async () => {
    runtimeApi.fetchNodeLastRun.mockResolvedValueOnce({
      flow_run: {
        id: 'run-1',
        application_id: 'app-1',
        flow_id: 'flow-1',
        draft_id: 'draft-1',
        compiled_plan_id: 'plan-1',
        run_mode: 'debug_node_preview',
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
      events: []
    });

    render(
      <AppProviders>
        <NodeLastRunTab applicationId="app-1" nodeId="node-llm" />
      </AppProviders>
    );

    expect(await screen.findByText('运行摘要')).toBeInTheDocument();
    expect(screen.getByText('debug_node_preview')).toBeInTheDocument();
    expect(screen.getByText('user_prompt')).toBeInTheDocument();
    expect(screen.getByText('总结退款政策')).toBeInTheDocument();
  });
});
