import {
  createDefaultAgentFlowDocument,
  type FlowNodeDocument
} from '@1flowbase/flow-schema';
import type {
  SchemaBlock,
  SchemaFieldBlock
} from '../../../shared/schema-ui/contracts/canvas-node-schema';
import { describe, expect, test, vi } from 'vitest';

import { agentFlowRendererRegistry } from '../schema/agent-flow-renderer-registry';
import { createAgentFlowNodeSchemaAdapter } from '../schema/node-schema-adapter';
import { resolveAgentFlowNodeSchema } from '../schema/node-schema-registry';
import { createNodeDocument } from '../lib/document/node-factory';
import {
  builtinNodeRuntimeContractTypes,
  getBuiltinNodeRuntimeContract
} from '../lib/node-definitions/contracts';
import {
  BUILTIN_NODE_PICKER_OPTIONS,
  type NodePickerOption
} from '../lib/plugin-node-definitions';

function getNode(
  document: ReturnType<typeof createDefaultAgentFlowDocument>,
  nodeId: string
) {
  const node = document.graph.nodes.find(
    (candidate) => candidate.id === nodeId
  );

  if (!node) {
    throw new Error(`Missing node ${nodeId}`);
  }

  return node;
}

function findFieldBlock(
  blocks: SchemaBlock[],
  path: string
): SchemaFieldBlock | null {
  for (const block of blocks) {
    if (block.kind === 'field' && block.path === path) {
      return block;
    }

    if ('blocks' in block) {
      const found = findFieldBlock(block.blocks, path);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

describe('agent-flow node schema registry', () => {
  test('keeps identity fields in the header and config fields in the config tab', () => {
    const schema = resolveAgentFlowNodeSchema('llm');

    expect(schema.nodeType).toBe('llm');
    expect(schema.detail.header.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'field', path: 'alias' }),
        expect.objectContaining({ kind: 'field', path: 'description' })
      ])
    );
    expect(schema.detail.tabs.config.blocks.length).toBeGreaterThan(0);
    expect(
      JSON.stringify(schema.detail.tabs.config.blocks).includes(
        '"path":"alias"'
      )
    ).toBe(false);
    expect(
      JSON.stringify(schema.detail.tabs.config.blocks).includes(
        '"path":"description"'
      )
    ).toBe(false);
  });

  test('exposes a real renderer registry for later schema-driven consumers', () => {
    expect(agentFlowRendererRegistry.fields.text).toBeTypeOf('function');
    expect(agentFlowRendererRegistry.fields.llm_model).toBeTypeOf('function');
    expect(agentFlowRendererRegistry.fields.llm_response_format).toBeTypeOf(
      'function'
    );
    expect(
      agentFlowRendererRegistry.fields.output_contract_definition
    ).toBeTypeOf('function');
    expect(agentFlowRendererRegistry.fields.start_input_fields).toBeTypeOf(
      'function'
    );
    expect(agentFlowRendererRegistry.fields.data_model_query).toBeTypeOf(
      'function'
    );
    expect(agentFlowRendererRegistry.dynamicForms.llm_parameters).toBeTypeOf(
      'function'
    );
    expect(agentFlowRendererRegistry.views.summary).toBeTypeOf('function');
    expect(agentFlowRendererRegistry.views.relations).toBeTypeOf('function');
  });

  test('renders start input fields before the relations section', () => {
    const schema = resolveAgentFlowNodeSchema('start');

    expect(schema.detail.tabs.config.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'section',
          title: '输入字段',
          blocks: [
            expect.objectContaining({
              kind: 'field',
              path: 'config.input_fields',
              renderer: 'start_input_fields'
            })
          ]
        }),
        expect.objectContaining({
          kind: 'view',
          renderer: 'relations',
          title: '下一步'
        })
      ])
    );
  });

  test('renders answer content with the templated text editor', () => {
    const schema = resolveAgentFlowNodeSchema('answer');

    expect(schema.detail.tabs.config.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'section',
          title: 'Inputs',
          blocks: [
            expect.objectContaining({
              kind: 'field',
              path: 'bindings.answer_template',
              renderer: 'templated_text'
            })
          ]
        })
      ])
    );
  });

  test('registers start and answer nodes for the built-in node picker', () => {
    expect(BUILTIN_NODE_PICKER_OPTIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'builtin',
          type: 'start',
          label: 'Start'
        }),
        expect.objectContaining({
          kind: 'builtin',
          type: 'answer',
          label: 'Answer'
        })
      ])
    );
  });

  test('renders generated output variables as a readonly shared config section', () => {
    const schema = resolveAgentFlowNodeSchema('llm');

    expect(schema.detail.tabs.config.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'view',
          renderer: 'output_contract',
          title: '输出变量',
          key: 'llm-generated-outputs'
        })
      ])
    );
  });

  test('keeps Code on the editable output contract instead of the generated output view', () => {
    const schema = resolveAgentFlowNodeSchema('code');
    const serializedConfigBlocks = JSON.stringify(
      schema.detail.tabs.config.blocks
    );

    expect(serializedConfigBlocks).toContain('"path":"config.output_contract"');
    expect(serializedConfigBlocks).toContain(
      '"renderer":"output_contract_definition"'
    );
    expect(serializedConfigBlocks).not.toContain(
      '"renderer":"output_contract"'
    );
  });

  test('keeps the start node on input fields instead of the shared output editor', () => {
    const schema = resolveAgentFlowNodeSchema('start');
    const serializedConfigBlocks = JSON.stringify(
      schema.detail.tabs.config.blocks
    );

    expect(serializedConfigBlocks).toContain('"path":"config.input_fields"');
    expect(serializedConfigBlocks).not.toContain(
      '"path":"config.output_contract"'
    );
  });

  test('registers built-in Data Model CRUD nodes for picker and schema-driven config', () => {
    const pickerTypes = BUILTIN_NODE_PICKER_OPTIONS.map((option) => option.type);

    expect(pickerTypes).toEqual(
      expect.arrayContaining([
        'data_model_list',
        'data_model_get',
        'data_model_create',
        'data_model_update',
        'data_model_delete'
      ])
    );
    expect(pickerTypes).not.toContain('data_model');

    for (const nodeType of [
      'data_model_list',
      'data_model_get',
      'data_model_create',
      'data_model_update',
      'data_model_delete'
    ] as const) {
      const schema = resolveAgentFlowNodeSchema(nodeType);
      const serializedConfigBlocks = JSON.stringify(
        schema.detail.tabs.config.blocks
      );

      expect(schema.nodeType).toBe(nodeType);
      expect(serializedConfigBlocks).toContain('"path":"config.data_model_code"');
      expect(serializedConfigBlocks).toContain('"renderer":"data_model"');
      expect(serializedConfigBlocks).not.toContain('"path":"config.action"');
    }
  });

  test('keeps Data Model CRUD node fields fixed by node type', () => {
    const listSchema = resolveAgentFlowNodeSchema('data_model_list');
    const getSchema = resolveAgentFlowNodeSchema('data_model_get');
    const createSchema = resolveAgentFlowNodeSchema('data_model_create');
    const updateSchema = resolveAgentFlowNodeSchema('data_model_update');
    const deleteSchema = resolveAgentFlowNodeSchema('data_model_delete');

    expect(findFieldBlock(listSchema.detail.tabs.config.blocks, 'bindings.query')).toEqual(
      expect.objectContaining({ renderer: 'data_model_query' })
    );
    expect(findFieldBlock(getSchema.detail.tabs.config.blocks, 'bindings.record_id')).toEqual(
      expect.objectContaining({ renderer: 'selector' })
    );
    expect(findFieldBlock(createSchema.detail.tabs.config.blocks, 'bindings.payload')).toEqual(
      expect.objectContaining({ renderer: 'named_bindings' })
    );
    expect(findFieldBlock(createSchema.detail.tabs.config.blocks, 'config.side_effect_policy')).toEqual(
      expect.objectContaining({ renderer: 'static_select' })
    );
    expect(findFieldBlock(updateSchema.detail.tabs.config.blocks, 'bindings.record_id')).toEqual(
      expect.objectContaining({ renderer: 'selector' })
    );
    expect(findFieldBlock(updateSchema.detail.tabs.config.blocks, 'bindings.payload')).toEqual(
      expect.objectContaining({ renderer: 'named_bindings' })
    );
    expect(findFieldBlock(updateSchema.detail.tabs.config.blocks, 'config.side_effect_policy')).toEqual(
      expect.objectContaining({ renderer: 'static_select' })
    );
    expect(findFieldBlock(deleteSchema.detail.tabs.config.blocks, 'bindings.record_id')).toEqual(
      expect.objectContaining({ renderer: 'selector' })
    );
    expect(findFieldBlock(deleteSchema.detail.tabs.config.blocks, 'config.side_effect_policy')).toEqual(
      expect.objectContaining({ renderer: 'static_select' })
    );
    expect(findFieldBlock(listSchema.detail.tabs.config.blocks, 'config.side_effect_policy')).toBeNull();
    expect(findFieldBlock(getSchema.detail.tabs.config.blocks, 'config.side_effect_policy')).toBeNull();
    expect(findFieldBlock(getSchema.detail.tabs.config.blocks, 'bindings.query')).toBeNull();
    expect(findFieldBlock(updateSchema.detail.tabs.config.blocks, 'bindings.query')).toBeNull();
    expect(findFieldBlock(deleteSchema.detail.tabs.config.blocks, 'bindings.query')).toBeNull();
  });

  test('exposes Data Model list query params without action-scoped visibility', () => {
    const schema = resolveAgentFlowNodeSchema('data_model_list');
    const queryField = findFieldBlock(
      schema.detail.tabs.config.blocks,
      'bindings.query'
    );

    expect(queryField).toEqual(
      expect.objectContaining({
        renderer: 'data_model_query'
      })
    );
    expect(queryField).not.toHaveProperty('visibleWhen');
  });

  test('creates Data Model CRUD nodes with fixed outputs', () => {
    const listNode = createNodeDocument('data_model_list', 'node-data-model-list');
    const getNode = createNodeDocument('data_model_get', 'node-data-model-get');
    const createNode = createNodeDocument('data_model_create', 'node-data-model-create');
    const updateNode = createNodeDocument('data_model_update', 'node-data-model-update');
    const deleteNode = createNodeDocument('data_model_delete', 'node-data-model-delete');

    expect(listNode.config).toEqual({ data_model_code: '' });
    expect(getNode.config).toEqual({ data_model_code: '' });
    expect(createNode.config).toEqual({
      data_model_code: '',
      side_effect_policy: 'disabled'
    });
    expect(updateNode.config).toEqual({
      data_model_code: '',
      side_effect_policy: 'disabled'
    });
    expect(deleteNode.config).toEqual({
      data_model_code: '',
      side_effect_policy: 'disabled'
    });
    expect(listNode.outputs).toEqual([
      { key: 'records', title: 'Records', valueType: 'array' },
      { key: 'total', title: 'Total', valueType: 'number' }
    ]);
    expect(getNode.outputs).toEqual([{ key: 'record', title: 'Record', valueType: 'json' }]);
    expect(createNode.outputs).toEqual([{ key: 'record', title: 'Record', valueType: 'json' }]);
    expect(updateNode.outputs).toEqual([{ key: 'record', title: 'Record', valueType: 'json' }]);
    expect(deleteNode.outputs).toEqual([
      { key: 'deleted_id', title: 'Deleted ID', valueType: 'string' },
      { key: 'affected_count', title: 'Affected Count', valueType: 'number' }
    ]);
  });

  test('registers builtin node runtime contracts for runtime defaults', () => {
    const expectedTypes = [
      'start',
      'llm',
      'answer',
      'template_transform',
      'knowledge_retrieval',
      'question_classifier',
      'if_else',
      'code',
      'http_request',
      'tool',
      'plugin_node',
      'human_input',
      'data_model_list',
      'data_model_get',
      'data_model_create',
      'data_model_update',
      'data_model_delete',
      'variable_assigner',
      'parameter_extractor',
      'iteration',
      'loop'
    ] as const;

    expect([...builtinNodeRuntimeContractTypes]).toEqual(
      expect.arrayContaining([...expectedTypes])
    );
    expect(
      builtinNodeRuntimeContractTypes.every((nodeType) =>
        expectedTypes.includes(nodeType)
      )
    ).toBe(true);

    for (const nodeType of expectedTypes) {
      expect(getBuiltinNodeRuntimeContract(nodeType)).not.toBeNull();
      expect(getBuiltinNodeRuntimeContract(nodeType)!.meta.type).toBe(nodeType);
      expect(getBuiltinNodeRuntimeContract(nodeType)!.defaults.configVersion).toBe(1);
      expect(getBuiltinNodeRuntimeContract(nodeType)!.defaults.alias).toBeTypeOf(
        'string'
      );
      expect(Array.isArray(getBuiltinNodeRuntimeContract(nodeType)!.defaults.outputs)).toBe(
        true
      );
    }
  });

  test('builds builtin picker options from runtime contract metadata and ports', () => {
    const llmContract = getBuiltinNodeRuntimeContract('llm');
    const llmOption = BUILTIN_NODE_PICKER_OPTIONS.find(
      (option) => option.type === 'llm'
    );

    expect(llmOption).toEqual(
      expect.objectContaining({
        label: llmContract?.meta.title,
        description: llmContract?.defaults.description,
        category: llmContract?.card.category,
        outputKeys: llmContract?.ports.outputs.map((output) => output.key)
      })
    );
  });

  test('Start defaults to no outputs and derive variables from input config', () => {
    const contract = getBuiltinNodeRuntimeContract('start');

    expect(contract).not.toBeNull();
    expect(contract?.defaults.outputs).toEqual([]);
    expect(contract?.defaults.config).toEqual({ input_fields: [] });
    expect(contract?.defaults.bindings).toEqual({});
  });

  test('returns isolated builtin contract defaults for mutable nested values', () => {
    const firstContract = getBuiltinNodeRuntimeContract('llm');

    if (!firstContract) {
      throw new Error('expected LLM contract');
    }

    firstContract.defaults.config.model_provider = {
      provider_code: 'mutated-provider',
      source_instance_id: 'mutated-instance',
      model_id: 'mutated-model'
    };
    firstContract.defaults.bindings.prompt_messages = {
      kind: 'prompt_messages',
      value: []
    };
    firstContract.defaults.outputs[0] = {
      key: 'mutated',
      title: 'Mutated',
      valueType: 'string'
    };

    const nextContract = getBuiltinNodeRuntimeContract('llm');

    expect(nextContract?.defaults.config.model_provider).toEqual({
      provider_code: '',
      source_instance_id: '',
      model_id: ''
    });
    expect(nextContract?.defaults.bindings.prompt_messages).toEqual({
      kind: 'prompt_messages',
      value: [
        {
          id: 'system-1',
          role: 'system',
          content: { kind: 'templated_text', value: '' }
        }
      ]
    });
    expect(nextContract?.defaults.outputs).toEqual([
      { key: 'text', title: '模型输出', valueType: 'string' },
      { key: 'usage', title: '用量', valueType: 'json' }
    ]);
  });

  test('Answer defaults to answer output only', () => {
    const contract = getBuiltinNodeRuntimeContract('answer');

    expect(contract).not.toBeNull();
    expect(contract?.defaults.outputs).toEqual([
      { key: 'answer', title: '对话输出', valueType: 'string' }
    ]);
  });

  test('Template Transform defaults to text output only', () => {
    const contract = getBuiltinNodeRuntimeContract('template_transform');

    expect(contract).not.toBeNull();
    expect(contract?.defaults.outputs).toEqual([
      { key: 'text', title: '转换结果', valueType: 'string' }
    ]);
  });

  test('Data Model Delete defaults to deleted_id and affected_count outputs', () => {
    const contract = getBuiltinNodeRuntimeContract('data_model_delete');

    expect(contract).not.toBeNull();
    expect(contract?.defaults.outputs).toEqual([
      { key: 'deleted_id', title: 'Deleted ID', valueType: 'string' },
      { key: 'affected_count', title: 'Affected Count', valueType: 'number' }
    ]);
  });

  test('creates contracted built-in node documents from runtime contract defaults', () => {
    const contract = getBuiltinNodeRuntimeContract('human_input');

    if (!contract) {
      throw new Error('expected Human Input contract');
    }

    const node = createNodeDocument('human_input', 'node-human-input', 120, 240);

    expect(node).toEqual(
      expect.objectContaining({
        id: 'node-human-input',
        type: 'human_input',
        alias: contract.defaults.alias,
        description: contract.defaults.description,
        position: { x: 120, y: 240 },
        configVersion: contract.defaults.configVersion,
        config: contract.defaults.config,
        bindings: contract.defaults.bindings,
        outputs: contract.defaults.outputs
      })
    );
  });

  test('creates every built-in node document from runtime contract defaults', () => {
    for (const nodeType of builtinNodeRuntimeContractTypes) {
      if (nodeType === 'plugin_node') {
        continue;
      }

      const contract = getBuiltinNodeRuntimeContract(nodeType);

      if (!contract) {
        throw new Error(`expected ${nodeType} contract`);
      }

      const node = createNodeDocument(nodeType, `node-${nodeType}`);

      expect(node).toEqual(
        expect.objectContaining({
          type: contract.meta.type,
          alias: contract.defaults.alias,
          description: contract.defaults.description,
          configVersion: contract.defaults.configVersion,
          config: contract.defaults.config,
          bindings: contract.defaults.bindings,
          outputs: contract.defaults.outputs
        })
      );
    }
  });

  test('rejects unavailable plugin contribution options in the node factory', () => {
    const disabledContributionOption = {
      kind: 'plugin_contribution',
      label: 'Disabled Exporter',
      disabled: true,
      disabledReason: '缺少依赖插件',
      contribution: {
        installation_id: 'installation-1',
        provider_code: 'sql_pack',
        plugin_id: 'sql_pack@0.1.0',
        plugin_version: '0.1.0',
        contribution_code: 'disabled_exporter',
        node_shell: 'action',
        plugin_unique_identifier: 'sql_pack',
        package_id: 'sql_pack@0.1.0',
        contribution_checksum: 'sha256:disabled-exporter',
        compiled_contribution_hash: 'sha256:compiled-disabled-exporter',
        category: 'export',
        title: 'Disabled Exporter',
        description: 'Disabled plugin node',
        dependency_status: 'missing_plugin',
        schema_version: '1flowbase.node-contribution/v2',
        output_schema_snapshot: {
          outputs: [{ key: 'result', title: 'Result', valueType: 'json' }]
        },
        experimental: false,
        icon: 'database',
        schema_ui: {},
        output_schema: {
          outputs: [{ key: 'result', title: 'Result', valueType: 'json' }]
        },
        side_effect_policy: 'external_read',
        infra_contracts: [],
        required_auth: [],
        visibility: 'public',
        dependency_installation_kind: 'model_provider',
        dependency_plugin_version_range: '^0.1.0'
      }
    } satisfies NodePickerOption;

    expect(() =>
      createNodeDocument(disabledContributionOption, 'node-disabled')
    ).toThrow('Plugin contribution is unavailable');
  });

  test('does not share nested contract defaults across created node documents', () => {
    const firstNode = createNodeDocument('llm', 'node-llm-a');

    firstNode.config.model_provider = {
      provider_code: 'mutated-provider',
      source_instance_id: 'mutated-instance',
      model_id: 'mutated-model'
    };
    firstNode.bindings.prompt_messages = {
      kind: 'prompt_messages',
      value: []
    };
    firstNode.outputs[0] = {
      key: 'mutated',
      title: 'Mutated',
      valueType: 'string'
    };

    const nextNode = createNodeDocument('llm', 'node-llm-b');
    const contract = getBuiltinNodeRuntimeContract('llm');

    expect(nextNode.config).toEqual(contract?.defaults.config);
    expect(nextNode.bindings).toEqual(contract?.defaults.bindings);
    expect(nextNode.outputs).toEqual(contract?.defaults.outputs);
  });

  test('reads relative node values and preserves output contract writes on the document', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const setWorkingDocument = vi.fn();
    const dispatch = vi.fn();
    const adapter = createAgentFlowNodeSchemaAdapter({
      document,
      nodeId: 'node-llm',
      setWorkingDocument,
      dispatch
    });

    expect(adapter.getValue('alias')).toBe('LLM');
    expect(adapter.getValue('config.model_provider')).toEqual({
      provider_code: '',
      source_instance_id: '',
      model_id: ''
    });

    const nextOutputs: FlowNodeDocument['outputs'] = [
      { key: 'answer', title: '最终回复', valueType: 'string' }
    ];

    adapter.setValue('config.output_contract', nextOutputs);

    expect(setWorkingDocument).toHaveBeenCalledTimes(1);

    const update = setWorkingDocument.mock.calls[0]?.[0] as
      | ReturnType<typeof createDefaultAgentFlowDocument>
      | ((
          currentDocument: ReturnType<typeof createDefaultAgentFlowDocument>
        ) => ReturnType<typeof createDefaultAgentFlowDocument>);
    const nextDocument =
      typeof update === 'function' ? update(document) : update;
    const nextNode = getNode(nextDocument, 'node-llm');

    expect(nextNode.outputs).toEqual(nextOutputs);
    expect(nextNode.config).not.toHaveProperty('output_contract');
    expect(nextNode.alias).toBe('LLM');
    expect(dispatch).not.toHaveBeenCalled();
  });

});
