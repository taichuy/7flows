import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';
import { AppProviders } from '../../../app/AppProviders';

import { NodeConfigTab } from '../components/detail/tabs/NodeConfigTab';
import { AgentFlowEditorStoreProvider } from '../store/editor/AgentFlowEditorStoreProvider';
import { useAgentFlowEditorStore } from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';

function createInitialState() {
  return {
    flow_id: 'flow-1',
    draft: {
      id: 'draft-1',
      flow_id: 'flow-1',
      updated_at: '2026-04-26T10:00:00Z',
      document: createDefaultAgentFlowDocument({ flowId: 'flow-1' })
    },
    autosave_interval_seconds: 30,
    versions: []
  };
}

function renderWithProviders(ui: ReactNode) {
  return render(<AppProviders>{ui}</AppProviders>);
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

describe('start input fields', () => {
  test('edits start input fields and keeps system variables readonly', async () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    renderWithProviders(
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

    expect(await screen.findAllByText('输入字段')).toHaveLength(2);
    expect(screen.getByText('userinput.query')).toBeInTheDocument();
    expect(screen.getByText('userinput.files')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新增输入字段' }));

    expect(
      await screen.findByRole('dialog', { name: '输入字段设置' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('输入字段变量名'), {
      target: { value: 'customer_name' }
    });
    fireEvent.change(screen.getByLabelText('输入字段显示名'), {
      target: { value: '客户姓名' }
    });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '输入字段类型' }));
    fireEvent.click(await screen.findByTitle('文件列表'));
    fireEvent.click(screen.getByRole('button', { name: '保存输入字段' }));

    const startNode = latestDocument.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    expect(startNode?.config.input_fields).toEqual([
      expect.objectContaining({
        key: 'customer_name',
        label: '客户姓名',
        inputType: 'file_list',
        valueType: 'array'
      })
    ]);
  });

  test('reorders and removes start input fields from the inspector', async () => {
    const initialState = createInitialState();

    initialState.draft.document.graph.nodes =
      initialState.draft.document.graph.nodes.map((node) =>
        node.id === 'node-start'
          ? {
              ...node,
              config: {
                ...node.config,
                input_fields: [
                  {
                    key: 'first_name',
                    label: '名字',
                    inputType: 'text',
                    valueType: 'string',
                    required: true
                  },
                  {
                    key: 'age',
                    label: '年龄',
                    inputType: 'number',
                    valueType: 'number',
                    required: false
                  }
                ]
              }
            }
          : node
      );
    let latestDocument = initialState.draft.document;

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={initialState}>
        <SelectionSeed nodeId="node-start" />
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    fireEvent.click(
      await screen.findByRole('button', { name: '下移输入字段 first_name' })
    );
    fireEvent.click(screen.getByRole('button', { name: '删除输入字段 age' }));

    const startNode = latestDocument.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    expect(startNode?.config.input_fields).toEqual([
      expect.objectContaining({ key: 'first_name' })
    ]);
  });
});
