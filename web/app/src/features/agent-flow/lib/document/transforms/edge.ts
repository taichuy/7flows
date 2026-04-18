import type {
  FlowAuthoringDocument,
  FlowNodeDocument
} from '@1flowbase/flow-schema';

import { createEdgeDocument } from '../edge-factory';
import { getEdgeById, getNodeById } from '../selectors';

export interface EdgeConnection {
  source?: string | null;
  target?: string | null;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export function validateConnection(
  document: FlowAuthoringDocument,
  connection: Pick<EdgeConnection, 'source' | 'target'>
) {
  if (!connection.source || !connection.target) {
    return false;
  }

  const sourceNode = getNodeById(document, connection.source);
  const targetNode = getNodeById(document, connection.target);

  return Boolean(
    sourceNode &&
      targetNode &&
      sourceNode.id !== targetNode.id &&
      sourceNode.containerId === targetNode.containerId
  );
}

export function reconnectEdge(
  document: FlowAuthoringDocument,
  payload: {
    edgeId: string;
    connection: EdgeConnection;
  }
): FlowAuthoringDocument {
  const edge = getEdgeById(document, payload.edgeId);

  if (!edge || !validateConnection(document, payload.connection)) {
    return document;
  }

  return {
    ...document,
    graph: {
      ...document.graph,
      edges: document.graph.edges.map((item) =>
        item.id === payload.edgeId
          ? {
              ...item,
              source: payload.connection.source ?? item.source,
              target: payload.connection.target ?? item.target,
              sourceHandle: payload.connection.sourceHandle ?? null,
              targetHandle: payload.connection.targetHandle ?? null
            }
          : item
      )
    }
  };
}

function createNextEdgeId(
  document: FlowAuthoringDocument,
  connection: {
    source: NonNullable<EdgeConnection['source']>;
    target: NonNullable<EdgeConnection['target']>;
  }
) {
  const baseId = `edge-${connection.source.replace(/^node-/, '')}-${connection.target.replace(/^node-/, '')}`;

  if (!document.graph.edges.some((edge) => edge.id === baseId)) {
    return baseId;
  }

  let index = 2;

  while (
    document.graph.edges.some((edge) => edge.id === `${baseId}-${index}`)
  ) {
    index += 1;
  }

  return `${baseId}-${index}`;
}

export function connectNodes(
  document: FlowAuthoringDocument,
  payload: {
    connection: EdgeConnection;
  }
): FlowAuthoringDocument {
  if (!validateConnection(document, payload.connection)) {
    return document;
  }

  const sourceNode = getNodeById(document, payload.connection.source ?? null);
  const targetNode = getNodeById(document, payload.connection.target ?? null);

  if (!sourceNode || !targetNode) {
    return document;
  }

  const alreadyExists = document.graph.edges.some(
    (edge) =>
      edge.source === payload.connection.source &&
      edge.target === payload.connection.target &&
      edge.sourceHandle === (payload.connection.sourceHandle ?? null) &&
      edge.targetHandle === (payload.connection.targetHandle ?? null)
  );

  if (alreadyExists) {
    return document;
  }

  return {
    ...document,
    graph: {
      ...document.graph,
      edges: [
        ...document.graph.edges,
        createEdgeDocument({
          id: createNextEdgeId(document, {
            source: sourceNode.id,
            target: targetNode.id
          }),
          source: sourceNode.id,
          target: targetNode.id,
          sourceHandle: payload.connection.sourceHandle ?? null,
          targetHandle: payload.connection.targetHandle ?? null,
          containerId: sourceNode.containerId
        })
      ]
    }
  };
}

export function insertNodeOnEdge(
  document: FlowAuthoringDocument,
  payload: {
    edgeId: string;
    node: FlowNodeDocument;
  }
): FlowAuthoringDocument {
  const edge = getEdgeById(document, payload.edgeId);

  if (!edge) {
    return document;
  }

  const sourceNode = getNodeById(document, edge.source);
  const targetNode = getNodeById(document, edge.target);

  if (!sourceNode || !targetNode) {
    return document;
  }

  const insertedNode = {
    ...payload.node,
    containerId: sourceNode.containerId,
    position: {
      x: Math.round((sourceNode.position.x + targetNode.position.x) / 2),
      y: Math.round((sourceNode.position.y + targetNode.position.y) / 2)
    }
  };

  return {
    ...document,
    graph: {
      nodes: [...document.graph.nodes, insertedNode],
      edges: [
        ...document.graph.edges.filter((item) => item.id !== payload.edgeId),
        createEdgeDocument({
          id: `edge-${edge.source}-${insertedNode.id}`,
          source: edge.source,
          target: insertedNode.id,
          sourceHandle: edge.sourceHandle,
          targetHandle: null,
          containerId: edge.containerId
        }),
        createEdgeDocument({
          id: `edge-${insertedNode.id}-${edge.target}`,
          source: insertedNode.id,
          target: edge.target,
          sourceHandle: null,
          targetHandle: edge.targetHandle,
          containerId: edge.containerId
        })
      ]
    }
  };
}

export function connectNodeFromSource(
  document: FlowAuthoringDocument,
  payload: {
    sourceNodeId: string;
    sourceHandleId?: string | null;
    node: FlowNodeDocument;
  }
): FlowAuthoringDocument {
  const sourceNode = getNodeById(document, payload.sourceNodeId);

  if (!sourceNode) {
    return document;
  }

  const insertedNode = {
    ...payload.node,
    containerId: sourceNode.containerId
  };

  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: [...document.graph.nodes, insertedNode],
      edges: [
        ...document.graph.edges,
        createEdgeDocument({
          id: createNextEdgeId(document, {
            source: sourceNode.id,
            target: insertedNode.id
          }),
          source: sourceNode.id,
          target: insertedNode.id,
          sourceHandle: payload.sourceHandleId ?? null,
          targetHandle: null,
          containerId: sourceNode.containerId
        })
      ]
    }
  };
}

export function removeEdge(
  document: FlowAuthoringDocument,
  payload: {
    edgeId: string;
  }
): FlowAuthoringDocument {
  if (!document.graph.edges.some((edge) => edge.id === payload.edgeId)) {
    return document;
  }

  return {
    ...document,
    graph: {
      ...document.graph,
      edges: document.graph.edges.filter((edge) => edge.id !== payload.edgeId)
    }
  };
}
