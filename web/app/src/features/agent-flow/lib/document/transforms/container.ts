import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import { getNodeById } from '../selectors';

export function getContainerPathForNode(
  document: FlowAuthoringDocument,
  nodeId: string | null
) {
  if (!nodeId) {
    return [];
  }

  const path: string[] = [];
  let currentNode = getNodeById(document, nodeId);

  while (currentNode?.containerId) {
    path.unshift(currentNode.containerId);
    currentNode = getNodeById(document, currentNode.containerId);
  }

  return path;
}
