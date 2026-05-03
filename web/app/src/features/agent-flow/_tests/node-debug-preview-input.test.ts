import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import {
  buildNodeDebugPreviewPlan,
  extractNodePreviewVariableOutput
} from '../api/runtime';

describe('node debug preview input', () => {
  test('builds node preview input from cached referenced variables', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    expect(
      buildNodeDebugPreviewPlan(document, 'node-llm', {
        'node-start': {
          query: '请总结退款政策'
        }
      })
    ).toEqual({
      input_payload: {
        'node-start': {
          query: '请总结退款政策'
        }
      },
      missing_fields: []
    });
  });

  test('reports missing node preview variables instead of using placeholders', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    expect(buildNodeDebugPreviewPlan(document, 'node-llm')).toEqual({
      input_payload: {},
      missing_fields: [
        expect.objectContaining({
          nodeId: 'node-start',
          key: 'query',
          title: 'userinput.query',
          valueType: 'string'
        })
      ]
    });
  });

  test('extracts actual node output from node preview envelope for downstream previews', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmOutput = extractNodePreviewVariableOutput({
      flow_run: {} as never,
      node_run: {
        output_payload: {
          target_node_id: 'node-llm',
          node_output: {
            text: '退款政策摘要',
            finish_reason: 'stop'
          },
          resolved_inputs: {
            user_prompt: '请总结退款政策'
          }
        }
      } as never,
      checkpoints: [],
      events: []
    });

    expect(llmOutput).toEqual({
      text: '退款政策摘要',
      finish_reason: 'stop'
    });
    expect(
      buildNodeDebugPreviewPlan(document, 'node-answer', {
        'node-llm': llmOutput
      })
    ).toEqual({
      input_payload: {
        'node-llm': {
          text: '退款政策摘要'
        }
      },
      missing_fields: []
    });
  });

  test('extracts selector dependencies from active Data Model query binding', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      id: 'node-data-model',
      type: 'data_model',
      alias: 'Orders',
      description: '',
      containerId: null,
      position: { x: 720, y: 220 },
      configVersion: 1,
      config: { data_model_code: 'orders', action: 'list' },
      bindings: {
        query: {
          kind: 'data_model_query',
          value: {
            filters: [
              {
                field_code: 'status',
                operator: 'eq',
                value: { kind: 'selector', selector: ['node-start', 'query'] }
              }
            ],
            sorts: [],
            expand_relations: [],
            page: { kind: 'constant', value: 1 },
            page_size: { kind: 'constant', value: 20 }
          }
        },
        record_id: { kind: 'selector', value: ['node-answer', 'answer'] }
      },
      outputs: [
        { key: 'records', title: '记录列表', valueType: 'array' },
        { key: 'total', title: '记录总数', valueType: 'number' }
      ]
    });

    expect(buildNodeDebugPreviewPlan(document, 'node-data-model')).toEqual({
      input_payload: {},
      missing_fields: [
        expect.objectContaining({
          nodeId: 'node-start',
          key: 'query',
          valueType: 'string'
        })
      ]
    });
  });

  test('normalizes malformed Data Model query binding before preview extraction', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      id: 'node-data-model',
      type: 'data_model',
      alias: 'Orders',
      description: '',
      containerId: null,
      position: { x: 720, y: 220 },
      configVersion: 1,
      config: { data_model_code: 'orders', action: 'list' },
      bindings: {
        query: {
          kind: 'data_model_query',
          value: {
            filters: [
              {},
              {
                field_code: 'status',
                operator: 'eq',
                value: {
                  kind: 'selector',
                  selector: ['node-start', 'query', 1]
                }
              }
            ],
            sorts: 'bad',
            expand_relations: [1, 'customer'],
            page: { kind: 'selector', selector: ['node-start', 'query', null] }
          }
        } as never
      },
      outputs: [
        { key: 'records', title: '记录列表', valueType: 'array' },
        { key: 'total', title: '记录总数', valueType: 'number' }
      ]
    });

    expect(buildNodeDebugPreviewPlan(document, 'node-data-model')).toEqual({
      input_payload: {},
      missing_fields: [
        expect.objectContaining({
          nodeId: 'node-start',
          key: 'query'
        })
      ]
    });
  });

  test('ignores residual Data Model query binding when action is create', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      id: 'node-data-model',
      type: 'data_model',
      alias: 'Orders',
      description: '',
      containerId: null,
      position: { x: 720, y: 220 },
      configVersion: 1,
      config: { data_model_code: 'orders', action: 'create' },
      bindings: {
        query: {
          kind: 'data_model_query',
          value: {
            filters: [
              {
                field_code: 'status',
                operator: 'eq',
                value: { kind: 'selector', selector: ['node-answer', 'answer'] }
              }
            ],
            sorts: [],
            expand_relations: [],
            page: { kind: 'constant', value: 1 },
            page_size: { kind: 'constant', value: 20 }
          }
        },
        payload: {
          kind: 'named_bindings',
          value: [{ name: 'title', selector: ['node-start', 'query'] }]
        }
      },
      outputs: [{ key: 'record', title: '记录', valueType: 'json' }]
    });

    expect(buildNodeDebugPreviewPlan(document, 'node-data-model')).toEqual({
      input_payload: {},
      missing_fields: [
        expect.objectContaining({
          nodeId: 'node-start',
          key: 'query'
        })
      ]
    });
  });
});
