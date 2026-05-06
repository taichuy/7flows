import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createDefaultAgentFlowDocument,
  type BuiltinFlowNodeType
} from '@1flowbase/flow-schema';
import { AppProviders } from '../../../app/AppProviders';
import {
  modelProviderOptionsContract,
  modelProviderOptionsProviders
} from '../../../test/model-provider-contract-fixtures';

import { createNodeDocument } from '../lib/document/node-factory';
import * as dataModelOptionsApi from '../api/data-model-options';
import * as modelProviderOptionsApi from '../api/model-provider-options';
import { NodeDetailPanel } from '../components/detail/NodeDetailPanel';
import { NodeConfigTab } from '../components/detail/tabs/NodeConfigTab';
import { NodeInspector } from '../components/inspector/NodeInspector';
import * as nodeSchemaAdapterApi from '../schema/node-schema-adapter';
import * as nodeSchemaRegistry from '../schema/node-schema-registry';
import { AgentFlowEditorStoreProvider } from '../store/editor/AgentFlowEditorStoreProvider';
import { useAgentFlowEditorStore } from '../store/editor/provider';
import { selectWorkingDocument } from '../store/editor/selectors';

const primaryProviderOption = modelProviderOptionsProviders[0];
const primaryProviderFirstGroup = primaryProviderOption.model_groups[0];
const primaryProviderFirstModel = primaryProviderFirstGroup.models[0];
const fetchModelProviderOptionsSpy = vi.spyOn(
  modelProviderOptionsApi,
  'fetchModelProviderOptions'
);
const fetchDataModelOptionsSpy = vi.spyOn(
  dataModelOptionsApi,
  'fetchDataModelOptions'
);
const resolveAgentFlowNodeSchemaSpy = vi.spyOn(
  nodeSchemaRegistry,
  'resolveAgentFlowNodeSchema'
);
const createAgentFlowNodeSchemaAdapterSpy = vi.spyOn(
  nodeSchemaAdapterApi,
  'createAgentFlowNodeSchemaAdapter'
);

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

function createInitialStateWithLoopNode() {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes.push(createNodeDocument('loop', 'node-loop', 720, 240));

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

function createInitialStateWithDataModelNode(
  nodeType: BuiltinFlowNodeType = 'data_model_list'
) {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes.push(
    createNodeDocument(nodeType, 'node-data-model', 720, 240)
  );
  document.graph.edges.push({
    id: 'edge-start-data-model',
    source: 'node-start',
    target: 'node-data-model',
    sourceHandle: null,
    targetHandle: null,
    containerId: null,
    points: []
  });

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
      fieldKey: 'config.model_provider'
    });
  }, [focusIssueField]);

  return null;
}

function renderWithProviders(ui: ReactNode) {
  return render(<AppProviders>{ui}</AppProviders>);
}

function getLlmNodeConfig(
  document: ReturnType<typeof createDefaultAgentFlowDocument>
) {
  const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

  if (!llmNode) {
    throw new Error('expected default LLM node');
  }

  return llmNode.config;
}

function getDataModelNode(
  document: ReturnType<typeof createDefaultAgentFlowDocument>
) {
  const dataModelNode = document.graph.nodes.find(
    (node) => node.id === 'node-data-model'
  );

  if (!dataModelNode) {
    throw new Error('expected data model node');
  }

  return dataModelNode;
}

async function openSelect(label: string) {
  const combobox = await screen.findByRole('combobox', { name: label });

  fireEvent.mouseDown(combobox);
  fireEvent.keyDown(combobox, { key: 'ArrowDown' });

  return combobox;
}

async function selectOption(label: string) {
  const matches = await screen.findAllByTitle(label);
  const option = matches[matches.length - 1];

  fireEvent.click(option);
}

async function selectDataModelOption(value: string) {
  const option = await screen.findByTestId(`data-model-option-${value}`);

  fireEvent.click(option);
}

