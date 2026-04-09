"use client";

import { useMemo } from "react";
import { type Node, type NodeProps } from "@xyflow/react";

import type { RunDetail } from "@/lib/get-run-detail";
import type { RunTrace } from "@/lib/get-run-trace";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import { formatWorkflowNodeMeta } from "@/lib/workflow-node-display";
import { WorkflowNodeCardShell } from "@/components/workflow-editor-workbench/workflow-node-card-shell";
import type { WorkflowCanvasQuickAddOption } from "@/components/workflow-editor-workbench/workflow-canvas-quick-add";

export function nodeColorByType(type: string) {
  switch (type) {
    case "startNode":
      return "#216e4a";
    case "endNode":
      return "#d0632d";
    case "toolNode":
      return "#2f6ca3";
    case "sandboxCodeNode":
      return "#b45309";
    case "conditionNode":
    case "routerNode":
      return "#8b5cf6";
    case "mcpQueryNode":
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
  onOpenRuntime?: (nodeId: string) => void;
  quickAddOptions?: WorkflowCanvasQuickAddOption[];
};

export function WorkflowCanvasNode({
  id,
  data,
  selected,
  onQuickAdd,
  onDeleteNode,
  onOpenRuntime,
  quickAddOptions = []
}: WorkflowCanvasNodeComponentProps) {
  const canQuickAdd = Boolean(selected && onQuickAdd && data.nodeType !== "endNode");
  const canDelete = data.nodeType !== "startNode";
  const hasIncomingHandle = data.nodeType !== "startNode";
  const hasOutgoingHandle = data.nodeType !== "endNode";
  const nodeDescription = resolveNodeDescription(data.nodeType, data.config);
  const resolvedQuickAddOptions = useMemo(
    () => quickAddOptions.filter((item) => item.type !== "startNode"),
    [quickAddOptions]
  );

  return (
    <WorkflowNodeCardShell
      id={id}
      selected={selected}
      label={data.label}
      typeLabel={data.typeLabel ?? data.nodeType}
      meta={formatWorkflowNodeMeta(data.capabilityGroup, data.nodeType, data.typeLabel)}
      glyph={resolveNodeGlyph(data.nodeType)}
      accentColor={nodeColorByType(data.nodeType)}
      description={nodeDescription}
      runtimeClassName={data.runStatus ? `runtime-${toCssIdentifier(data.runStatus)}` : ""}
      hasIncomingHandle={hasIncomingHandle}
      hasOutgoingHandle={hasOutgoingHandle}
      canDelete={canDelete}
      canQuickAdd={canQuickAdd}
      canOpenRuntime={Boolean(onOpenRuntime)}
      quickAddOptions={resolvedQuickAddOptions}
      onQuickAdd={onQuickAdd}
      onDeleteNode={onDeleteNode}
      onOpenRuntime={onOpenRuntime}
    />
  );
}

function resolveNodeDescription(
  nodeType: string,
  config: WorkflowCanvasNodeData["config"]
) {
  const ui = isRecord(config.ui) ? config.ui : null;
  const description = typeof ui?.description === "string" ? ui.description.trim() : "";
  if (description) {
    return description;
  }

  if (nodeType !== "endNode") {
    return null;
  }

  const replyTemplate = typeof config.replyTemplate === "string" ? config.replyTemplate.trim() : "";
  if (!replyTemplate) {
    return null;
  }

  const compactReply = replyTemplate.replace(/\s+/g, " ").trim();
  if (!compactReply) {
    return null;
  }

  return compactReply.length <= 80 ? compactReply : `${compactReply.slice(0, 77)}...`;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveNodeGlyph(nodeType: string) {
  switch (nodeType) {
    case "startNode":
      return "入";
    case "endNode":
      return "出";
    case "llmAgentNode":
      return "AI";
    case "toolNode":
      return "工";
    case "sandboxCodeNode":
      return "码";
    case "mcpQueryNode":
      return "M";
    default:
      return "节";
  }
}
