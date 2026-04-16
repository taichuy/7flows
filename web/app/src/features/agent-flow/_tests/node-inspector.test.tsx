import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

import { createNodeDocument } from '../lib/document/node-factory';
import { NodeConfigTab } from '../components/detail/tabs/NodeConfigTab';
import { NodeInspector } from '../components/inspector/NodeInspector';
import {
  AgentFlowEditorStoreProvider,
  useAgentFlowEditorStore
} from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';

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

function createInitialStateWithCodeNode() {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes.push(createNodeDocument('code', 'node-code', 720, 240));

  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-16T10:00:00Z',
      document
    },
    autosave_interval_seconds: 30,
    versions: []
  };
}

function SelectionSeed({ nodeId }: { nodeId: string }) {
  const setSelection = useAgentFlowEditorStore((state) => state.setSelection);

  useEffect(() => {
    setSelection({
      selectedNodeId: nodeId,
      selectedNodeIds: [nodeId]
    });
  }, [nodeId, setSelection]);

  return null;
}

function DocumentObserver({
  onChange
}: {
  onChange: (
    document: ReturnType<typeof createDefaultAgentFlowDocument>
  ) => void;
}) {
  const document = useAgentFlowEditorStore(selectWorkingDocument);

  useEffect(() => {
    onChange(document);
  }, [document, onChange]);

  return null;
}

function FocusIssueSeed() {
  const focusIssueField = useAgentFlowEditorStore(
    (state) => state.focusIssueField
  );

  useEffect(() => {
    focusIssueField({
      nodeId: 'node-llm',
      sectionKey: 'inputs',
      fieldKey: 'config.model'
    });
  }, [focusIssueField]);

  return null;
}

describe('NodeInspector', () => {
  test(
    'renders config sections without repeating basics once summary content moves out',
    () => {
    render(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeInspector />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.queryByText('Basics')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('节点别名')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('节点简介')).not.toBeInTheDocument();
    expect(screen.getByText('Inputs')).toBeInTheDocument();
    expect(screen.queryByText('Outputs')).not.toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByLabelText('System Prompt')).toBeInTheDocument();
    },
    10000
  );

  test('updates node fields through summary interactions instead of mutating document inline', () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    render(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <SelectionSeed nodeId="node-start" />
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

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
    expect(latestDocument.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-start',
          alias: '入口节点',
          description: '收集首轮用户输入并启动工作流。'
        })
      ])
    );
  });

  test('keeps issue-driven focus working after the inspector loses its header chrome', async () => {
    render(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <FocusIssueSeed />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('模型')).toHaveFocus();
    });
  });

  test('renders code output contract definition inside config fields while keeping output display read-only', () => {
    render(
      <AgentFlowEditorStoreProvider initialState={createInitialStateWithCodeNode()}>
        <SelectionSeed nodeId="node-code" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.getAllByText('输出契约').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '新增输出变量' })).toBeInTheDocument();
    expect(screen.queryByLabelText('代码结果')).not.toBeInTheDocument();
  });
});
