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
import { BUILTIN_NODE_PICKER_OPTIONS } from '../lib/plugin-node-definitions';

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

  test('registers the built-in Data Model node for picker and schema-driven config', () => {
    const schema = resolveAgentFlowNodeSchema('data_model' as never);
    const serializedConfigBlocks = JSON.stringify(
      schema.detail.tabs.config.blocks
    );

    expect(BUILTIN_NODE_PICKER_OPTIONS.map((option) => option.type)).toContain(
      'data_model'
    );
    expect(schema.nodeType).toBe('data_model');
    expect(serializedConfigBlocks).toContain('"path":"config.data_model_code"');
    expect(serializedConfigBlocks).toContain('"renderer":"data_model"');
    expect(serializedConfigBlocks).toContain('"path":"config.action"');
    expect(serializedConfigBlocks).toContain('"renderer":"static_select"');
    expect(serializedConfigBlocks).toContain('"value":"list"');
    expect(serializedConfigBlocks).toContain('"value":"get"');
    expect(serializedConfigBlocks).toContain('"value":"create"');
    expect(serializedConfigBlocks).toContain('"value":"update"');
    expect(serializedConfigBlocks).toContain('"value":"delete"');
  });

  test('keeps Data Model record and payload fields action-scoped in schema', () => {
    const schema = resolveAgentFlowNodeSchema('data_model' as never);
    const serializedConfigBlocks = JSON.stringify(
      schema.detail.tabs.config.blocks
    );
    const payloadField = findFieldBlock(
      schema.detail.tabs.config.blocks,
      'bindings.payload'
    );

    expect(serializedConfigBlocks).toContain('"path":"bindings.record_id"');
    expect(serializedConfigBlocks).toContain(
      '"values":["get","update","delete"]'
    );
    expect(serializedConfigBlocks).toContain('"path":"bindings.payload"');
    expect(serializedConfigBlocks).toContain('"values":["create","update"]');
    expect(payloadField).toEqual(
      expect.objectContaining({
        renderer: 'named_bindings'
      })
    );
  });

  test('creates Data Model nodes with list outputs by default', () => {
    const node = createNodeDocument('data_model' as never, 'node-data-model');

    expect(node.config).toMatchObject({
      data_model_code: '',
      action: 'list'
    });
    expect(node.outputs).toEqual([
      { key: 'records', title: '记录列表', valueType: 'array' },
      { key: 'total', title: '记录总数', valueType: 'number' }
    ]);
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

  test('updates Data Model output contract when the action changes', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const dataModelNode = createNodeDocument(
      'data_model' as never,
      'node-data-model'
    );
    const documentWithDataModel = {
      ...document,
      graph: {
        ...document.graph,
        nodes: [...document.graph.nodes, dataModelNode]
      }
    };
    const setWorkingDocument = vi.fn();
    const adapter = createAgentFlowNodeSchemaAdapter({
      document: documentWithDataModel,
      nodeId: 'node-data-model',
      setWorkingDocument,
      dispatch: vi.fn()
    });

    adapter.setValue('config.action', 'delete');

    const update = setWorkingDocument.mock.calls[0]?.[0] as
      | typeof documentWithDataModel
      | ((
          currentDocument: typeof documentWithDataModel
        ) => typeof documentWithDataModel);
    const nextDocument =
      typeof update === 'function' ? update(documentWithDataModel) : update;
    const nextNode = getNode(nextDocument, 'node-data-model');

    expect(nextNode.config.action).toBe('delete');
    expect(nextNode.outputs).toEqual([
      { key: 'deleted_id', title: '删除记录 ID', valueType: 'string' }
    ]);
  });
});
