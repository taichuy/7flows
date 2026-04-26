import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
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
      await screen.findByRole('dialog', { name: '新增输入字段' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: '从左侧调整新增输入字段宽度' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: '从右侧调整新增输入字段宽度' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: '向下调整新增输入字段高度' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('输入字段占位提示')).not.toBeInTheDocument();

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

  test('opens the start input field panel with an initial height and supports dragging down', async () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <SelectionSeed nodeId="node-start" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await screen.findAllByText('输入字段');
    fireEvent.click(screen.getByRole('button', { name: '新增输入字段' }));

    const dialog = await screen.findByRole('dialog', { name: '新增输入字段' });
    const bottomResizeHandle = screen.getByRole('separator', {
      name: '向下调整新增输入字段高度'
    });

    expect(dialog).toHaveStyle({ height: '520px' });

    fireEvent.mouseDown(bottomResizeHandle, {
      clientX: 420,
      clientY: 520
    });
    fireEvent.mouseMove(window, {
      clientX: 420,
      clientY: 600
    });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      expect(dialog).toHaveStyle({ height: '600px' });
    });
  });

  test('configures rich start input field options in the shared floating shell', async () => {
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

    await screen.findAllByText('输入字段');
    fireEvent.click(screen.getByRole('button', { name: '新增输入字段' }));

    expect(
      await screen.findByRole('dialog', { name: '新增输入字段' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: '从左侧调整新增输入字段宽度' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('separator', { name: '从右侧调整新增输入字段宽度' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('输入字段变量名'), {
      target: { value: 'priority' }
    });
    fireEvent.change(screen.getByLabelText('输入字段显示名'), {
      target: { value: '优先级' }
    });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '输入字段类型' }));
    fireEvent.click(await screen.findByTitle('下拉选项'));

    fireEvent.change(screen.getByLabelText('输入字段选项 1'), {
      target: { value: '高' }
    });
    fireEvent.click(screen.getByRole('button', { name: '新增下拉选项' }));
    fireEvent.change(screen.getByLabelText('输入字段选项 2'), {
      target: { value: '低' }
    });
    fireEvent.mouseDown(
      screen.getByRole('combobox', { name: '输入字段默认值' })
    );
    fireEvent.click(await screen.findByTitle('低'));
    fireEvent.click(screen.getByLabelText('隐藏输入字段'));
    fireEvent.click(screen.getByRole('button', { name: '保存输入字段' }));

    const startNode = latestDocument.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    expect(startNode?.config.input_fields).toEqual([
      expect.objectContaining({
        key: 'priority',
        label: '优先级',
        inputType: 'select',
        valueType: 'string',
        options: ['高', '低'],
        defaultValue: '低',
        hidden: true
      })
    ]);
  });

  test('drags and removes start input fields from single-line variable rows', async () => {
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

    expect(
      screen.queryByRole('button', { name: '下移输入字段 first_name' })
    ).not.toBeInTheDocument();

    const firstRow = await screen.findByTestId(
      'start-input-field-row-first_name'
    );
    const secondRow = screen.getByTestId('start-input-field-row-age');

    expect(
      within(firstRow).getByText('userinput.first_name')
    ).toBeInTheDocument();
    expect(within(firstRow).getByText('String')).toBeInTheDocument();
    expect(
      within(firstRow).getByRole('button', {
        name: '拖拽排序输入字段 first_name'
      })
    ).toBeInTheDocument();

    fireEvent.dragStart(
      within(firstRow).getByRole('button', {
        name: '拖拽排序输入字段 first_name'
      })
    );
    fireEvent.dragOver(secondRow);
    fireEvent.drop(secondRow);
    fireEvent.click(screen.getByRole('button', { name: '删除输入字段 age' }));

    const startNode = latestDocument.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    expect(startNode?.config.input_fields).toEqual([
      expect.objectContaining({ key: 'first_name' })
    ]);
  });
});
