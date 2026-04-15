import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowse/flow-schema';

import { validateDocument } from '../lib/validate-document';

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
});
