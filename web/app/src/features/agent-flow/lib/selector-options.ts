import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

export interface FlowSelectorOption {
  nodeId: string;
  nodeLabel: string;
  outputKey: string;
  outputLabel: string;
  value: string[];
  displayLabel: string;
}

function collectUpstreamNodeIds(
  document: FlowAuthoringDocument,
  nodeId: string
): Set<string> {
  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();

    if (!currentNodeId) {
      continue;
    }

    for (const edge of document.graph.edges) {
      if (edge.target !== currentNodeId || visited.has(edge.source)) {
        continue;
      }

      visited.add(edge.source);
      queue.push(edge.source);
    }
  }

  return visited;
}

export function listVisibleSelectorOptions(
  document: FlowAuthoringDocument,
  nodeId: string
): FlowSelectorOption[] {
  const visibleNodeIds = collectUpstreamNodeIds(document, nodeId);

  return document.graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .flatMap((node) =>
      node.outputs.map((output) => ({
        nodeId: node.id,
        nodeLabel: node.alias,
        outputKey: output.key,
        outputLabel: output.title,
        value: [node.id, output.key],
        displayLabel: `${node.alias} / ${output.title}`
      }))
    );
}

export function toCascaderSelectorOptions(options: FlowSelectorOption[]) {
  const groups = new Map<
    string,
    {
      label: string;
      value: string;
      children: Array<{ label: string; value: string }>;
    }
  >();

  for (const option of options) {
    if (!groups.has(option.nodeId)) {
      groups.set(option.nodeId, {
        label: option.nodeLabel,
        value: option.nodeId,
        children: []
      });
    }

    groups.get(option.nodeId)?.children.push({
      label: option.outputLabel,
      value: option.outputKey
    });
  }

  return [...groups.values()];
}

export function isSelectorVisible(
  document: FlowAuthoringDocument,
  nodeId: string,
  selector: string[]
): boolean {
  if (selector.length < 2) {
    return false;
  }

  return listVisibleSelectorOptions(document, nodeId).some(
    (option) =>
      option.value.length === selector.length &&
      option.value.every((segment, index) => segment === selector[index])
  );
}

export function encodeSelectorValue(value: string[]): string {
  return JSON.stringify(value);
}

export function decodeSelectorValue(value: string): string[] {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((segment) => typeof segment === 'string')
      : [];
  } catch {
    return [];
  }
}
