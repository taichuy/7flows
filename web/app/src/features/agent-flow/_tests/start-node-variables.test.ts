import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { buildFlowDebugRunInput } from '../api/runtime';
import { listVisibleSelectorOptions } from '../lib/selector-options';
import { getStartInputFields } from '../lib/start-node-variables';

describe('start node variables', () => {
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
        valueType: 'array',
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
          label: 'Start / userinput.customer_name'
        },
        {
          value: ['node-start', 'attachments'],
          label: 'Start / userinput.attachments'
        },
        { value: ['node-start', 'query'], label: 'Start / userinput.query' },
        { value: ['node-start', 'files'], label: 'Start / userinput.files' }
      ])
    );
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
        valueType: 'array',
        required: false
      }
    ];

    expect(buildFlowDebugRunInput(document)).toEqual({
      input_payload: {
        'node-start': {
          customer_name: 'Start customer_name 调试值',
          age: 1,
          files: [],
          query: '总结退款政策'
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
          query: '总结退款政策'
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
