import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { buildFlowDebugRunInput } from '../api/runtime';
import { createNodeDocument } from '../lib/document/node-factory';
import { listVisibleSelectorOptions } from '../lib/selector-options';
import { getStartInputFields } from '../lib/start-node-variables';

describe('start node variables', () => {
  test('does not expose if else branch decisions as downstream selector values', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const ifElseNode = createNodeDocument('if_else', 'node-if-else-1');

    document.graph.nodes.push({
      ...ifElseNode,
      outputs: [{ key: 'result', title: '条件结果', valueType: 'boolean' }]
    });
    document.graph.edges.push(
      {
        id: 'edge-start-if-else',
        source: 'node-start',
        target: 'node-if-else-1',
        sourceHandle: null,
        targetHandle: null,
        containerId: null,
        points: []
      },
      {
        id: 'edge-if-else-llm',
        source: 'node-if-else-1',
        target: 'node-llm',
        sourceHandle: null,
        targetHandle: null,
        containerId: null,
        points: []
      }
    );

    expect(ifElseNode.outputs).toEqual([]);
    expect(
      listVisibleSelectorOptions(document, 'node-llm').map(
        (option) => option.value
      )
    ).not.toContainEqual(['node-if-else-1', 'result']);
  });

  test('exposes custom input fields and readonly system variables to downstream selectors', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const startNode = document.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    if (!startNode) {
      throw new Error('expected start node');
    }

    startNode.config.input_fields = [
      {
        key: 'customer_name',
        label: '客户姓名',
        inputType: 'text',
        valueType: 'string',
        required: true
      },
      {
        key: 'attachments',
        label: '附件',
        inputType: 'file_list',
        valueType: 'array[object]',
        required: false
      }
    ];

    expect(
      listVisibleSelectorOptions(document, 'node-llm').map((option) => ({
        value: option.value,
        label: option.displayLabel
      }))
    ).toEqual(
      expect.arrayContaining([
        {
          value: ['node-start', 'customer_name'],
          label: 'Start/customer_name'
        },
        {
          value: ['node-start', 'attachments'],
          label: 'Start/attachments'
        },
        { value: ['node-start', 'query'], label: 'Start/query' },
        { value: ['node-start', 'model'], label: 'Start/model' },
        { value: ['node-start', 'history'], label: 'Start/history' },
        { value: ['node-start', 'files'], label: 'Start/files' }
      ])
    );
  });

  test('exposes system variables to any node without upstream edges', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    document.graph.edges = document.graph.edges.filter(
      (edge) => edge.target !== 'node-answer'
    );

    expect(
      listVisibleSelectorOptions(document, 'node-answer').map((option) => ({
        value: option.value,
        label: option.displayLabel
      }))
    ).toEqual(
      expect.arrayContaining([
        {
          value: ['sys', 'conversation_id'],
          label: 'sys.conversation_id'
        },
        {
          value: ['sys', 'workflow_run_id'],
          label: 'sys.workflow_run_id'
        }
      ])
    );
  });

  test('exposes application environment variables to any node', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    document.graph.edges = document.graph.edges.filter(
      (edge) => edge.target !== 'node-answer'
    );

    expect(
      listVisibleSelectorOptions(document, 'node-answer', [
        {
          name: 'ApiBaseUrl',
          value_type: 'string',
          value: 'https://api.example.com',
          description: '当前应用 API 地址'
        }
      ]).map((option) => ({
        value: option.value,
        label: option.displayLabel
      }))
    ).toEqual(
      expect.arrayContaining([
        {
          value: ['env', 'ApiBaseUrl'],
          label: 'env.ApiBaseUrl'
        }
      ])
    );
  });

  test('exposes only public LLM runtime output variables to downstream selectors', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected llm node');
    }

    llmNode.outputs = [
      { key: 'text', title: '模型输出', valueType: 'string' },
      { key: 'reasoning_content', title: '思考', valueType: 'string' },
      { key: 'usage', title: 'Token 使用', valueType: 'json' }
    ];

    const selectorLabels = listVisibleSelectorOptions(
      document,
      'node-answer'
    ).map((option) => option.displayLabel);

    const options = listVisibleSelectorOptions(document, 'node-answer');
    const textOutput = options.find(
      (option) => option.value[0] === 'node-llm' && option.outputKey === 'text'
    );

    expect(selectorLabels).toEqual(
      expect.arrayContaining([
        'Start/query',
        'Start/model',
        'Start/history',
        'Start/files',
        'LLM/text',
        'LLM/usage'
      ])
    );
    expect(textOutput?.outputLabel).toBe('text');
    expect(textOutput?.value).toEqual(['node-llm', 'text']);

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outputKey: 'text',
          outputLabel: 'text',
          value: ['node-llm', 'text'],
          displayLabel: 'LLM/text'
        }),
        expect.objectContaining({
          outputKey: 'usage',
          outputLabel: 'usage',
          value: ['node-llm', 'usage'],
          displayLabel: 'LLM/usage'
        })
      ])
    );

    expect(selectorLabels).not.toContain('模型输出');
    expect(selectorLabels).not.toContain('LLM/reasoning_content');
  });

  test('fails fast when a start node carries unexpected outputs', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const startNode = document.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    if (!startNode) {
      throw new Error('expected start node');
    }

    startNode.outputs = [
      { key: 'query', title: 'unexpected query', valueType: 'string' },
      { key: 'files', title: 'unexpected files', valueType: 'array' }
    ];

    expect(() => listVisibleSelectorOptions(document, 'node-llm')).toThrow(
      'Start node outputs must be empty'
    );
  });

  test('builds flow debug input from start input field value types', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const startNode = document.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    if (!startNode) {
      throw new Error('expected start node');
    }

    startNode.config.input_fields = [
      {
        key: 'customer_name',
        label: '客户姓名',
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
      },
      {
        key: 'files',
        label: '附件',
        inputType: 'file_list',
        valueType: 'array[object]',
        required: false
      }
    ];

    expect(buildFlowDebugRunInput(document)).toEqual({
      input_payload: {
        'node-start': {
          customer_name: 'Start customer_name 调试值',
          age: 1,
          files: [],
          model: '',
          history: [],
          query: ''
        }
      }
    });
  });

  test('uses start input field default values for flow debug input', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const startNode = document.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    if (!startNode) {
      throw new Error('expected start node');
    }

    startNode.config.input_fields = [
      {
        key: 'priority',
        label: '优先级',
        inputType: 'select',
        valueType: 'string',
        required: false,
        options: ['高', '低'],
        defaultValue: '低'
      },
      {
        key: 'confirmed',
        label: '已确认',
        inputType: 'checkbox',
        valueType: 'boolean',
        required: false,
        defaultValue: false
      }
    ];

    expect(buildFlowDebugRunInput(document)).toEqual({
      input_payload: {
        'node-start': {
          priority: '低',
          confirmed: false,
          model: '',
          history: [],
          files: [],
          query: ''
        }
      }
    });
  });

  test('normalizes rich start input field configuration', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const startNode = document.graph.nodes.find(
      (node) => node.id === 'node-start'
    );

    if (!startNode) {
      throw new Error('expected start node');
    }

    startNode.config.input_fields = [
      {
        key: 'priority',
        label: '优先级',
        inputType: 'select',
        valueType: 'string',
        required: false,
        placeholder: '请选择优先级',
        options: ['高', 1, '低', ''],
        defaultValue: '低',
        hidden: true
      },
      {
        key: 'summary',
        label: '摘要',
        inputType: 'paragraph',
        valueType: 'string',
        required: true,
        maxLength: 120,
        defaultValue: '默认摘要'
      }
    ];

    expect(getStartInputFields(startNode)).toEqual([
      expect.objectContaining({
        key: 'priority',
        label: '优先级',
        inputType: 'select',
        valueType: 'string',
        placeholder: '请选择优先级',
        options: ['高', '低'],
        defaultValue: '低',
        hidden: true
      }),
      expect.objectContaining({
        key: 'summary',
        label: '摘要',
        inputType: 'paragraph',
        valueType: 'string',
        required: true,
        maxLength: 120,
        defaultValue: '默认摘要'
      })
    ]);
  });
});
