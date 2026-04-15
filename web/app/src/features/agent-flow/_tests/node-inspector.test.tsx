import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

import { NodeInspector } from '../components/inspector/NodeInspector';

describe('NodeInspector', () => {
  test('renders unified Basics Inputs Outputs Policy Advanced sections for an LLM node', () => {
    render(
      <NodeInspector
        document={createDefaultAgentFlowDocument({ flowId: 'flow-1' })}
        selectedNodeId="node-llm"
        onDocumentChange={vi.fn()}
      />
    );

    expect(screen.getByText('Basics')).toBeInTheDocument();
    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('Outputs')).toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByLabelText('System Prompt')).toBeInTheDocument();
  });
});
