import type { FlowNodeType } from '@1flowbase/flow-schema';
import type { EdgeTypes, Node, NodeProps, NodeTypes } from '@xyflow/react';

import type { CanvasNodeSchema } from '../../../../shared/schema-ui/contracts/canvas-node-schema';
import type { NodePickerOption } from '../../lib/plugin-node-definitions';
import { AgentFlowNodeCard } from '../nodes/AgentFlowNodeCard';
import { AgentFlowCustomEdge, type AgentFlowCanvasEdge } from './custom-edge';

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
  nodePickerOptions: NodePickerOption[];
  onOpenPicker: (nodeId: string) => void;
  onClosePicker: () => void;
  onOpenContainer: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onInsertNode: (targetId: string, option: NodePickerOption) => void;
  onRunNode: (nodeId: string) => void;
  onReplaceNode: (targetId: string, option: NodePickerOption) => void;
  onDeleteNode: (nodeId: string) => void;
}

export type AgentFlowCanvasNode = Node<
  AgentFlowCanvasNodeData,
  'agentFlowNode'
>;

export interface AgentFlowBoundaryNodeData extends Record<string, unknown> {
  boundaryKind: 'start' | 'end';
  label: string;
}

export type AgentFlowBoundaryNode = Node<
  AgentFlowBoundaryNodeData,
  'agentFlowBoundaryNode'
>;

function AgentFlowBoundaryNodeCard({
  data
}: NodeProps<AgentFlowBoundaryNode>) {
  return (
    <div
      aria-label={`容器${data.label}节点`}
      className={`agent-flow-container-boundary agent-flow-container-boundary--${data.boundaryKind}`}
      role="img"
    >
      <span className="agent-flow-container-boundary__dot" />
      <span className="agent-flow-container-boundary__label">{data.label}</span>
    </div>
  );
}

export type { AgentFlowCanvasEdge };

export const agentFlowNodeTypes: NodeTypes = {
  agentFlowNode: AgentFlowNodeCard,
  agentFlowBoundaryNode: AgentFlowBoundaryNodeCard
};

export const agentFlowEdgeTypes: EdgeTypes = {
  agentFlowEdge: AgentFlowCustomEdge
};
