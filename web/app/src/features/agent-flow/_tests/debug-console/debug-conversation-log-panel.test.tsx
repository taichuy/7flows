import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type {
  AgentFlowDebugMessage,
  AgentFlowRunContext
} from '../../api/runtime';
import { AgentFlowDebugConsole } from '../../components/debug-console/AgentFlowDebugConsole';

const runContext: AgentFlowRunContext = {
  environmentLabel: 'draft',
  remembered: false,
  fields: [
    {
      nodeId: 'node-start',
      nodeLabel: 'Start',
      key: 'query',
      title: '问题',
      valueType: 'string',
      value: '你好?'
    }
  ]
};

const assistantMessage: AgentFlowDebugMessage = {
  id: 'assistant-1',
  role: 'assistant',
  status: 'running',
  runId: 'run-1',
  content: '你好，我可以帮你。',
  rawOutput: {
    answer: '你好，我可以帮你。'
  },
  traceSummary: [
    {
      nodeId: 'node-start',
      nodeRunId: 'node-run-start',
      nodeAlias: 'Start',
      nodeType: 'start',
      status: 'succeeded',
      startedAt: '2026-04-25T10:00:00Z',
      finishedAt: '2026-04-25T10:00:00Z',
      durationMs: 79,
      inputPayload: {
        query: '你好?'
      },
      outputPayload: {
        query: '你好?'
      },
      errorPayload: null,
      metricsPayload: {},
      debugPayload: {}
    },
    {
      nodeId: 'node-llm',
      nodeRunId: 'node-run-llm',
      nodeAlias: 'LLM',
      nodeType: 'llm',
      status: 'succeeded',
      startedAt: '2026-04-25T10:00:01Z',
      finishedAt: '2026-04-25T10:00:05Z',
      durationMs: 4257,
      inputPayload: {
        prompt: '你好?'
      },
      outputPayload: {
        answer: '你好，我可以帮你。'
      },
      errorPayload: null,
      metricsPayload: {
        total_tokens: 154
      },
      debugPayload: {
        provider: 'openai'
      }
    }
  ]
};

function renderConsole() {
  return render(
    <AgentFlowDebugConsole
      messages={[
        {
          id: 'user-1',
          role: 'user',
          status: 'completed',
          runId: 'run-1',
          content: '你好?',
          rawOutput: null,
          traceSummary: []
        },
        assistantMessage
      ]}
      runContext={runContext}
      status="completed"
      stopping={false}
      onChangeRunContextValue={vi.fn()}
      onClearSession={vi.fn()}
      onClose={vi.fn()}
      onStopRun={vi.fn()}
      onSubmitPrompt={vi.fn()}
    />
  );
}

describe('debug conversation log panel', () => {
  test('opens from an assistant message and keeps detail limited to input, output and metadata', () => {
    renderConsole();

    expect(
      screen.queryByRole('complementary', { name: '对话日志' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '查看对话日志' }));

    const panel = screen.getByRole('complementary', { name: '对话日志' });
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByRole('tab', { name: '详情' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(within(panel).getByLabelText('输入 JSON')).toHaveTextContent(
      '你好?'
    );
    expect(within(panel).getByLabelText('输出 JSON')).toHaveTextContent(
      '你好，我可以帮你。'
    );
    expect(within(panel).getByText('元数据')).toBeInTheDocument();
    expect(within(panel).getByText('run-1')).toBeInTheDocument();
    expect(within(panel).queryByText('数据处理')).not.toBeInTheDocument();
    expect(within(panel).queryByText('provider')).not.toBeInTheDocument();
  });

  test('shows clickable trace nodes and reuses node run detail sections', () => {
    renderConsole();

    fireEvent.click(screen.getByRole('button', { name: '查看对话日志' }));
    const panel = screen.getByRole('complementary', { name: '对话日志' });
    fireEvent.click(within(panel).getByRole('tab', { name: '追踪' }));
    const llmTraceNode = within(panel).getByRole('button', { name: /LLM/ });

    expect(llmTraceNode).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(llmTraceNode);

    expect(llmTraceNode).toHaveAttribute('aria-expanded', 'true');

    const nodeDetail = within(panel).getByRole('region', {
      name: 'LLM 节点详情'
    });
    expect(nodeDetail).toBeInTheDocument();
    expect(within(nodeDetail).getByLabelText('输入 JSON')).toHaveTextContent(
      'prompt'
    );
    expect(
      within(nodeDetail).getByLabelText('数据处理 JSON')
    ).toHaveTextContent('provider');
    expect(within(nodeDetail).getByLabelText('输出 JSON')).toHaveTextContent(
      '你好，我可以帮你。'
    );
    expect(
      within(panel).getAllByTestId('debug-workflow-node-row')
    ).toHaveLength(2);
  });
});
