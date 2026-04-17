import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';
import { AppProviders } from '../../../app/AppProviders';

const schemaRuntimeSpies = vi.hoisted(() => ({
  resolveAgentFlowNodeSchema: vi.fn(),
  createAgentFlowNodeSchemaAdapter: vi.fn()
}));

vi.mock('../schema/node-schema-registry', async () => {
  const actual = await vi.importActual<typeof import('../schema/node-schema-registry')>(
    '../schema/node-schema-registry'
  );

  return {
    ...actual,
    resolveAgentFlowNodeSchema: vi.fn((nodeType) => {
      schemaRuntimeSpies.resolveAgentFlowNodeSchema(nodeType);
      return actual.resolveAgentFlowNodeSchema(nodeType);
    })
  };
});

vi.mock('../schema/node-schema-adapter', async () => {
  const actual = await vi.importActual<typeof import('../schema/node-schema-adapter')>(
    '../schema/node-schema-adapter'
  );

  return {
    ...actual,
    createAgentFlowNodeSchemaAdapter: vi.fn((input) => {
      schemaRuntimeSpies.createAgentFlowNodeSchemaAdapter(input);
      return actual.createAgentFlowNodeSchemaAdapter(input);
    })
  };
});

import { NodeConfigTab } from '../components/detail/tabs/NodeConfigTab';
import { NodeDetailPanel } from '../components/detail/NodeDetailPanel';
import {
  AgentFlowEditorStoreProvider,
  useAgentFlowEditorStore
} from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';

const NODE_DETAIL_PANEL_TEST_TIMEOUT = 15_000;

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

function renderWithProviders(ui: ReactNode) {
  return render(<AppProviders>{ui}</AppProviders>);
}

describe('NodeDetailPanel', () => {
  test('builds node detail from the schema registry and node schema adapter', () => {
    schemaRuntimeSpies.resolveAgentFlowNodeSchema.mockClear();
    schemaRuntimeSpies.createAgentFlowNodeSchemaAdapter.mockClear();

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeDetailPanel onClose={vi.fn()} onRunNode={undefined} />
      </AgentFlowEditorStoreProvider>
    );

    expect(schemaRuntimeSpies.resolveAgentFlowNodeSchema).toHaveBeenCalledWith('llm');
    expect(schemaRuntimeSpies.createAgentFlowNodeSchemaAdapter).toHaveBeenCalledTimes(1);
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);

  test('renders header, config tab and last-run tab for the selected node', () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeDetailPanel onClose={vi.fn()} onRunNode={undefined} />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.getByRole('tab', { name: /设置|配置/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: '上次运行' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '关闭节点详情' })).toBeInTheDocument();
    expect(screen.getByLabelText('节点别名')).toHaveValue('LLM');
    expect(screen.getByTestId('node-detail-body')).toBeInTheDocument();
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);

  test('renders alias and description editors inside the header exactly once', () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeDetailPanel onClose={vi.fn()} onRunNode={undefined} />
      </AgentFlowEditorStoreProvider>
    );

    const header = screen.getByTestId('node-detail-header');

    expect(within(header).getByLabelText('节点别名')).toHaveValue('LLM');
    expect(within(header).getByLabelText('节点简介')).toHaveValue('');
    expect(screen.getAllByLabelText('节点别名')).toHaveLength(1);
    expect(screen.getAllByLabelText('节点简介')).toHaveLength(1);
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);

  test('keeps config tab focused on editable settings and relations without redundant summary cards', () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.queryByText('节点说明')).not.toBeInTheDocument();
    expect(screen.queryByText('帮助文档')).not.toBeInTheDocument();
    expect(screen.getByLabelText('模型')).toBeInTheDocument();
    expect(screen.queryByText('输出契约')).not.toBeInTheDocument();
    expect(screen.getAllByText('下一步')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '添加下一个节点' })).not.toBeInTheDocument();
    expect(screen.getByText('添加并行节点')).toBeInTheDocument();
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);

  test('does not duplicate identity or summary content inside config tab', () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.queryByText('节点说明')).not.toBeInTheDocument();
    expect(screen.queryByText('节点别名')).not.toBeInTheDocument();
    expect(screen.queryByText('节点简介')).not.toBeInTheDocument();
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);

  test('hides retry and exception policy controls for the start node', () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <SelectionSeed nodeId="node-start" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.queryByRole('switch', { name: '失败重试' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '异常处理' })).not.toBeInTheDocument();
    expect(screen.queryByText('策略')).not.toBeInTheDocument();
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);

  test('renders exception handling as a three-state strategy selector', async () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.getAllByTestId('node-policy-row')).toHaveLength(2);
    expect(screen.getByRole('switch', { name: '失败重试' })).toBeInTheDocument();
    expect(screen.getByTestId('node-policy-error')).toHaveTextContent('无');
    expect(screen.getByTestId('node-policy-error')).toHaveClass(
      'agent-flow-node-detail__policy-select-shell--compact'
    );

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '异常处理' }));

    expect(await screen.findByText('当发生异常且未处理时，节点将停止运行')).toBeInTheDocument();
    expect(screen.getByText('当发生异常时，指定默认输出内容。')).toBeInTheDocument();
    expect(screen.getByText('当发生异常时，将执行异常分支')).toBeInTheDocument();
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);

  test('writes the selected exception handling strategy back to the node document', async () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '异常处理' }));
    fireEvent.click(await screen.findByText('默认值'));

    await waitFor(() => {
      expect(screen.getByTestId('node-policy-error')).toHaveTextContent('默认值');
    });
    expect(latestDocument.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-llm',
          config: expect.objectContaining({
            error_policy: 'default_value'
          })
        })
      ])
    );
  }, NODE_DETAIL_PANEL_TEST_TIMEOUT);
});
