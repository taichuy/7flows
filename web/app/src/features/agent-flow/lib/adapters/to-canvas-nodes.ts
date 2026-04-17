import type { FlowAuthoringDocument } from '@1flowse/flow-schema';

import type { AgentFlowCanvasNode, AgentFlowCanvasNodeData } from '../../components/canvas/node-types';
import { resolveAgentFlowNodeSchema } from '../../schema/node-schema-registry';

function nodeTypeLabel(nodeType: AgentFlowCanvasNodeData['nodeType']) {
  if (nodeType === 'llm') {
    return 'LLM';
  }

  return nodeType
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function toCanvasNodes(
  document: FlowAuthoringDocument,
  activeContainerId: string | null,
  selectedNodeId: string | null,
  pickerNodeId: string | null,
  issueCountByNodeId: Record<string, number>,
  actions: Pick<
    AgentFlowCanvasNodeData,
    | 'onOpenPicker'
    | 'onClosePicker'
    | 'onOpenContainer'
    | 'onSelectNode'
    | 'onInsertNode'
  >
): AgentFlowCanvasNode[] {
  return document.graph.nodes
    .filter((node) => node.containerId === activeContainerId)
    .map((node) => ({
      id: node.id,
      type: 'agentFlowNode',
      selected: node.id === selectedNodeId,
      position: node.position,
      width: 196,
      height: 96,
      data: {
        nodeId: node.id,
        nodeType: node.type,
        nodeSchema: resolveAgentFlowNodeSchema(node.type),
        typeLabel: nodeTypeLabel(node.type),
        alias: node.alias,
        description: node.description,
        config: node.config,
        issueCount: issueCountByNodeId[node.id] ?? 0,
        canEnterContainer: node.type === 'iteration' || node.type === 'loop',
        pickerOpen: pickerNodeId === node.id,
        showTargetHandle: node.type !== 'start',
        showSourceHandle: true,
        isContainer: node.type === 'iteration' || node.type === 'loop',
        ...actions
      }
    }));
}
