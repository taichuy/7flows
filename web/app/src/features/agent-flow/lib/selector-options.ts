import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import { getNodeVariableOutputs } from './start-node-variables';
import {
  agentFlowSystemVariables,
  systemVariableNodeId
} from './system-variables';
import {
  environmentVariableNodeId,
  formatEnvironmentVariableTitle,
  type AgentFlowEnvironmentVariable
} from './application-environment-variables';
import { formatNodeVariableLabel } from './variable-labels';

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
  nodeId: string,
  environmentVariables: AgentFlowEnvironmentVariable[] = []
): FlowSelectorOption[] {
  const visibleNodeIds = collectUpstreamNodeIds(document, nodeId);
  const systemOptions = agentFlowSystemVariables.map((variable) => ({
    nodeId: systemVariableNodeId,
    nodeLabel: '系统变量',
    outputKey: variable.key,
    outputLabel: variable.title,
    value: [systemVariableNodeId, variable.key],
    displayLabel: variable.title
  }));
  const environmentOptions = environmentVariables.map((variable) => ({
    nodeId: environmentVariableNodeId,
    nodeLabel: '环境变量',
    outputKey: variable.name,
    outputLabel: formatEnvironmentVariableTitle(variable.name),
    value: [environmentVariableNodeId, variable.name],
    displayLabel: formatEnvironmentVariableTitle(variable.name)
  }));

  const nodeOptions = document.graph.nodes
    .filter((node) => visibleNodeIds.has(node.id))
    .flatMap((node) =>
      getNodeVariableOutputs(node).map((output) => ({
        nodeId: node.id,
        nodeLabel: node.alias,
        outputKey: output.key,
        outputLabel: output.key,
        value: [node.id, output.key],
        displayLabel: formatNodeVariableLabel(node.alias, output.key)
      }))
    );

  return [...systemOptions, ...environmentOptions, ...nodeOptions];
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
  selector: string[],
  environmentVariables: AgentFlowEnvironmentVariable[] = []
): boolean {
  if (selector.length < 2) {
    return false;
  }

  return listVisibleSelectorOptions(
    document,
    nodeId,
    environmentVariables
  ).some(
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
