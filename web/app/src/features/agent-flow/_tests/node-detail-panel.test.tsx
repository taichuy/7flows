import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

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
  });
});
