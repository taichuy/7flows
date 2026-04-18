import { describe, expect, test } from 'vitest';

import {
  FLOW_SCHEMA_VERSION,
  classifyDocumentChange,
  createDefaultAgentFlowDocument,
  type FlowAuthoringDocument
} from '@1flowbase/flow-schema';

import {
  buildDefaultAgentFlowDocument,
  createNextNodeId
} from '../lib/default-agent-flow-document';

describe('agent flow document helpers', () => {
  test('seeds the default start -> llm -> answer graph', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    expect(document.schemaVersion).toBe(FLOW_SCHEMA_VERSION);
    expect(document.graph.nodes.map((node) => node.type)).toEqual([
      'start',
      'llm',
      'answer'
    ]);
    expect(document.graph.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['node-start', 'node-llm'],
      ['node-llm', 'node-answer']
    ]);
    expect(document.graph.nodes.every((node) => node.description === '')).toBe(true);
  });

  test('treats viewport-only edits as layout changes', () => {
    const before = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const viewportOnly = {
      ...before,
      editor: {
        ...before.editor,
        viewport: { x: 120, y: 48, zoom: 0.85 }
      }
    };
    const logicalChange: FlowAuthoringDocument = {
      ...before,
      graph: {
        ...before.graph,
        nodes: before.graph.nodes.map((node) =>
          node.id === 'node-llm'
            ? {
                ...node,
                bindings: {
                  ...node.bindings,
                  system_prompt: {
                    kind: 'templated_text' as const,
                    value: 'You are a support agent.'
                  }
                }
              }
            : node
        )
      }
    };

    expect(classifyDocumentChange(before, viewportOnly)).toBe('layout');
    expect(classifyDocumentChange(before, logicalChange)).toBe('logical');
  });

  test('keeps the local document helper facade aligned with flow-schema defaults', () => {
    const document = buildDefaultAgentFlowDocument('flow-1');

    expect(document.graph.nodes.map((node) => node.id)).toEqual([
      'node-start',
      'node-llm',
      'node-answer'
    ]);
    expect(createNextNodeId(document, 'llm')).toBe('node-llm-1');
  });
});
