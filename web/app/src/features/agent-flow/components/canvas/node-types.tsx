import type { FlowNodeType } from '@1flowbase/flow-schema';
import type { EdgeTypes, Node, NodeTypes } from '@xyflow/react';

import type { CanvasNodeSchema } from '../../../../shared/schema-ui/contracts/canvas-node-schema';
import { AgentFlowNodeCard } from '../nodes/AgentFlowNodeCard';
import {
  AgentFlowCustomEdge,
  type AgentFlowCanvasEdge
} from './custom-edge';

export interface AgentFlowCanvasNodeData extends Record<string, unknown> {
  nodeId: string;
  nodeType: FlowNodeType;
  nodeSchema: CanvasNodeSchema;
  typeLabel: string;
  alias: string;
  description?: string;
  config: Record<string, unknown>;
  issueCount: number;
  canEnterContainer: boolean;
  pickerOpen: boolean;
  showTargetHandle: boolean;
  showSourceHandle: boolean;
  isContainer: boolean;
  onOpenPicker: (nodeId: string) => void;
  onClosePicker: () => void;
  onOpenContainer: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onInsertNode: (targetId: string, nodeType: FlowNodeType) => void;
}

export type AgentFlowCanvasNode = Node<AgentFlowCanvasNodeData, 'agentFlowNode'>;
export type { AgentFlowCanvasEdge };

export const agentFlowNodeTypes: NodeTypes = {
  agentFlowNode: AgentFlowNodeCard
};

export const agentFlowEdgeTypes: EdgeTypes = {
  agentFlowEdge: AgentFlowCustomEdge
};
