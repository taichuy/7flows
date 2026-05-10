import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { modelProviderOptionsContract } from '../../../test/model-provider-contract-fixtures';
import { createNodeDocument } from '../lib/document/node-factory';
import { listLlmProviderOptions } from '../lib/model-options';
import { validateDocument } from '../lib/validate-document';

const primaryProvider = modelProviderOptionsContract.providers[0];
const primaryGroup = primaryProvider.model_groups[0];
const primaryModel = primaryGroup.models[0];
const secondaryGroup = primaryProvider.model_groups[1];

function createCodeDocumentWithOutputs(
  outputs: Array<{
    key: string;
    title: string;
    valueType: 'string' | 'number' | 'boolean' | 'array' | 'json' | 'unknown';
  }>
) {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes = document.graph.nodes.map((node) =>
    node.id === 'node-llm'
      ? {
          ...createNodeDocument(
            'code',
            'node-code',
            node.position.x,
            node.position.y
          ),
          outputs
        }
      : node
  );
  document.graph.edges = document.graph.edges.map((edge) =>
    edge.source === 'node-llm'
      ? { ...edge, source: 'node-code' }
      : edge.target === 'node-llm'
        ? { ...edge, target: 'node-code' }
        : edge
  );

  return document;
}

describe('validateDocument', () => {
  test.each(['__trace'])('flags internal output selector key %s', (key) => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const answerNode = document.graph.nodes.find(
      (node) => node.id === 'node-answer'
    );

    if (!answerNode) {
      throw new Error('expected default Answer node');
    }

    answerNode.outputs = [{ key, title: key, valueType: 'json' }];

    const issues = validateDocument(document);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-answer',
          fieldKey: 'config.output_contract',
          title: '输出变量名保留'
        })
      ])
    );
  });

  test('flags unknown v1-only LLM outputs in text mode', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.outputs = [
      { key: 'text', title: '模型输出', valueType: 'string' },
      { key: 'reasoning_content', title: '推理内容', valueType: 'string' }
    ];

    const issues = validateDocument(document);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.output_contract',
          title: '输出变量名未知'
        })
      ])
    );
  });

  test('accepts runtime fields when the node contract declares them as output selectors', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.outputs = [
      { key: 'text', title: '模型输出', valueType: 'string' },
      { key: 'usage', title: '用量', valueType: 'json' }
    ];

    const issues = validateDocument(document);

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-llm' &&
          issue.fieldKey === 'config.output_contract' &&
          issue.title === '输出变量名未知'
      )
    ).toBe(false);
    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-llm' &&
          issue.fieldKey === 'config.output_contract' &&
          issue.title === '输出变量名保留'
      )
    ).toBe(false);
  });

  test('accepts structured LLM output only when response format enables JSON', () => {
    const textDocument = createDefaultAgentFlowDocument({
      flowId: 'flow-text'
    });
    const textLlmNode = textDocument.graph.nodes.find(
      (node) => node.id === 'node-llm'
    );

    if (!textLlmNode) {
      throw new Error('expected default LLM node');
    }

    textLlmNode.outputs = [
      { key: 'text', title: '模型输出', valueType: 'string' },
      { key: 'structured_output', title: '结构化输出', valueType: 'json' }
    ];

    const textIssues = validateDocument(textDocument);

    expect(textIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.output_contract',
          title: '输出变量名未知'
        })
      ])
    );

    const jsonDocument = createDefaultAgentFlowDocument({
      flowId: 'flow-json'
    });
    const jsonLlmNode = jsonDocument.graph.nodes.find(
      (node) => node.id === 'node-llm'
    );

    if (!jsonLlmNode) {
      throw new Error('expected default LLM node');
    }

    jsonLlmNode.config.response_format = { mode: 'json_object' };
    jsonLlmNode.outputs = [
      { key: 'text', title: '模型输出', valueType: 'string' },
      { key: 'structured_output', title: '结构化输出', valueType: 'json' }
    ];

    const jsonIssues = validateDocument(jsonDocument);

    expect(
      jsonIssues.some(
        (issue) =>
          issue.nodeId === 'node-llm' &&
          issue.fieldKey === 'config.output_contract' &&
          issue.title === '输出变量名未知'
      )
    ).toBe(false);
  });

  test('flags unknown outputs on contracted non-LLM nodes', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const answerNode = document.graph.nodes.find(
      (node) => node.id === 'node-answer'
    );

    if (!answerNode) {
      throw new Error('expected default Answer node');
    }

    answerNode.outputs = [
      { key: 'answer', title: '对话输出', valueType: 'string' },
      { key: 'extra', title: 'Extra', valueType: 'string' }
    ];

    const issues = validateDocument(document);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-answer',
          fieldKey: 'config.output_contract',
          title: '输出变量名未知'
        })
      ])
    );
  });

  test('validates plugin_node outputs against output_schema_snapshot', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('plugin_node', 'node-plugin'),
      plugin_id: 'plugin-1',
      plugin_version: '1.0.0',
      contribution_code: 'custom_plugin_node',
      node_shell: 'generic',
      schema_version: '1flowbase.node-contribution/v2',
      plugin_unique_identifier: 'plugin-1:custom_plugin_node:v2',
      package_id: 'plugin-1',
      contribution_checksum: 'checksum',
      compiled_contribution_hash: 'compiled-hash',
      output_schema_snapshot: {
        outputs: [
          { key: 'custom_payload', title: 'Custom Payload', valueType: 'json' }
        ]
      },
      outputs: [
        { key: 'custom_payload', title: 'Custom Payload', valueType: 'json' }
      ]
    });

    const issues = validateDocument(document);

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-plugin' &&
          issue.fieldKey === 'config.output_contract' &&
          issue.title === '输出变量名未知'
      )
    ).toBe(false);
  });

  test('flags plugin_node output drift from snapshot', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('plugin_node', 'node-plugin'),
      plugin_id: 'plugin-1',
      plugin_version: '1.0.0',
      contribution_code: 'custom_plugin_node',
      node_shell: 'generic',
      schema_version: '1flowbase.node-contribution/v2',
      plugin_unique_identifier: 'plugin-1:custom_plugin_node:v2',
      package_id: 'plugin-1',
      contribution_checksum: 'checksum',
      compiled_contribution_hash: 'compiled-hash',
      output_schema_snapshot: {
        outputs: [
          { key: 'custom_payload', title: 'Custom Payload', valueType: 'json' }
        ]
      },
      outputs: [
        { key: 'custom_payload', title: 'Custom Payload', valueType: 'json' },
        { key: 'stale_output', title: 'Stale Output', valueType: 'json' }
      ]
    });

    const issues = validateDocument(document);

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-plugin' &&
          issue.fieldKey === 'config.output_contract' &&
          issue.title === '输出变量名未知'
      )
    ).toBe(true);
  });

  test('flags legacy plugin_node contribution schema versions', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('plugin_node', 'node-plugin'),
      plugin_id: 'plugin-1',
      plugin_version: '1.0.0',
      contribution_code: 'custom_plugin_node',
      node_shell: 'generic',
      schema_version: '1flowbase.node-contribution/v1',
      plugin_unique_identifier: 'plugin-1:custom_plugin_node:v1',
      package_id: 'plugin-1',
      contribution_checksum: 'checksum',
      compiled_contribution_hash: 'compiled-hash',
      output_schema_snapshot: {
        outputs: [
          { key: 'custom_payload', title: 'Custom Payload', valueType: 'json' }
        ]
      },
      outputs: [
        { key: 'custom_payload', title: 'Custom Payload', valueType: 'json' }
      ]
    });

    const issues = validateDocument(document);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-plugin',
          title: '插件节点缺少贡献身份'
        })
      ])
    );
  });

  test('flags internal plugin_node output keys even when snapshot allows them', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('plugin_node', 'node-plugin'),
      plugin_id: 'plugin-1',
      plugin_version: '1.0.0',
      contribution_code: 'custom_plugin_node',
      node_shell: 'generic',
      schema_version: '1flowbase.node-contribution/v2',
      plugin_unique_identifier: 'plugin-1:custom_plugin_node:v2',
      package_id: 'plugin-1',
      contribution_checksum: 'checksum',
      compiled_contribution_hash: 'compiled-hash',
      output_schema_snapshot: {
        outputs: [{ key: '__trace', title: 'Trace', valueType: 'json' }]
      },
      outputs: [{ key: '__trace', title: 'Trace', valueType: 'json' }]
    });

    const issues = validateDocument(document);

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-plugin' &&
          issue.fieldKey === 'config.output_contract' &&
          issue.title === '输出变量名保留'
      )
    ).toBe(true);
  });

  test('keeps all backend-provided models selectable, including manual entries', () => {
    const options = {
      ...modelProviderOptionsContract,
      providers: [
        {
          ...primaryProvider,
          model_groups: [
            {
              ...primaryGroup,
              models: [
                {
                  ...primaryModel,
                  model_id: 'gpt-4o-mini',
                  display_name: 'GPT-4o Mini'
                },
                {
                  ...primaryModel,
                  model_id: 'gpt-4o',
                  display_name: 'GPT-4o'
                },
                {
                  ...primaryModel,
                  model_id: 'manual-enabled-model',
                  display_name: '手动启用模型',
                  source: 'manual'
                }
              ]
            }
          ]
        }
      ]
    };

    expect(
      listLlmProviderOptions(
        options as typeof modelProviderOptionsContract
      )[0]?.models.map((model) => model.value)
    ).toEqual(['gpt-4o-mini', 'gpt-4o', 'manual-enabled-model']);
  });

  test('returns field, node, and global issues', () => {
    const broken = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    broken.graph.nodes = broken.graph.nodes.filter(
      (node) => node.id !== 'node-answer'
    );

    const issues = validateDocument(broken);

    expect(issues.some((issue) => issue.scope === 'field')).toBe(true);
    expect(issues.some((issue) => issue.scope === 'node')).toBe(true);
    expect(issues.some((issue) => issue.scope === 'global')).toBe(true);
  });

  test('returns a field issue when a templated binding points to an unreachable output', () => {
    const broken = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = broken.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.bindings.user_prompt = {
      kind: 'templated_text',
      value: '请基于 {{node-answer.answer}} 回复用户'
    };

    const issues = validateDocument(broken);

    expect(
      issues.some(
        (issue) =>
          issue.scope === 'field' &&
          issue.nodeId === 'node-llm' &&
          issue.fieldKey === 'bindings.user_prompt' &&
          issue.message === '当前 binding 引用了未接入上游链路的输出。'
      )
    ).toBe(true);
  });

  test('accepts templated bindings that reference application environment variables', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.bindings.user_prompt = {
      kind: 'templated_text',
      value: '请调用 {{env.ApiBaseUrl}} 处理请求'
    };

    const issues = validateDocument(document, null, [
      {
        name: 'ApiBaseUrl',
        value_type: 'string',
        value: 'https://api.example.com',
        description: '当前应用 API 地址'
      }
    ]);

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-llm' &&
          issue.fieldKey === 'bindings.user_prompt' &&
          issue.message === '当前 binding 引用了未接入上游链路的输出。'
      )
    ).toBe(false);
  });

  test('flags duplicate code output keys in the editable output contract', () => {
    const document = createCodeDocumentWithOutputs([
      { key: 'result', title: '结果', valueType: 'string' },
      { key: 'result', title: '重复结果', valueType: 'string' }
    ]);

    const issues = validateDocument(document);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-code',
          message: '输出契约中的变量名必须唯一'
        })
      ])
    );
  });

  test('flags a missing llm model provider selection on the unified field', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const issues = validateDocument(document);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.model_provider',
          title: 'LLM 缺少模型供应商'
        })
      ])
    );
  });

  test('flags unavailable provider code and missing model in provider catalog', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: 'provider-stale',
      source_instance_id: 'provider-stale-instance',
      model_id: 'gpt-4.1'
    };

    const issues = validateDocument(document, modelProviderOptionsContract);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.model_provider',
          title: 'LLM 模型供应商不可用'
        })
      ])
    );
  });

  test('flags a model that is not in the backend-provided model list', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: 'openai_compatible',
      source_instance_id: primaryGroup.source_instance_id,
      model_id: 'gpt-4o'
    };

    const issues = validateDocument(document, modelProviderOptionsContract);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.model_provider',
          title: 'LLM 模型不可用'
        })
      ])
    );
  });

  test('flags a missing llm source instance on the unified field', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: primaryProvider.provider_code,
      source_instance_id: '',
      model_id: primaryModel.model_id
    };

    const issues = validateDocument(document, modelProviderOptionsContract);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.model_provider',
          title: 'LLM 缺少模型来源实例'
        })
      ])
    );
  });

  test('flags a saved source instance that is no longer present in the grouped provider options', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: primaryProvider.provider_code,
      source_instance_id: 'provider-openai-missing',
      model_id: primaryModel.model_id
    };

    const issues = validateDocument(document, modelProviderOptionsContract);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.model_provider',
          title: 'LLM 模型来源实例不可用'
        })
      ])
    );
  });

  test('keeps the node populated but flags a model that does not exist under the selected source instance', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_code: primaryProvider.provider_code,
      source_instance_id: secondaryGroup.source_instance_id,
      model_id: primaryModel.model_id
    };

    const issues = validateDocument(document, modelProviderOptionsContract);

    expect(llmNode.config.model_provider).toEqual(
      expect.objectContaining({
        provider_code: primaryProvider.provider_code,
        source_instance_id: secondaryGroup.source_instance_id,
        model_id: primaryModel.model_id
      })
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.model_provider',
          title: 'LLM 模型不可用'
        })
      ])
    );
  });

  test('validates only active Data Model node type bindings', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('data_model_create', 'node-data-model'),
      config: { data_model_code: 'orders' },
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
      }
    });

    const issues = validateDocument(document);

    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-data-model' &&
          issue.fieldKey === 'bindings.query'
      )
    ).toBe(false);
    expect(
      issues.some(
        (issue) =>
          issue.nodeId === 'node-data-model' &&
          issue.fieldKey === 'bindings.record_id'
      )
    ).toBe(false);
  });

  test('does not crash on malformed saved Data Model query binding', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('data_model_list', 'node-data-model'),
      config: { data_model_code: 'orders' },
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
                  selector: ['node-start', 'query', false]
                }
              }
            ],
            page: { kind: 'selector', selector: ['node-start', 'query', null] }
          }
        } as never
      }
    });

    expect(() => validateDocument(document)).not.toThrow();
  });
});
