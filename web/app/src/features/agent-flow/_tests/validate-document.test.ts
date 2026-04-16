import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

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

  test('returns a field issue when a selector points to an unreachable output', () => {
    const broken = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = broken.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.bindings.user_prompt = {
      kind: 'selector',
      value: ['node-answer', 'answer']
    };

    const issues = validateDocument(broken);

    expect(
      issues.some(
        (issue) => issue.scope === 'field' && issue.nodeId === 'node-llm'
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
});
