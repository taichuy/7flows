import { describe, expect, test } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { classifyDocumentChange } from '../lib/document/change-kind';
import { createEdgeDocument } from '../lib/document/edge-factory';
import { createNodeDocument } from '../lib/document/node-factory';
import { getContainerPathForNode } from '../lib/document/transforms/container';
import { duplicateNodeSubgraph } from '../lib/document/transforms/duplicate';
import {
  removeEdge,
  insertNodeOnEdge,
  reconnectEdge,
  validateConnection
} from '../lib/document/transforms/edge';
import {
  moveNodes,
  removeNodeSubgraph,
  replaceNodeWithOption,
  updateNodeField
} from '../lib/document/transforms/node';
import { setViewport } from '../lib/document/transforms/viewport';

function createNestedContainerDocument() {
  const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

  document.graph.nodes.push(
    {
      ...createNodeDocument('iteration', 'node-iteration-1', 640, 240),
      containerId: null
    },
    {
      ...createNodeDocument('answer', 'node-inner-answer-1', 920, 240),
      containerId: 'node-iteration-1'
    }
  );
  document.graph.edges.push(
    createEdgeDocument({
      id: 'edge-iteration-answer',
      source: 'node-iteration-1',
      target: 'node-inner-answer-1',
      containerId: 'node-iteration-1'
    })
  );

  return document;
}

