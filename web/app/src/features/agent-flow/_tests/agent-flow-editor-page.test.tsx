import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';
import { AgentFlowEditorShell } from '../components/editor/AgentFlowEditorShell';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-15T09:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    versions: [],
    autosave_interval_seconds: 30
  };
}

describe('AgentFlowEditorShell', () => {
  test('renders the default three nodes and overlay controls', async () => {
    render(
      <div style={{ width: 1280, height: 720 }}>
        <AgentFlowEditorShell
          applicationId="app-1"
          applicationName="Support Agent"
          initialState={createInitialState()}
        />
      </div>
    );

    expect(await screen.findByText('Start')).toBeInTheDocument();
    expect(screen.getAllByText('LLM').length).toBeGreaterThan(0);
    expect(screen.getByText('Answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '历史版本' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发布配置' })).toBeInTheDocument();
  });
});
