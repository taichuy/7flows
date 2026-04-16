import type { FlowNodeType } from '@1flowse/flow-schema';
import { EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { useState } from 'react';

import { EdgeInsertButton } from './EdgeInsertButton';

export interface AgentFlowCanvasEdgeData extends Record<string, unknown> {
  onInsertNode?: (edgeId: string, nodeType: FlowNodeType) => void;
}

export type AgentFlowCanvasEdge = Edge<
  AgentFlowCanvasEdgeData,
  'agentFlowEdge'
>;

export function AgentFlowCustomEdge(props: EdgeProps<AgentFlowCanvasEdge>) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style,
    markerEnd,
    data,
    selected
  } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const shouldShowButton = isHovered || pickerOpen || selected;

  return (
    <g
      className="agent-flow-edge"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <path
        className="react-flow__edge-interaction"
        d={edgePath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
      />
      <path
        id={id}
        style={{
          ...style,
          stroke: selected ? '#1677ff' : (style?.stroke || '#cbd5e1'),
          strokeWidth: selected ? 3 : (style?.strokeWidth || 2)
        }}
        className="react-flow__edge-path agent-flow-custom-edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          className="agent-flow-edge-label-container"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 20,
            opacity: shouldShowButton ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out',
            boxShadow: selected
              ? '0 0 0 2px rgba(22, 119, 255, 0.18), 0 2px 8px rgba(22, 119, 255, 0.16)'
              : undefined
          }}
        >
          <div className="agent-flow-edge-add-button-wrapper">
            <EdgeInsertButton
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onPickNode={(nodeType) => {
                data?.onInsertNode?.(id, nodeType);
                setPickerOpen(false);
              }}
            />
          </div>
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
