"use client";

import React, { useEffect, useRef } from "react";
import type { Node } from "@xyflow/react";

import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import {
  MCP_EXTRA_ARTIFACT_TYPES,
  type ReadableArtifactRef
} from "@/components/workflow-node-config-form/shared";

type AuthorizedContextFieldsProps = {
  nodeId: string;
  availableNodes: Array<Node<WorkflowCanvasNodeData>>;
  readableNodeIds: string[];
  readableArtifacts: ReadableArtifactRef[];
  onToggleReadableNode: (nodeId: string, checked: boolean) => void;
  onToggleReadableArtifact: (
    nodeId: string,
    artifactType: string,
    checked: boolean
  ) => void;
  readableNodesLabel: string;
  readableNodesHint: string;
  highlightedFieldKey?: string | null;
};

export function AuthorizedContextFields({
  nodeId,
  availableNodes,
  readableNodeIds,
  readableArtifacts,
  onToggleReadableNode,
  onToggleReadableArtifact,
  readableNodesLabel,
  readableNodesHint,
  highlightedFieldKey = null
}: AuthorizedContextFieldsProps) {
  const readableNodesRef = useRef<HTMLDivElement | null>(null);
  const readableArtifactsRef = useRef<HTMLDivElement | null>(null);
  const highlightNodes = highlightedFieldKey === "contextAccess.readableNodeIds";
  const highlightArtifacts = highlightedFieldKey === "contextAccess.readableArtifacts";

  useEffect(() => {
    if (!highlightedFieldKey) {
      return;
    }
    const container =
      highlightedFieldKey === "contextAccess.readableArtifacts"
        ? readableArtifactsRef.current
        : readableNodesRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-validation-field="${highlightedFieldKey}"] input, ` +
        `[data-validation-field="${highlightedFieldKey}"] textarea`
    );
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.focus();
    }
  }, [highlightedFieldKey]);

  return (
    <>
      <div
        className={`binding-field ${highlightNodes ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="contextAccess.readableNodeIds"
        ref={readableNodesRef}
      >
        <span className="binding-label">{readableNodesLabel}</span>
        {availableNodes.length === 0 ? (
          <p className="empty-state compact">当前画布没有可授权的其他节点。</p>
        ) : (
          <div className="tool-badge-row">
            {availableNodes.map((candidate) => {
              const checked = readableNodeIds.includes(candidate.id);
              return (
                <label key={`${nodeId}-readable-${candidate.id}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      onToggleReadableNode(candidate.id, event.target.checked)
                    }
                  />{" "}
                  {candidate.data.label}
                </label>
              );
            })}
          </div>
        )}
        <small className="section-copy">{readableNodesHint}</small>
      </div>

      {readableNodeIds.length > 0 ? (
        <div
          className={`binding-field ${highlightArtifacts ? "validation-focus-ring" : ""}`.trim()}
          data-validation-field="contextAccess.readableArtifacts"
          ref={readableArtifactsRef}
        >
          <span className="binding-label">Extra artifact grants</span>
          {readableNodeIds.map((candidateId) => {
            const relatedNode =
              availableNodes.find((candidate) => candidate.id === candidateId) ?? null;
            return (
              <div
                className="payload-card compact-card"
                key={`${nodeId}-artifact-${candidateId}`}
              >
                <div className="payload-card-header">
                  <span className="status-meta">
                    {relatedNode?.data.label ?? candidateId} · extra artifacts
                  </span>
                </div>
                <div className="tool-badge-row">
                  {MCP_EXTRA_ARTIFACT_TYPES.map((artifactType) => (
                    <label key={`${candidateId}-${artifactType}`}>
                      <input
                        type="checkbox"
                        checked={readableArtifacts.some(
                          (artifact) =>
                            artifact.nodeId === candidateId &&
                            artifact.artifactType === artifactType
                        )}
                        onChange={(event) =>
                          onToggleReadableArtifact(
                            candidateId,
                            artifactType,
                            event.target.checked
                          )
                        }
                      />{" "}
                      {artifactType}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <small className="section-copy">
            `readableNodeIds` 已默认授予 `json`，这里只补充 `text/file/tool_result/message`
            等额外授权。
          </small>
        </div>
      ) : null}
    </>
  );
}
