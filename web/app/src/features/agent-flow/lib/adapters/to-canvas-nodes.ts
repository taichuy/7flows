import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import type {
  AgentFlowBoundaryNode,
  AgentFlowCanvasNode,
  AgentFlowCanvasNodeData
} from '../../components/canvas/node-types';
import type { NodePickerOption } from '../plugin-node-definitions';
import { resolveAgentFlowNodeSchema } from '../../schema/node-schema-registry';

const CANVAS_NODE_WIDTH = 196;
const CANVAS_NODE_HEIGHT = 96;
const CONTAINER_CANVAS_NODE_WIDTH = 392;
const CONTAINER_CANVAS_NODE_HEIGHT = 180;
const CONTAINER_BOUNDARY_NODE_WIDTH = 104;
const CONTAINER_BOUNDARY_NODE_HEIGHT = 52;
const CONTAINER_BOUNDARY_GAP = 280;
const CONTAINER_EMPTY_START_X = 80;
const CONTAINER_EMPTY_END_X = 440;
const CONTAINER_DEFAULT_Y = 220;

function nodeTypeLabel(nodeType: AgentFlowCanvasNodeData['nodeType']) {
  if (nodeType === 'llm') {
    return 'LLM';
  }

  if (nodeType === 'plugin_node') {
    return 'Plugin Node';
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
    | 'onRunNode'
    | 'onReplaceNode'
    | 'onDeleteNode'
  > & {
    nodePickerOptions: NodePickerOption[];
  }
): Array<AgentFlowCanvasNode | AgentFlowBoundaryNode> {
  const visibleNodes = document.graph.nodes.filter(
    (node) => node.containerId === activeContainerId
  );
  const childCountByContainerId = document.graph.nodes.reduce<
    Record<string, number>
  >((counts, node) => {
    if (!node.containerId) {
      return counts;
    }

    counts[node.containerId] = (counts[node.containerId] ?? 0) + 1;
    return counts;
  }, {});
  const canvasNodes: AgentFlowCanvasNode[] = visibleNodes.map((node) => ({
    id: node.id,
    type: 'agentFlowNode',
    selected: node.id === selectedNodeId,
    position: node.position,
    width:
      node.type === 'iteration' || node.type === 'loop'
        ? CONTAINER_CANVAS_NODE_WIDTH
        : CANVAS_NODE_WIDTH,
    height:
      node.type === 'iteration' || node.type === 'loop'
        ? CONTAINER_CANVAS_NODE_HEIGHT
        : CANVAS_NODE_HEIGHT,
    measured: {
      width:
        node.type === 'iteration' || node.type === 'loop'
          ? CONTAINER_CANVAS_NODE_WIDTH
          : CANVAS_NODE_WIDTH,
      height:
        node.type === 'iteration' || node.type === 'loop'
          ? CONTAINER_CANVAS_NODE_HEIGHT
          : CANVAS_NODE_HEIGHT
    },
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
      containerChildCount: childCountByContainerId[node.id] ?? 0,
      ...actions
    }
  }));

  if (!activeContainerId) {
    return canvasNodes;
  }

  const minNodeX =
    visibleNodes.length > 0
      ? Math.min(...visibleNodes.map((node) => node.position.x))
      : CONTAINER_EMPTY_START_X + CONTAINER_BOUNDARY_GAP;
  const maxNodeX =
    visibleNodes.length > 0
      ? Math.max(...visibleNodes.map((node) => node.position.x))
      : CONTAINER_EMPTY_END_X - CONTAINER_BOUNDARY_GAP;
  const y =
    visibleNodes.length > 0
      ? Math.min(...visibleNodes.map((node) => node.position.y))
      : CONTAINER_DEFAULT_Y;
  const startX = Math.min(
    CONTAINER_EMPTY_START_X,
    minNodeX - CONTAINER_BOUNDARY_GAP
  );
  const endX = Math.max(
    CONTAINER_EMPTY_END_X,
    maxNodeX + CONTAINER_BOUNDARY_GAP
  );

  return [
    {
      id: `${activeContainerId}__boundary-start`,
      type: 'agentFlowBoundaryNode',
      position: { x: startX, y },
      width: CONTAINER_BOUNDARY_NODE_WIDTH,
      height: CONTAINER_BOUNDARY_NODE_HEIGHT,
      measured: {
        width: CONTAINER_BOUNDARY_NODE_WIDTH,
        height: CONTAINER_BOUNDARY_NODE_HEIGHT
      },
      data: {
        boundaryKind: 'start',
        label: '开始'
      },
      draggable: false,
      selectable: false
    },
    ...canvasNodes,
    {
      id: `${activeContainerId}__boundary-end`,
      type: 'agentFlowBoundaryNode',
      position: { x: endX, y },
      width: CONTAINER_BOUNDARY_NODE_WIDTH,
      height: CONTAINER_BOUNDARY_NODE_HEIGHT,
      measured: {
        width: CONTAINER_BOUNDARY_NODE_WIDTH,
        height: CONTAINER_BOUNDARY_NODE_HEIGHT
      },
      data: {
        boundaryKind: 'end',
        label: '结束'
      },
      draggable: false,
      selectable: false
    }
  ];
}
