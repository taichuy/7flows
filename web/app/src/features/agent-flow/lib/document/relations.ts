import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

function uniqueNodeIds(nodeIds: string[]) {
  return [...new Set(nodeIds)];
}

export function getDirectUpstreamNodes(
  document: FlowAuthoringDocument,
  nodeId: string
) {
  const incomingIds = uniqueNodeIds(
    document.graph.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => edge.source)
  );

  return document.graph.nodes.filter((node) => incomingIds.includes(node.id));
}

export function getDirectDownstreamNodes(
  document: FlowAuthoringDocument,
  nodeId: string
) {
  const outgoingIds = uniqueNodeIds(
    document.graph.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target)
  );

  return document.graph.nodes.filter((node) => outgoingIds.includes(node.id));
}