describe('agent flow document transforms', () => {
  test('inserts a node in the middle of an existing edge', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const inserted = createNodeDocument(
      'template_transform',
      'node-template-transform-1'
    );

    const next = insertNodeOnEdge(document, {
      edgeId: 'edge-llm-answer',
      node: inserted
    });

    expect(next.graph.nodes.map((node) => node.id)).toContain(
      'node-template-transform-1'
    );
    expect(next.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'node-llm',
          target: 'node-template-transform-1'
        }),
        expect.objectContaining({
          source: 'node-template-transform-1',
          target: 'node-answer'
        })
      ])
    );
  });

  test('reconnects an edge only when source and target stay inside the same container', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const next = reconnectEdge(document, {
      edgeId: 'edge-start-llm',
      connection: {
        source: 'node-start',
        target: 'node-answer',
        sourceHandle: 'source-right',
        targetHandle: 'target-left'
      }
    });

    expect(next.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-start-llm',
          source: 'node-start',
          target: 'node-answer',
          sourceHandle: 'source-right',
          targetHandle: 'target-left'
        })
      ])
    );

    expect(
      validateConnection(document, {
        source: 'node-start',
        target: 'missing-node'
      })
    ).toBe(false);
  });

  test('classifies viewport changes as layout and field changes as logical', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const moved = moveNodes(document, {
      'node-llm': { x: 520, y: 260 }
    });
    const viewport = setViewport(document, { x: 120, y: 48, zoom: 0.85 });
    const logical = updateNodeField(document, {
      nodeId: 'node-llm',
      fieldKey: 'alias',
      value: 'Dialogue Model'
    });

    expect(classifyDocumentChange(document, moved)).toBe('layout');
    expect(classifyDocumentChange(document, viewport)).toBe('layout');
    expect(classifyDocumentChange(document, logical)).toBe('logical');
  });

  test('resolves nested container path from document structure', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    document.graph.nodes.push({
      ...createNodeDocument('iteration', 'node-iteration-1'),
      containerId: null
    });
    document.graph.nodes.push({
      ...createNodeDocument('answer', 'node-inner-answer-1'),
      containerId: 'node-iteration-1'
    });

    expect(getContainerPathForNode(document, 'node-inner-answer-1')).toEqual([
      'node-iteration-1'
    ]);
  });

  test('removes a single edge by id without touching sibling edges', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const next = removeEdge(document, {
      edgeId: 'edge-llm-answer'
    });

    expect(next.graph.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-llm-answer'
        })
      ])
    );
    expect(next.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-start-llm'
        })
      ])
    );
  });

  test('duplicates a container subtree and rewrites internal ids', () => {
    const document = createNestedContainerDocument();

    const next = duplicateNodeSubgraph(document, {
      nodeId: 'node-iteration-1'
    });

    expect(
      next.graph.nodes.some((node) => node.id === 'node-iteration-1-copy')
    ).toBe(true);
    expect(
      next.graph.nodes.some(
        (node) => node.containerId === 'node-iteration-1-copy'
      )
    ).toBe(true);
    expect(
      next.graph.edges.some(
        (edge) => edge.source.includes('-copy') && edge.target.includes('-copy')
      )
    ).toBe(true);
  });

  test('duplicates prompt message bindings and rewrites selector tokens', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const llmNode = document.graph.nodes.find((node) => node.id === 'node-llm');

    if (!llmNode) {
      throw new Error('expected default LLM node');
    }

    llmNode.bindings.prompt_messages = {
      kind: 'prompt_messages',
      value: [
        {
          id: 'system-1',
          role: 'system',
          content: {
            kind: 'templated_text',
            value: 'Review {{node-llm.output}} before answering.'
          }
        }
      ]
    };

    const next = duplicateNodeSubgraph(document, {
      nodeId: 'node-llm'
    });
    const duplicatedNode = next.graph.nodes.find(
      (node) => node.id === 'node-llm-copy'
    );

    expect(duplicatedNode?.bindings.prompt_messages).toMatchObject({
      kind: 'prompt_messages',
      value: [
        {
          content: {
            value: 'Review {{node-llm-copy.output}} before answering.'
          }
        }
      ]
    });
  });

  test('duplicates Data Model query binding and rewrites selector values', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const sourceNode = createNodeDocument('data_model' as never, 'node-data-model');
    sourceNode.bindings.query = {
      kind: 'data_model_query',
      value: {
        filters: [
          {
            field_code: 'status',
            operator: 'eq',
            value: { kind: 'selector', selector: ['node-data-model', 'total'] }
          }
        ],
        sorts: [],
        expand_relations: [],
        page: { kind: 'constant', value: 1 },
        page_size: { kind: 'constant', value: 20 }
      }
    };
    document.graph.nodes.push(sourceNode);

    const duplicated = duplicateNodeSubgraph(document, {
      nodeId: 'node-data-model'
    });
    const copied = duplicated.graph.nodes.find(
      (node) => node.id === 'node-data-model-copy'
    );

    expect(copied?.bindings.query).toMatchObject({
      kind: 'data_model_query',
      value: {
        filters: [
          {
            value: {
              kind: 'selector',
              selector: ['node-data-model-copy', 'total']
            }
          }
        ]
      }
    });
  });

  test('duplicates malformed Data Model query binding without crashing', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const sourceNode = createNodeDocument('data_model' as never, 'node-data-model');
    sourceNode.bindings.query = {
      kind: 'data_model_query',
      value: {
        filters: [
          {},
          {
            field_code: 'status',
            operator: 'eq',
            value: {
              kind: 'selector',
              selector: ['node-data-model', 'total', 1]
            }
          }
        ],
        sorts: {},
        expand_relations: [false, 'customer'],
        page: {
          kind: 'selector',
          selector: ['node-data-model', 'total', null]
        }
      }
    } as never;
    document.graph.nodes.push(sourceNode);

    const duplicated = duplicateNodeSubgraph(document, {
      nodeId: 'node-data-model'
    });
    const copied = duplicated.graph.nodes.find(
      (node) => node.id === 'node-data-model-copy'
    );

    expect(copied?.bindings.query).toMatchObject({
      kind: 'data_model_query',
      value: {
        filters: [
          {
            field_code: 'status',
            operator: 'eq',
            value: {
              kind: 'selector',
              selector: ['node-data-model-copy', 'total']
            }
          }
        ],
        sorts: [],
        expand_relations: ['customer'],
        page: {
          kind: 'selector',
          selector: ['node-data-model-copy', 'total']
        },
        page_size: { kind: 'constant', value: 20 }
      }
    });
  });

  test('removes a selected node together with connected edges', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const next = removeNodeSubgraph(document, {
      nodeId: 'node-llm'
    });

    expect(next.graph.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-llm'
        })
      ])
    );
    expect(next.graph.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-start-llm'
        }),
        expect.objectContaining({
          id: 'edge-llm-answer'
        })
      ])
    );
    expect(next.graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-start'
        }),
        expect.objectContaining({
          id: 'node-answer'
        })
      ])
    );
  });

  test('replaces a node while keeping its id position and connected edges', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const originalNode = document.graph.nodes.find(
      (node) => node.id === 'node-llm'
    );

    const next = replaceNodeWithOption(document, {
      nodeId: 'node-llm',
      option: {
        kind: 'builtin',
        type: 'tool',
        label: 'Tool'
      }
    });
    const replacedNode = next.graph.nodes.find(
      (node) => node.id === 'node-llm'
    );

    expect(replacedNode).toEqual(
      expect.objectContaining({
        id: 'node-llm',
        type: 'tool',
        alias: 'Tool',
        position: originalNode?.position,
        containerId: originalNode?.containerId
      })
    );
    expect(next.graph.edges).toEqual(document.graph.edges);
  });

  test('removes nested container children when deleting a container node', () => {
    const document = createNestedContainerDocument();

    const next = removeNodeSubgraph(document, {
      nodeId: 'node-iteration-1'
    });

    expect(next.graph.nodes).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'node-iteration-1'
        }),
        expect.objectContaining({
          id: 'node-inner-answer-1'
        })
      ])
    );
    expect(next.graph.edges).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge-iteration-answer'
        })
      ])
    );
  });
});
