import type {
  FlowAuthoringDocument,
  FlowBinding,
  FlowNodeDocument
} from '@1flowse/flow-schema';

import { getNodeById } from '../selectors';

function collectDuplicatedNodeIds(
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

export function getDuplicatedNodeId(existingIds: string[], sourceNodeId: string) {
  let nextId = `${sourceNodeId}-copy`;
  let index = 2;

  while (existingIds.includes(nextId)) {
    nextId = `${sourceNodeId}-copy-${index}`;
    index += 1;
  }

  return nextId;
}

function getDuplicatedEdgeId(existingIds: string[], sourceEdgeId: string) {
  let nextId = `${sourceEdgeId}-copy`;
  let index = 2;

  while (existingIds.includes(nextId)) {
    nextId = `${sourceEdgeId}-copy-${index}`;
    index += 1;
  }

  return nextId;
}

function remapSelector(
  selector: string[],
  idMap: Map<string, string>
) {
  if (selector.length === 0 || !idMap.has(selector[0])) {
    return selector;
  }

  return [idMap.get(selector[0])!, ...selector.slice(1)];
}

function remapBinding(
  binding: FlowBinding,
  idMap: Map<string, string>
): FlowBinding {
  switch (binding.kind) {
    case 'templated_text':
      return binding;
    case 'selector':
      return {
        ...binding,
        value: remapSelector(binding.value, idMap)
      };
    case 'selector_list':
      return {
        ...binding,
        value: binding.value.map((selector) => remapSelector(selector, idMap))
      };
    case 'named_bindings':
      return {
        ...binding,
        value: binding.value.map((entry) => ({
          ...entry,
          selector: remapSelector(entry.selector, idMap)
        }))
      };
    case 'condition_group':
      return {
        ...binding,
        value: {
          ...binding.value,
          conditions: binding.value.conditions.map((condition) => ({
            ...condition,
            left: remapSelector(condition.left, idMap),
            right: Array.isArray(condition.right)
              ? remapSelector(condition.right, idMap)
              : condition.right
          }))
        }
      };
    case 'state_write':
      return {
        ...binding,
        value: binding.value.map((entry) => ({
          ...entry,
          source: entry.source ? remapSelector(entry.source, idMap) : null
        }))
      };
  }
}

function remapBindings(
  bindings: FlowNodeDocument['bindings'],
  idMap: Map<string, string>
) {
  return Object.fromEntries(
    Object.entries(bindings).map(([key, value]) => [key, remapBinding(value, idMap)])
  );
}

function getNodeIdsToDuplicate(
  document: FlowAuthoringDocument,
  sourceNode: FlowNodeDocument
) {
  return sourceNode.type === 'iteration' || sourceNode.type === 'loop'
    ? collectDuplicatedNodeIds(document, sourceNode.id)
    : [sourceNode.id];
}

export function duplicateNodeSubgraph(
  document: FlowAuthoringDocument,
  payload: { nodeId: string }
) {
  const sourceNode = getNodeById(document, payload.nodeId);

  if (!sourceNode) {
    return document;
  }

  const sourceIds = getNodeIdsToDuplicate(document, sourceNode);
  const existingNodeIds = document.graph.nodes.map((node) => node.id);
  const idMap = new Map(
    sourceIds.map((id) => [id, getDuplicatedNodeId(existingNodeIds, id)])
  );
  const duplicatedNodes = document.graph.nodes
    .filter((node) => sourceIds.includes(node.id))
    .map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      alias: `${node.alias} 副本`,
      containerId:
        node.containerId && idMap.has(node.containerId)
          ? idMap.get(node.containerId)!
          : node.containerId,
      position: { x: node.position.x + 48, y: node.position.y + 48 },
      bindings: remapBindings(node.bindings, idMap)
    }));
  const duplicatedEdgeIds = document.graph.edges.map((edge) => edge.id);
  const duplicatedEdges = document.graph.edges
    .filter(
      (edge) => sourceIds.includes(edge.source) && sourceIds.includes(edge.target)
    )
    .map((edge) => ({
      ...edge,
      id: getDuplicatedEdgeId(duplicatedEdgeIds, edge.id),
      source: idMap.get(edge.source)!,
      target: idMap.get(edge.target)!,
      containerId:
        edge.containerId && idMap.has(edge.containerId)
          ? idMap.get(edge.containerId)!
          : edge.containerId
    }));

  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: [...document.graph.nodes, ...duplicatedNodes],
      edges: [...document.graph.edges, ...duplicatedEdges]
    }
  };
}
