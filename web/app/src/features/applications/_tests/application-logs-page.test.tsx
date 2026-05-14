import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const runtimeApi = vi.hoisted(() => ({
  applicationRunsQueryKey: (applicationId: string) =>
    ['applications', applicationId, 'runtime', 'runs'] as const,
  applicationRunDetailQueryKey: (applicationId: string, runId: string) =>
    ['applications', applicationId, 'runtime', 'runs', runId] as const,
  fetchApplicationRuns: vi.fn(),
  fetchApplicationRunDetail: vi.fn(),
  resumeFlowRun: vi.fn(),
  completeCallbackTask: vi.fn()
}));

vi.mock('../api/runtime', () => runtimeApi);

import { AppProviders } from '../../../app/AppProviders';
import { ApplicationLogsPage } from '../pages/ApplicationLogsPage';

function sampleRunDetail() {
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
      input_payload: { 'node-start.query': '总结退款政策' },
      output_payload: {
        answer: '退款政策摘要',
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
    node_runs: [
      {
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
          answer: '退款政策摘要',
          rendered_templates: {}
        },
        error_payload: null,
        metrics_payload: {
          output_contract_count: 1
        },
        started_at: '2026-04-17T09:00:00Z',
        finished_at: '2026-04-17T09:00:01Z'
      }
    ],
    checkpoints: [],
    callback_tasks: [],
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

describe('ApplicationLogsPage', () => {
  let getBoundingClientRectSpy: { mockRestore: () => void } | undefined;
  let innerHeightSpy: { mockRestore: () => void } | undefined;

  beforeEach(() => {
    runtimeApi.fetchApplicationRuns.mockReset();
    runtimeApi.fetchApplicationRunDetail.mockReset();

    runtimeApi.fetchApplicationRuns.mockResolvedValue([
      {
        id: 'run-1',
        run_mode: 'debug_node_preview' as const,
        status: 'succeeded',
        target_node_id: 'node-llm',
        started_at: '2026-04-17T09:00:00Z',
        finished_at: '2026-04-17T09:00:01Z'
      }
    ]);
    runtimeApi.fetchApplicationRunDetail.mockResolvedValue(sampleRunDetail());
  });

  afterEach(() => {
    getBoundingClientRectSpy?.mockRestore();
    getBoundingClientRectSpy = undefined;
    innerHeightSpy?.mockRestore();
    innerHeightSpy = undefined;
  });

  test('expands selected run with Ant Splitter without reserving empty space', async () => {
    render(
      <AppProviders>
        <ApplicationLogsPage applicationId="app-1" />
      </AppProviders>
    );

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: '运行详情' })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('application-logs-splitter')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看运行详情' }));

    await waitFor(() => {
      expect(runtimeApi.fetchApplicationRunDetail).toHaveBeenCalledWith(
        'app-1',
        'run-1'
      );
    });
    const detailPane = await screen.findByRole('complementary', {
      name: '运行详情'
    });
    expect(detailPane).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: '运行详情' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: '返回日志' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('application-logs-splitter')).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(
      screen.queryByRole('separator', { name: '调整运行详情宽度' })
    ).not.toBeInTheDocument();

    const conversation = await screen.findByTestId('debug-conversation-messages');
    expect(within(conversation).getByText('User')).toBeInTheDocument();
    expect(within(conversation).getByText('总结退款政策')).toBeInTheDocument();
    expect(within(conversation).getByText('退款政策摘要')).toBeInTheDocument();
    expect(
      within(conversation).queryByPlaceholderText('和 Bot 聊天')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('运行摘要')).not.toBeInTheDocument();
    expect(screen.queryByText('运行输入输出')).not.toBeInTheDocument();
    expect(screen.queryByText('事件时间线')).not.toBeInTheDocument();

    const nodeButton = screen.getByRole('button', { name: /LLM.*llm/ });
    expect(nodeButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(nodeButton);

    expect(nodeButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('输入 JSON')).toHaveTextContent(
      'user_prompt'
    );
    expect(screen.getByLabelText('输出 JSON')).toHaveTextContent(
      '退款政策摘要'
    );

    const openLogButton = screen.getByRole('button', {
      name: '查看对话日志'
    });
    fireEvent.click(openLogButton);

    const logPanel = screen.getByRole('complementary', { name: '对话日志' });
    expect(logPanel).toBeInTheDocument();
    expect(detailPane).not.toContainElement(logPanel);
    expect(detailPane).toContainElement(conversation);
    expect(screen.getByTestId('application-logs-conversation-log-panel')).toBeInTheDocument();
    expect(within(logPanel).getByRole('tab', { name: '详情' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(within(logPanel).getByLabelText('输入 JSON')).toHaveTextContent(
      'user_prompt'
    );
    expect(within(logPanel).getByLabelText('输出 JSON')).toHaveTextContent(
      '退款政策摘要'
    );

    fireEvent.click(within(logPanel).getByRole('tab', { name: '追踪' }));
    const logTraceNode = within(logPanel).getByRole('button', { name: /LLM/ });
    fireEvent.click(logTraceNode);
    expect(logTraceNode).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(logPanel).getByRole('region', { name: 'LLM 节点详情' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭运行详情' }));

    expect(
      screen.queryByRole('complementary', { name: '运行详情' })
    ).not.toBeInTheDocument();
  }, 20_000);

  test('uses viewport remaining height for the docked detail layout', async () => {
    const cssSource = await readFile(
      path.resolve(
        process.cwd(),
        'src/features/applications/pages/application-logs-page.css'
      ),
      'utf8'
    );

    expect(cssSource).toContain('flex: 1 1 auto;');
    expect(cssSource).not.toContain('height: auto;');
    expect(cssSource).toContain(
      'height: var(--application-runs-table-body-height);'
    );
  });

  test('matches the docked detail height to viewport remaining height', async () => {
    innerHeightSpy = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(920);
    getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getBoundingClientRect(this: HTMLElement) {
        if (this.classList.contains('application-logs-page__splitter')) {
          return {
            bottom: 120,
            height: 0,
            left: 0,
            right: 0,
            top: 120,
            width: 1200,
            x: 0,
            y: 120,
            toJSON: () => ({})
          };
        }

        if (this.classList.contains('ant-table-thead')) {
          return {
            bottom: 176,
            height: 56,
            left: 0,
            right: 0,
            top: 120,
            width: 900,
            x: 0,
            y: 120,
            toJSON: () => ({})
          };
        }

        if (this.classList.contains('ant-table-wrapper')) {
          return {
            bottom: 760,
            height: 640,
            left: 0,
            right: 0,
            top: 120,
            width: 900,
            x: 0,
            y: 120,
            toJSON: () => ({})
          };
        }

        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({})
        };
      });

    render(
      <AppProviders>
        <ApplicationLogsPage applicationId="app-1" />
      </AppProviders>
    );

    expect(await screen.findByRole('table')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看运行详情' }));

    await waitFor(() => {
      expect(screen.getByTestId('application-logs-splitter')).toHaveStyle({
        height: '800px'
      });
      expect(document.querySelector('.ant-table-body')).toHaveStyle({
        maxHeight: '744px'
      });
    });
  });
});
