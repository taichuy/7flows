import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { createNodeDocument } from '../lib/document/node-factory';
import { validateDocument } from '../lib/validate-document';

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
          title: 'LLM 缺少模型供应商实例'
        })
      ])
    );
  });

  test('flags unavailable provider instance and missing model in provider catalog', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.config.model_provider = {
      provider_instance_id: 'provider-stale',
      model_id: 'gpt-4.1'
    };

    const issues = validateDocument(document, {
      locale_meta: {},
      i18n_catalog: {},
      instances: [
        {
          provider_instance_id: 'provider-ready',
          provider_code: 'openai_compatible',
          plugin_type: 'provider',
          namespace: 'plugin.openai_compatible',
          label_key: 'provider.label',
          description_key: 'provider.description',
          protocol: 'openai_responses',
          display_name: 'OpenAI Prod',
          models: [
            {
              model_id: 'gpt-4o-mini',
              display_name: 'GPT-4o Mini',
              source: 'catalog',
              supports_streaming: true,
              supports_tool_call: true,
              supports_multimodal: false,
              context_window: 128000,
              max_output_tokens: 16384,
              parameter_form: null,
              provider_metadata: {}
            }
          ]
        }
      ]
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'node-llm',
          fieldKey: 'config.model_provider',
          title: 'LLM 模型供应商实例不可用'
        })
      ])
    );
  });
});
