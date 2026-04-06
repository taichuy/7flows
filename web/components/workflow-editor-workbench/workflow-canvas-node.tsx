"use client";

import { useMemo, type CSSProperties } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { RunDetail } from "@/lib/get-run-detail";
import type { RunTrace } from "@/lib/get-run-trace";
import { formatDurationMs } from "@/lib/runtime-presenters";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import {
  WorkflowCanvasQuickAddTrigger,
  type WorkflowCanvasQuickAddOption
} from "@/components/workflow-editor-workbench/workflow-canvas-quick-add";

export function nodeColorByType(type: string) {
  switch (type) {
    case "trigger":
      return "#216e4a";
    case "output":
      return "#d0632d";
    case "tool":
      return "#2f6ca3";
    case "sandbox_code":
      return "#b45309";
    case "condition":
    case "router":
      return "#8b5cf6";
    case "mcp_query":
      return "#0f766e";
    default:
      return "#62574a";
  }
}

export function applyRunOverlayToNodes(
  nodes: Array<Node<WorkflowCanvasNodeData>>,
  run: RunDetail | null,
  trace: RunTrace | null
) {
  if (!run) {
    return nodes;
  }

  const eventCountByNodeRunId = new Map<string, number>();
  const lastEventTypeByNodeRunId = new Map<string, string>();

  trace?.events.forEach((event) => {
    if (!event.node_run_id) {
      return;
    }
    eventCountByNodeRunId.set(
      event.node_run_id,
      (eventCountByNodeRunId.get(event.node_run_id) ?? 0) + 1
    );
    lastEventTypeByNodeRunId.set(event.node_run_id, event.event_type);
  });

  return nodes.map((node) => {
    const nodeRun = run.node_runs.find((item) => item.node_id === node.id) ?? null;
    if (!nodeRun) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        runStatus: nodeRun.status,
        runNodeId: nodeRun.id,
        runDurationMs: calculateDurationMs(nodeRun.started_at, nodeRun.finished_at),
        runErrorMessage: nodeRun.error_message ?? null,
        runLastEventType: lastEventTypeByNodeRunId.get(nodeRun.id),
        runEventCount: eventCountByNodeRunId.get(nodeRun.id) ?? 0
      }
    };
  });
}

type WorkflowCanvasNodeComponentProps = NodeProps<Node<WorkflowCanvasNodeData>> & {
  onQuickAdd?: (sourceNodeId: string, type: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  quickAddOptions?: WorkflowCanvasQuickAddOption[];
};

export function WorkflowCanvasNode({
  id,
  data,
  selected,
  onQuickAdd,
  onDeleteNode,
  quickAddOptions = []
}: WorkflowCanvasNodeComponentProps) {
  const canQuickAdd = Boolean(selected && onQuickAdd && data.nodeType !== "output");
  const canDelete = data.nodeType !== "trigger";
  const resolvedQuickAddOptions = useMemo(
    () => quickAddOptions.filter((item) => item.type !== "trigger"),
    [quickAddOptions]
  );

  return (
    <div
      className={`workflow-canvas-node ${selected ? "selected" : ""} ${
        data.runStatus ? `runtime-${toCssIdentifier(data.runStatus)}` : ""
      }`}
      style={
        {
          "--node-accent": nodeColorByType(data.nodeType)
        } as CSSProperties
      }
    >
      <Handle type="target" position={Position.Left} />
      {selected && canDelete ? (
        <div className="workflow-canvas-node-actions">
          <button
            className="workflow-canvas-node-action-button danger"
            type="button"
            aria-label={`删除 ${data.label}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDeleteNode?.(id);
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className="workflow-canvas-node-head">
        <div className="workflow-canvas-node-icon" aria-hidden="true">
          {resolveNodeGlyph(data.nodeType)}
        </div>
        <div className="workflow-canvas-node-head-copy">
          <div className="workflow-canvas-node-title-row">
            <div className="workflow-canvas-node-label">{data.label}</div>
            <span className="workflow-canvas-node-kind">{data.typeLabel ?? data.nodeType}</span>
          </div>
          <div className="workflow-canvas-node-type">
            {formatNodeMeta(data.capabilityGroup, data.nodeType)}
          </div>
        </div>
      </div>
      {data.typeDescription ? (
        <div className="workflow-canvas-node-description">{data.typeDescription}</div>
      ) : null}
      {canQuickAdd ? (
        <WorkflowCanvasQuickAddTrigger
          quickAddOptions={resolvedQuickAddOptions}
          triggerAriaLabel={`${data.label} 后添加节点`}
          menuTitle="添加下一个节点"
          menuDescription="直接插入当前节点后方，并自动续上主链。"
          containerClassName="workflow-canvas-node-quick-add"
          triggerClassName="workflow-canvas-node-quick-add-trigger"
          menuClassName="workflow-canvas-node-quick-menu"
          onQuickAdd={(type) => onQuickAdd?.(id, type)}
        />
      ) : null}
      {data.runStatus ? (
        <div className="workflow-canvas-node-runtime">
          <span className={`health-pill ${data.runStatus}`}>{data.runStatus}</span>
          <div className="workflow-canvas-node-runtime-meta">
            {data.runLastEventType ? (
              <span className="workflow-canvas-node-meta">{data.runLastEventType}</span>
            ) : null}
            {typeof data.runDurationMs === "number" ? (
              <span className="workflow-canvas-node-meta">
                {formatDurationMs(data.runDurationMs)}
              </span>
            ) : null}
            {typeof data.runEventCount === "number" && data.runEventCount > 0 ? (
              <span className="workflow-canvas-node-meta">
                {data.runEventCount} events
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {data.runErrorMessage ? (
        <div className="workflow-canvas-node-error">{data.runErrorMessage}</div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function calculateDurationMs(
  startedAt?: string | null,
  finishedAt?: string | null
) {
  if (!startedAt) {
    return undefined;
  }

  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return undefined;
  }

  return Math.max(0, end - start);
}

function toCssIdentifier(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
}

function resolveNodeGlyph(nodeType: string) {
  switch (nodeType) {
    case "trigger":
      return "入";
    case "output":
      return "出";
    case "llm_agent":
      return "AI";
    case "tool":
      return "工";
    case "sandbox_code":
      return "码";
    case "mcp_query":
      return "M";
    default:
      return "节";
  }
}

function formatNodeMeta(capabilityGroup: string | undefined, nodeType: string) {
  const groupLabel = capabilityGroup
    ? capabilityGroup.replace(/_/g, " ")
    : "workflow";

  return `${groupLabel} · ${nodeType}`;
}