describe('NodeInspector', () => {
  beforeEach(() => {
    fetchModelProviderOptionsSpy.mockReset();
    fetchModelProviderOptionsSpy.mockResolvedValue({
      locale_meta: {
        requested_locale: 'zh-CN',
        resolved_locale: 'zh-CN',
        fallback_locale: 'en-US',
        supported_locales: ['zh-CN', 'en-US']
      },
      i18n_catalog: {},
      providers: []
    });
    fetchDataModelOptionsSpy.mockReset();
    fetchDataModelOptionsSpy.mockResolvedValue([
      {
        value: 'orders',
        label: 'Orders',
        state: 'enabled',
        disabled: false,
        disabledReason: null,
        modelId: 'model-orders',
        modelCode: 'orders',
        fields: [
          {
            code: 'name',
            title: 'Name',
            valueType: 'string',
            required: true,
            writable: true
          },
          {
            code: 'amount',
            title: 'Amount',
            valueType: 'number',
            required: false,
            writable: true
          },
          {
            code: 'status',
            title: 'Status',
            valueType: 'enum',
            required: false,
            writable: true
          },
          {
            code: 'customer',
            title: 'Customer',
            valueType: 'many_to_one',
            required: false,
            writable: true
          },
          {
            code: 'lines',
            title: 'Lines',
            valueType: 'one_to_many',
            required: false,
            writable: true
          },
          {
            code: 'approved',
            title: 'Approved',
            valueType: 'boolean',
            required: false,
            writable: true
          }
        ]
      },
      {
        value: 'empty_orders',
        label: 'Empty Orders',
        state: 'enabled',
        disabled: false,
        disabledReason: null,
        modelId: 'model-empty-orders',
        modelCode: 'empty_orders',
        fields: []
      },
      {
        value: 'draft_orders',
        label: 'Draft Orders',
        state: 'unpublished',
        disabled: true,
        disabledReason: 'Data Model is not published',
        modelId: 'model-draft-orders',
        modelCode: 'draft_orders',
        fields: []
      },
      {
        value: 'disabled_orders',
        label: 'Disabled Orders',
        state: 'disabled',
        disabled: true,
        disabledReason: 'Data Model is disabled',
        modelId: 'model-disabled-orders',
        modelCode: 'disabled_orders',
        fields: []
      },
      {
        value: 'broken_orders',
        label: 'Broken Orders',
        state: 'broken',
        disabled: true,
        disabledReason: 'Data Model is broken',
        modelId: 'model-broken-orders',
        modelCode: 'broken_orders',
        fields: []
      }
    ]);
    resolveAgentFlowNodeSchemaSpy.mockClear();
    createAgentFlowNodeSchemaAdapterSpy.mockClear();
  });

  test('reads config sections through the node schema registry and adapter bridge', async () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <SelectionSeed nodeId="node-llm" />
        <NodeInspector />
      </AgentFlowEditorStoreProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('USER 消息内容')).toHaveAttribute(
        'contenteditable',
        'true'
      );
    });
    expect(resolveAgentFlowNodeSchemaSpy).toHaveBeenCalledWith('llm');
    expect(createAgentFlowNodeSchemaAdapterSpy).toHaveBeenCalledTimes(1);
  });

  test('renders config sections as always-open blocks without repeating basics once summary content moves out', async () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <SelectionSeed nodeId="node-llm" />
        <NodeInspector />
      </AgentFlowEditorStoreProvider>
    );

    await waitFor(() => {
      expect(screen.getByLabelText('USER 消息内容')).toHaveAttribute(
        'contenteditable',
        'true'
      );
    });
    expect(
      screen.queryByRole('button', { name: 'Inputs' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Policy' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Advanced' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'USER 消息内容' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Basics')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('节点别名')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('节点简介')).not.toBeInTheDocument();
    expect(screen.queryByText('Inputs')).not.toBeInTheDocument();
    expect(screen.queryByText('Outputs')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.queryByText('LLM 参数')).not.toBeInTheDocument();
    expect(screen.queryByText('返回格式')).not.toBeInTheDocument();
    expect(screen.getByLabelText('失败重试')).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: '异常处理' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('SYSTEM 消息内容')).toBeInTheDocument();
    expect(screen.getByLabelText('USER 消息内容').tagName).toBe('DIV');
    expect(screen.getByLabelText('USER 消息内容')).toHaveAttribute(
      'contenteditable',
      'true'
    );
  }, 10000);

  test('updates node identity through header interactions instead of mutating document inline', () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <SelectionSeed nodeId="node-start" />
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeDetailPanel onClose={vi.fn()} onRunNode={undefined} />
      </AgentFlowEditorStoreProvider>
    );

    const header = screen.getByTestId('node-detail-header');

    fireEvent.change(within(header).getByLabelText('节点别名'), {
      target: { value: '入口节点' }
    });
    fireEvent.change(within(header).getByLabelText('节点简介'), {
      target: { value: '收集首轮用户输入并启动工作流。' }
    });

    expect(within(header).getByLabelText('节点别名')).toHaveValue('入口节点');
    expect(within(header).getByLabelText('节点简介')).toHaveValue(
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
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <FocusIssueSeed />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '模型' })).toHaveFocus();
    });
  });

  test('shows the effective context in the model summary trigger', async () => {
    const state = createInitialState();
    const llmNodeConfig = getLlmNodeConfig(state.draft.document);

    llmNodeConfig.model_provider = {
      provider_code: primaryProviderOption.provider_code,
      source_instance_id: primaryProviderFirstGroup.source_instance_id,
      model_id: primaryProviderFirstModel.model_id,
      provider_label: primaryProviderOption.display_name,
      model_label: primaryProviderFirstModel.display_name
    };
    fetchModelProviderOptionsSpy.mockResolvedValue(
      modelProviderOptionsContract
    );

    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={state}>
        <SelectionSeed nodeId="node-llm" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    const modelTrigger = await screen.findByRole('button', { name: '模型' });

    await waitFor(() => {
      expect(
        within(modelTrigger).getByLabelText('上下文 128K')
      ).toBeInTheDocument();
    });
  });

  test('shows LLM generated outputs without exposing output contract editing', async () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider initialState={createInitialState()}>
        <SelectionSeed nodeId="node-llm" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(await screen.findByText('输出变量')).toBeInTheDocument();
    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText('reasoning_content')).toBeInTheDocument();
    expect(screen.getByText('usage')).toBeInTheDocument();
    expect(screen.queryByText('节点产出的数据字段')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '新增输出变量' })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('输出变量名 1')).not.toBeInTheDocument();
  });

  test('keeps code output contract definition editable without rendering the shared output contract card', () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithCodeNode()}
      >
        <SelectionSeed nodeId="node-code" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.queryByText('输出契约')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '新增变量' })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('代码结果')).not.toBeInTheDocument();
  });

  test('renders loop number fields in compact inline rows while keeping condition groups stacked', () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithLoopNode()}
      >
        <SelectionSeed nodeId="node-loop" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.queryByText('Inputs')).not.toBeInTheDocument();
    expect(screen.getByText('Policy')).toBeInTheDocument();
    const toolbar = screen.getByTestId('condition-group-toolbar');

    expect(
      within(toolbar).getByRole('combobox', { name: '入口条件-operator' })
    ).toBeInTheDocument();
    expect(
      within(toolbar).getByRole('button', { name: '新增条件' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('inspector-field-config.max_rounds')).toHaveClass(
      'agent-flow-editor__inspector-field--inline'
    );
    expect(
      screen.getByTestId('inspector-field-bindings.entry_condition')
    ).not.toHaveClass('agent-flow-editor__inspector-field--inline');
  });

  test('loads Data Model options from the feature API and disables unavailable models', async () => {
    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode()}
      >
        <SelectionSeed nodeId="node-data-model" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openSelect('Data Model');

    expect(fetchDataModelOptionsSpy).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByTestId('data-model-option-orders')
    ).not.toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByTestId('data-model-option-draft_orders')
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByTestId('data-model-option-disabled_orders')
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByTestId('data-model-option-broken_orders')
    ).toHaveAttribute('aria-disabled', 'true');
  });

  test('updates selected Data Model metadata when the selected model changes', async () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode()}
      >
        <SelectionSeed nodeId="node-data-model" />
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openSelect('Data Model');
    await selectDataModelOption('orders');

    await waitFor(() => {
      expect(getDataModelNode(latestDocument).config).toMatchObject({
        data_model_code: 'orders',
        data_model_id: 'model-orders',
        data_model_label: 'Orders',
        data_model_fields: [
          { code: 'name', title: 'Name', valueType: 'string', required: true },
          {
            code: 'amount',
            title: 'Amount',
            valueType: 'number',
            required: false
          },
          {
            code: 'status',
            title: 'Status',
            valueType: 'enum',
            required: false
          },
          {
            code: 'customer',
            title: 'Customer',
            valueType: 'many_to_one',
            required: false
          },
          {
            code: 'lines',
            title: 'Lines',
            valueType: 'one_to_many',
            required: false
          },
          {
            code: 'approved',
            title: 'Approved',
            valueType: 'boolean',
            required: false
          }
        ]
      });
    });
  });

  test('edits Data Model list query binding', async () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode()}
      >
        <SelectionSeed nodeId="node-data-model" />
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(await screen.findByText('请先选择 Data Model')).toBeInTheDocument();

    await openSelect('Data Model');
    await selectDataModelOption('orders');
    fireEvent.click(await screen.findByRole('button', { name: '新增过滤条件' }));
    await openSelect('过滤字段 1');
    await selectOption('Status');
    await openSelect('过滤操作符 1');
    await selectOption('eq');
    await openSelect('过滤值来源 1');
    await selectOption('变量');
    await openSelect('过滤变量 1');
    await selectOption('Start');
    await selectOption('query');
    fireEvent.click(await screen.findByRole('button', { name: '新增过滤条件' }));
    await openSelect('过滤字段 2');
    await selectOption('Amount');
    await waitFor(() => {
      expect(getDataModelNode(latestDocument).bindings.query).toMatchObject({
        value: {
          filters: [
            expect.anything(),
            {
              field_code: 'amount',
              value: { kind: 'constant', value: 0 }
            }
          ]
        }
      });
    });
    fireEvent.change(screen.getByLabelText('过滤值 2'), {
      target: { value: '123' }
    });
    fireEvent.click(await screen.findByRole('button', { name: '新增过滤条件' }));
    await openSelect('过滤字段 3');
    await selectOption('Approved');
    await waitFor(() => {
      expect(getDataModelNode(latestDocument).bindings.query).toMatchObject({
        value: {
          filters: [
            expect.anything(),
            expect.anything(),
            {
              field_code: 'approved',
              value: { kind: 'constant', value: false }
            }
          ]
        }
      });
    });
    await openSelect('过滤值来源 3');
    await selectOption('变量');
    await openSelect('过滤值来源 3');
    await selectOption('常量');
    await waitFor(() => {
      expect(getDataModelNode(latestDocument).bindings.query).toMatchObject({
        value: {
          filters: [
            expect.anything(),
            expect.anything(),
            {
              field_code: 'approved',
              value: { kind: 'constant', value: false }
            }
          ]
        }
      });
    });
    await openSelect('过滤值 3');
    await selectOption('true');
    fireEvent.click(screen.getByRole('button', { name: '新增排序规则' }));
    await openSelect('排序字段 1');
    await selectOption('Amount');
    await openSelect('排序方向 1');
    await selectOption('desc');
    await openSelect('展开关联');
    await selectOption('Customer');
    fireEvent.change(screen.getByLabelText('页码'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('每页数量'), {
      target: { value: '50' }
    });

    await waitFor(() => {
      expect(getDataModelNode(latestDocument).bindings.query).toMatchObject({
        kind: 'data_model_query',
        value: {
          filters: [
            {
              field_code: 'status',
              operator: 'eq',
              value: {
                kind: 'selector',
                selector: ['node-start', 'query']
            }
          },
          {
            field_code: 'amount',
            operator: 'eq',
            value: { kind: 'constant', value: 123 }
          },
          {
            field_code: 'approved',
            operator: 'eq',
            value: { kind: 'constant', value: true }
          }
        ],
        sorts: [{ field_code: 'amount', direction: 'desc' }],
          expand_relations: ['customer'],
          page: { kind: 'constant', value: 2 },
          page_size: { kind: 'constant', value: 50 }
        }
      });
    });
  }, 30_000);

  test('keeps Data Model query pagination editable when selected model has no fields', async () => {
    let latestDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode()}
      >
        <SelectionSeed nodeId="node-data-model" />
        <DocumentObserver
          onChange={(document) => {
            latestDocument = document;
          }}
        />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(await screen.findByText('请先选择 Data Model')).toBeInTheDocument();

    await openSelect('Data Model');
    await selectDataModelOption('empty_orders');

    await waitFor(() => {
      expect(screen.queryByText('请先选择 Data Model')).not.toBeInTheDocument();
      expect(screen.getByLabelText('页码')).toBeInTheDocument();
      expect(screen.getByLabelText('每页数量')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: '新增过滤条件' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: '新增排序规则' })
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText('页码'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('每页数量'), {
      target: { value: '10' }
    });

    await waitFor(() => {
      expect(getDataModelNode(latestDocument).bindings.query).toMatchObject({
        kind: 'data_model_query',
        value: {
          filters: [],
          sorts: [],
          page: { kind: 'constant', value: 3 },
          page_size: { kind: 'constant', value: 10 }
        }
      });
    });
  }, 10000);

  test('renders Data Model create, update, and delete editors from fixed node types', async () => {
    const { unmount: unmountCreate } = renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode('data_model_create')}
      >
        <SelectionSeed nodeId="node-data-model" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(screen.queryByLabelText('Action')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('inspector-field-bindings.record_id')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('inspector-field-bindings.query')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('inspector-field-bindings.payload')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新增字段赋值' }));
    expect(
      screen.getAllByLabelText('Payload-0-field').length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText('Payload-0-variable').length
    ).toBeGreaterThan(0);
    unmountCreate();

    const { unmount: unmountUpdate } = renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode('data_model_update')}
      >
        <SelectionSeed nodeId="node-data-model" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(
      screen.queryByTestId('inspector-field-bindings.record_id')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('inspector-field-bindings.query')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('inspector-field-bindings.payload')
    ).toBeInTheDocument();
    unmountUpdate();

    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode('data_model_delete')}
      >
        <SelectionSeed nodeId="node-data-model" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    expect(
      screen.queryByTestId('inspector-field-bindings.record_id')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('inspector-field-bindings.query')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('inspector-field-bindings.payload')
    ).not.toBeInTheDocument();
  });

  test('keeps pagination unique to Data Model list query editors', async () => {
    const { unmount } = renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode('data_model_get')}
      >
        <SelectionSeed nodeId="node-data-model" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openSelect('Data Model');
    await selectDataModelOption('orders');

    await waitFor(() => {
      expect(screen.getByLabelText('Query')).toBeInTheDocument();
      expect(screen.queryByLabelText('页码')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('每页数量')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '新增过滤条件' })
      ).toBeEnabled();
    });

    unmount();

    renderWithProviders(
      <AgentFlowEditorStoreProvider
        initialState={createInitialStateWithDataModelNode('data_model_list')}
      >
        <SelectionSeed nodeId="node-data-model" />
        <NodeConfigTab />
      </AgentFlowEditorStoreProvider>
    );

    await openSelect('Data Model');
    await selectDataModelOption('orders');

    await waitFor(() => {
      expect(screen.getByLabelText('页码')).toBeInTheDocument();
      expect(screen.getByLabelText('每页数量')).toBeInTheDocument();
    });
  });
});
