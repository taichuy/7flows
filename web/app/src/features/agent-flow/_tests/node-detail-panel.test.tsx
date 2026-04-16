import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

import { NodeConfigTab } from '../components/detail/tabs/NodeConfigTab';
import { NodeDetailPanel } from '../components/detail/NodeDetailPanel';
import { AgentFlowEditorStoreProvider } from '../store/editor/provider';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-16T10:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    autosave_interval_seconds: 30,
    versions: []
  };
}

describe('NodeDetailPanel', () => {
  test('renders header, config tab and last-run tab for the selected node', () => {
    render(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeDetailPanel onClose={vi.fn()} onRunNode={undefined} />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.getByRole('tab', { name: '配置' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: '上次运行' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭节点详情' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'LLM' })).toBeInTheDocument();
  }, 10_000);

  test('shows node summary, read-only output contract and direct relations in config tab', () => {
    render(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.getByText('节点说明')).toBeInTheDocument();
    expect(screen.getByText('输出契约')).toBeInTheDocument();
    expect(screen.getByText('上游节点')).toBeInTheDocument();
    expect(screen.getByText('下游节点')).toBeInTheDocument();
    expect(screen.getByText('模型输出')).toBeInTheDocument();
  });
});
