import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { AppProviders } from '../../../app/AppProviders';
import * as runtimeApi from '../api/runtime';
import { NodeLastRunTab } from '../components/detail/tabs/NodeLastRunTab';

describe('NodeLastRunTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders empty state when the selected node has not run yet', async () => {
    vi.spyOn(runtimeApi, 'fetchNodeLastRun').mockResolvedValue(null);

    render(
      <AppProviders>
        <NodeLastRunTab applicationId="app-1" nodeId="node-llm" />
      </AppProviders>
    );

    expect(await screen.findByText('当前节点还没有运行记录')).toBeInTheDocument();
  });

  test('renders runtime-backed summary, io and metadata cards', async () => {
    vi.spyOn(runtimeApi, 'fetchNodeLastRun').mockResolvedValue({
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
          output_contract_count: 1,
          provider_instance_id: 'provider-openai-prod',
          provider_code: 'openai_compatible',
          protocol: 'openai_responses',
          finish_reason: 'stop'
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
    expect(screen.getByLabelText('输入 JSON')).toHaveTextContent('user_prompt');
    expect(screen.getByLabelText('输入 JSON')).toHaveTextContent('总结退款政策');
    expect(screen.getByText('provider-openai-prod')).toBeInTheDocument();
    expect(screen.getByText('openai_compatible')).toBeInTheDocument();
    expect(screen.getByText('stop')).toBeInTheDocument();
  });

  test('renders warning state when runtime payload is malformed', async () => {
    vi
      .spyOn(runtimeApi, 'fetchNodeLastRun')
      .mockResolvedValue({ node_run: null } as never);

    render(
      <AppProviders>
        <NodeLastRunTab applicationId="app-1" nodeId="node-llm" />
      </AppProviders>
    );

    expect(await screen.findByText('上次运行数据异常')).toBeInTheDocument();
  });
});
