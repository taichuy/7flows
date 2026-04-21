import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import type { AgentFlowCanvasEdge } from '../../components/canvas/node-types';
import type { NodePickerOption } from '../plugin-node-definitions';

export function toCanvasEdges(
  document: FlowAuthoringDocument,
  activeContainerId: string | null,
  selectedEdgeId: string | null,
  actions: {
    nodePickerOptions: NodePickerOption[];
    onInsertNode: (edgeId: string, option: NodePickerOption) => void;
  }
): AgentFlowCanvasEdge[] {
  const visibleNodeIds = new Set(
    document.graph.nodes
      .filter((node) => node.containerId === activeContainerId)
      .map((node) => node.id)
  );

  return document.graph.edges
    .filter(
      (edge) =>
        edge.containerId === activeContainerId &&
        visibleNodeIds.has(edge.source) &&
        visibleNodeIds.has(edge.target)
    )
    .map((edge) => ({
      id: edge.id,
      type: 'agentFlowEdge',
      selected: edge.id === selectedEdgeId,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      animated: false,
      style: { stroke: '#b2c8b9', strokeWidth: 2 },
      data: {
        nodePickerOptions: actions.nodePickerOptions,
        onInsertNode: actions.onInsertNode
      }
    }));
}
