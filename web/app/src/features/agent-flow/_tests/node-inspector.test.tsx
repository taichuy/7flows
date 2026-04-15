import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test, vi } from 'vitest';

import {
  createDefaultAgentFlowDocument,
  type FlowAuthoringDocument
} from '@1flowse/flow-schema';

import { NodeInspector } from '../components/inspector/NodeInspector';

describe('NodeInspector', () => {
  test('renders node alias and description in the inspector header while keeping config sections below', () => {
    render(
      <NodeInspector
        document={createDefaultAgentFlowDocument({ flowId: 'flow-1' })}
        selectedNodeId="node-llm"
        onDocumentChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Basics')).not.toBeInTheDocument();
    expect(screen.getByLabelText('节点别名')).toHaveValue('LLM');
    expect(screen.getByLabelText('节点简介')).toHaveValue('');
    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.getByText('Outputs')).toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByLabelText('System Prompt')).toBeInTheDocument();
  });

  test('edits alias and description from the inspector header', () => {
    const onDocumentChange = vi.fn();

    function Harness() {
      const [document, setDocument] = useState<FlowAuthoringDocument>(
        createDefaultAgentFlowDocument({ flowId: 'flow-1' })
      );

      return (
        <NodeInspector
          document={document}
          selectedNodeId="node-start"
          onDocumentChange={(nextDocument) => {
            setDocument(nextDocument);
            onDocumentChange(nextDocument);
          }}
        />
      );
    }

    render(<Harness />);

    fireEvent.change(screen.getByLabelText('节点别名'), {
      target: { value: '入口节点' }
    });
    fireEvent.change(screen.getByLabelText('节点简介'), {
      target: { value: '收集首轮用户输入并启动工作流。' }
    });

    expect(screen.getByLabelText('节点别名')).toHaveValue('入口节点');
    expect(screen.getByLabelText('节点简介')).toHaveValue(
      '收集首轮用户输入并启动工作流。'
    );
    expect(onDocumentChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        graph: expect.objectContaining({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: 'node-start',
              alias: '入口节点',
              description: '收集首轮用户输入并启动工作流。'
            })
          ])
        })
      })
    );
  });
});
