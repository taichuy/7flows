"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps
} from "@xyflow/react";

import type { WorkflowCanvasEdgeData } from "@/lib/workflow-editor";
import {
  WorkflowCanvasQuickAddTrigger,
  type WorkflowCanvasQuickAddOption
} from "@/components/workflow-editor-workbench/workflow-canvas-quick-add";

type WorkflowCanvasEdgeComponentProps = EdgeProps<Edge<WorkflowCanvasEdgeData>> & {
  onQuickAdd?: (sourceNodeId: string, sourceEdgeId: string, type: string) => void;
  quickAddOptions?: WorkflowCanvasQuickAddOption[];
};

export function WorkflowCanvasEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
  markerEnd,
  style,
  quickAddOptions = [],
  onQuickAdd
}: WorkflowCanvasEdgeComponentProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });
  const isControlEdge = data?.channel !== "data";
  const hasLabel =
    (typeof label === "string" && Boolean(label.trim())) || typeof label === "number";
  const triggerY = hasLabel ? labelY - 24 : labelY;
  const [isQuickAddVisible, setIsQuickAddVisible] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const showQuickAdd = () => {
    clearHideTimer();
    setIsQuickAddVisible(true);
  };

  const scheduleHideQuickAdd = () => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setIsQuickAddVisible(false);
      hideTimerRef.current = null;
    }, 100);
  };

  useEffect(
    () => () => {
      clearHideTimer();
    },
    []
  );

  const handleEdgeLeave = (event: ReactMouseEvent<SVGPathElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && shellRef.current?.contains(nextTarget)) {
      return;
    }

    scheduleHideQuickAdd();
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        label={label}
        labelX={labelX}
        labelY={labelY}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={28}
      />
      {isControlEdge ? (
        <path
          className="workflow-canvas-edge-hover-target"
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={28}
          pointerEvents="stroke"
          onMouseEnter={showQuickAdd}
          onMouseLeave={handleEdgeLeave}
        />
      ) : null}
      {isControlEdge && onQuickAdd ? (
        <EdgeLabelRenderer>
          <div
            ref={shellRef}
            className={`workflow-canvas-edge-quick-add-shell ${
              isQuickAddVisible ? "visible" : ""
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${triggerY}px)`
            }}
            onPointerEnter={showQuickAdd}
            onPointerLeave={scheduleHideQuickAdd}
          >
            <WorkflowCanvasQuickAddTrigger
              quickAddOptions={quickAddOptions}
              triggerAriaLabel="在连线中间插入节点"
              menuTitle="插入节点"
              menuDescription="插入到当前连线中间，并自动续上主链。"
              containerClassName="workflow-canvas-edge-quick-add"
              triggerClassName="workflow-canvas-edge-quick-add-trigger"
              menuClassName="workflow-canvas-edge-quick-menu"
              onOpenChange={(open) => {
                if (open) {
                  showQuickAdd();
                  return;
                }

                scheduleHideQuickAdd();
              }}
              onQuickAdd={(type) => onQuickAdd(source, id, type)}
            />
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
