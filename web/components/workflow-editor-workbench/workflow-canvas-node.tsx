"use client";

import type { CSSProperties } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import type { RunDetail } from "@/lib/get-run-detail";
import type { RunTrace } from "@/lib/get-run-trace";
import { formatDurationMs } from "@/lib/runtime-presenters";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";

export const WORKFLOW_EDITOR_NODE_TYPES = {
  workflowNode: WorkflowCanvasNode
};

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

function WorkflowCanvasNode({
  data,
  selected
}: NodeProps<Node<WorkflowCanvasNodeData>>) {
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
      <div className="workflow-canvas-node-label">{data.label}</div>
      <div className="workflow-canvas-node-type">{data.nodeType}</div>
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
