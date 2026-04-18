import { createDefaultAgentFlowDocument, type FlowNodeDocument } from '@1flowbase/flow-schema';
import { describe, expect, test, vi } from 'vitest';

import { agentFlowRendererRegistry } from '../schema/agent-flow-renderer-registry';
import { createAgentFlowNodeSchemaAdapter } from '../schema/node-schema-adapter';
import { resolveAgentFlowNodeSchema } from '../schema/node-schema-registry';

function getNode(document: ReturnType<typeof createDefaultAgentFlowDocument>, nodeId: string) {
  const node = document.graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Missing node ${nodeId}`);
  }

  return node;
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
      JSON.stringify(schema.detail.tabs.config.blocks).includes('"path":"alias"')
    ).toBe(false);
    expect(
      JSON.stringify(schema.detail.tabs.config.blocks).includes('"path":"description"')
    ).toBe(false);
  });

  test('exposes a real renderer registry for later schema-driven consumers', () => {
    expect(agentFlowRendererRegistry.fields.text).toBeTypeOf('function');
    expect(agentFlowRendererRegistry.fields.llm_model).toBeTypeOf('function');
    expect(agentFlowRendererRegistry.fields.output_contract_definition).toBeTypeOf(
      'function'
    );
    expect(agentFlowRendererRegistry.views.summary).toBeTypeOf('function');
    expect(agentFlowRendererRegistry.views.relations).toBeTypeOf('function');
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
    expect(adapter.getValue('config.model')).toBe('');

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
