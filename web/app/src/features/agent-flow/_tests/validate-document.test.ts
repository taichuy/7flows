import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import {
  modelProviderOptionsContract
} from '../../../test/model-provider-contract-fixtures';
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
          ...createNodeDocument('code', 'node-code', node.position.x, node.position.y),
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
      listLlmProviderOptions(options as typeof modelProviderOptionsContract)[0]?.models.map(
        (model) => model.value
      )
    ).toEqual(['gpt-4o-mini', 'gpt-4o', 'manual-enabled-model']);
  });

  test('returns field, node, and global issues', () => {
    const broken = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    broken.graph.nodes = broken.graph.nodes.filter((node) => node.id !== 'node-answer');

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
      issues.some((issue) =>
        issue.scope === 'field' &&
        issue.nodeId === 'node-llm' &&
        issue.fieldKey === 'bindings.user_prompt' &&
        issue.message === '当前 binding 引用了未接入上游链路的输出。'
      )
    ).toBe(true);
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

  test('validates only active Data Model action bindings', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    document.graph.nodes.push({
      ...createNodeDocument('data_model' as never, 'node-data-model'),
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
});
