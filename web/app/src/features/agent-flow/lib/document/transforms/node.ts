import type {
  FlowAuthoringDocument,
  FlowBinding,
  FlowNodeDocument
} from '@1flowbase/flow-schema';

import { createEdgeDocument } from '../edge-factory';
import { getOutgoingEdges, getNodeById } from '../selectors';

const NODE_GAP_X = 280;

type NodeFieldValue =
  | string
  | number
  | boolean
  | null
  | FlowBinding
  | string[]
  | string[][];

function replaceOutputTitle(
  outputs: FlowNodeDocument['outputs'],
  outputKey: string,
  title: string
): FlowNodeDocument['outputs'] {
  return outputs.map((output) =>
    output.key === outputKey ? { ...output, title } : output
  );
}

export function replaceNodeOutputs(
  document: FlowAuthoringDocument,
  nodeId: string,
  outputs: FlowNodeDocument['outputs']
): FlowAuthoringDocument {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              outputs
            }
          : node
      )
    }
  };
}

export function moveNodes(
  document: FlowAuthoringDocument,
  positions: Record<string, { x: number; y: number }>
): FlowAuthoringDocument {
  if (Object.keys(positions).length === 0) {
    return document;
  }

  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) =>
        positions[node.id]
          ? {
              ...node,
              position: positions[node.id]
            }
          : node
      )
    }
  };
}

function collectNodeIdsToRemove(
  document: FlowAuthoringDocument,
  rootNodeId: string
) {
  const queue = [rootNodeId];
  const collectedIds: string[] = [];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();

    if (!currentNodeId || collectedIds.includes(currentNodeId)) {
      continue;
    }

    collectedIds.push(currentNodeId);

    for (const candidate of document.graph.nodes) {
      if (candidate.containerId === currentNodeId) {
        queue.push(candidate.id);
      }
    }
  }

  return collectedIds;
}

export function removeNodeSubgraph(
  document: FlowAuthoringDocument,
  payload: { nodeId: string }
): FlowAuthoringDocument {
  const node = getNodeById(document, payload.nodeId);

  if (!node) {
    return document;
  }

  const removedNodeIds = new Set(collectNodeIdsToRemove(document, payload.nodeId));

  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.filter((candidate) => !removedNodeIds.has(candidate.id)),
      edges: document.graph.edges.filter(
        (edge) =>
          !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target)
      )
    }
  };
}

export function updateNodeField(
  document: FlowAuthoringDocument,
  payload: {
    nodeId: string;
    fieldKey: string;
    value: NodeFieldValue;
  }
): FlowAuthoringDocument {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => {
        if (node.id !== payload.nodeId) {
          return node;
        }

        if (payload.fieldKey === 'alias' && typeof payload.value === 'string') {
          return {
            ...node,
            alias: payload.value
          };
        }

        if (
          payload.fieldKey === 'description' &&
          typeof payload.value === 'string'
        ) {
          return {
            ...node,
            description: payload.value
          };
        }

        if (payload.fieldKey.startsWith('config.')) {
          const configKey = payload.fieldKey.slice('config.'.length);

          return {
            ...node,
            config: {
              ...node.config,
              [configKey]: payload.value
            }
          };
        }

        if (payload.fieldKey.startsWith('bindings.')) {
          const bindingKey = payload.fieldKey.slice('bindings.'.length);

          return {
            ...node,
            bindings: {
              ...node.bindings,
              [bindingKey]: payload.value as FlowBinding
            }
          };
        }

        if (
          payload.fieldKey.startsWith('outputs.') &&
          typeof payload.value === 'string'
        ) {
          const outputKey = payload.fieldKey.slice('outputs.'.length);

          return {
            ...node,
            outputs: replaceOutputTitle(node.outputs, outputKey, payload.value)
          };
        }

        return node;
      })
    }
  };
}

export function insertNodeAfter(
  document: FlowAuthoringDocument,
  anchorNodeId: string,
  node: FlowNodeDocument
): FlowAuthoringDocument {
  const anchorNode = getNodeById(document, anchorNodeId);

  if (!anchorNode) {
    return document;
  }

  const outgoingEdges = getOutgoingEdges(document, anchorNodeId);
  const nextPositionX = anchorNode.position.x + NODE_GAP_X;

  const shiftedNodes = document.graph.nodes.map((candidate) =>
    candidate.id !== anchorNodeId &&
    candidate.containerId === anchorNode.containerId &&
    candidate.position.x >= nextPositionX
      ? {
          ...candidate,
          position: {
            ...candidate.position,
            x: candidate.position.x + NODE_GAP_X
          }
        }
      : candidate
  );

  const insertedNode = {
    ...node,
    containerId: anchorNode.containerId,
    position: {
      x: nextPositionX,
      y: anchorNode.position.y
    }
  };

  return {
    ...document,
    graph: {
      nodes: [...shiftedNodes, insertedNode],
      edges: [
        ...document.graph.edges.filter((edge) => edge.source !== anchorNodeId),
        createEdgeDocument({
          id: `edge-${anchorNodeId}-${insertedNode.id}`,
          source: anchorNodeId,
          target: insertedNode.id,
          containerId: anchorNode.containerId
        }),
        ...outgoingEdges.map((edge) =>
          createEdgeDocument({
            id: `edge-${insertedNode.id}-${edge.target}`,
            source: insertedNode.id,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            containerId: edge.containerId,
            points: edge.points
          })
        )
      ]
    }
  };
}
