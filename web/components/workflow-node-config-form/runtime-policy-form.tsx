"use client";

import React from "react";
import type { Edge, Node } from "@xyflow/react";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import {
  cloneRecord,
  dedupeStrings,
  parseNumericFieldValue,
  toRecord,
  toStringArray
} from "@/components/workflow-node-config-form/shared";
import {
  commitRuntimePolicy,
  normalizeRuntimePolicy
} from "@/components/workflow-node-config-form/runtime-policy-helpers";
import { WorkflowNodeRuntimePolicyExecutionSection } from "@/components/workflow-node-config-form/runtime-policy-execution-section";

type WorkflowNodeRuntimePolicyFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  currentHref?: string | null;
  onChange: (nextRuntimePolicy: Record<string, unknown> | undefined) => void;
  highlighted?: boolean;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

const JOIN_MODES = ["any", "all"] as const;
const JOIN_ON_UNMET_OPTIONS = ["skip", "fail"] as const;
const JOIN_MERGE_STRATEGIES = ["error", "overwrite", "keep_first", "append"] as const;

export function WorkflowNodeRuntimePolicyForm({
  node,
  nodes,
  edges,
  currentHref = null,
  onChange,
  highlighted = false,
  highlightedFieldPath = null,
  focusedValidationItem = null,
  sandboxReadiness = null
}: WorkflowNodeRuntimePolicyFormProps) {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const runtimePolicy = cloneRecord(node.data.runtimePolicy ?? {});
  const retry = readRetryPolicy(runtimePolicy);
  const join = toRecord(runtimePolicy.join);
  const normalizedHighlightedField = normalizeRuntimePolicyFieldKey(highlightedFieldPath);
  const incomingNodes = listIncomingNodes(node.id, nodes, edges);
  const joinSupported = node.data.nodeType !== "trigger" && incomingNodes.length > 0;
  const joinEnabled = joinSupported && Boolean(join);
  const requiredNodeIds = dedupeStrings(toStringArray(join?.requiredNodeIds)).filter((nodeId) =>
    incomingNodes.some((candidate) => candidate.id === nodeId)
  );
  const joinMode = typeof join?.mode === "string" ? join.mode : "any";
  const joinOnUnmet = typeof join?.onUnmet === "string" ? join.onUnmet : "skip";
  const joinMergeStrategy =
    typeof join?.mergeStrategy === "string" ? join.mergeStrategy : "error";
  const showRuntimePolicyRemediation =
    Boolean(focusedValidationItem && normalizedHighlightedField) &&
    !normalizedHighlightedField?.startsWith("execution.");
  const retryHighlighted =
    normalizedHighlightedField === "retry" || normalizedHighlightedField?.startsWith("retry.");
  const joinHighlighted =
    normalizedHighlightedField === "join" || normalizedHighlightedField?.startsWith("join.");

  React.useEffect(() => {
    if (!normalizedHighlightedField) {
      return;
    }

    const targetContainer = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${normalizedHighlightedField}"]`
    );
    const target =
      targetContainer?.querySelector<HTMLElement>("input, select, textarea") ?? targetContainer;

    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus();
  }, [normalizedHighlightedField, joinEnabled, joinMode, joinSupported]);

  const updateRetryField = (
    field: "maxAttempts" | "backoffSeconds" | "backoffMultiplier",
    value: number | undefined
  ) => {
    const nextPolicy = normalizeRuntimePolicy(runtimePolicy);
    const nextRetry = readRetryPolicy(nextPolicy);

    if (value === undefined) {
      delete nextRetry[field];
    } else {
      nextRetry[field] = value;
    }

    if (Object.keys(nextRetry).length === 0) {
      delete nextPolicy.retry;
    } else {
      nextPolicy.retry = nextRetry;
    }

    commitRuntimePolicy(nextPolicy, onChange);
  };

  const toggleJoinEnabled = (checked: boolean) => {
    const nextPolicy = normalizeRuntimePolicy(runtimePolicy);
    if (!checked) {
      delete nextPolicy.join;
      commitRuntimePolicy(nextPolicy, onChange);
      return;
    }

    nextPolicy.join = {
      mode: "any",
      onUnmet: "skip",
      mergeStrategy: "error"
    };
    commitRuntimePolicy(nextPolicy, onChange);
  };

  const updateJoinField = (
    field: "mode" | "onUnmet" | "mergeStrategy",
    value: string
  ) => {
    const nextPolicy = normalizeRuntimePolicy(runtimePolicy);
    const nextJoin = cloneRecord(toRecord(nextPolicy.join) ?? {});
    nextJoin[field] = value;
    nextPolicy.join = nextJoin;
    commitRuntimePolicy(nextPolicy, onChange);
  };

  const toggleRequiredNode = (nodeId: string) => {
    const nextPolicy = normalizeRuntimePolicy(runtimePolicy);
    const nextJoin = cloneRecord(toRecord(nextPolicy.join) ?? {});
    const nextRequiredNodeIds = requiredNodeIds.includes(nodeId)
      ? requiredNodeIds.filter((candidateId) => candidateId !== nodeId)
      : [...requiredNodeIds, nodeId];

    if (nextRequiredNodeIds.length === 0) {
      delete nextJoin.requiredNodeIds;
    } else {
      nextJoin.requiredNodeIds = dedupeStrings(nextRequiredNodeIds);
    }

    nextPolicy.join = nextJoin;
    commitRuntimePolicy(nextPolicy, onChange);
  };

  return (
    <div
      ref={sectionRef}
      className={`binding-form compact-stack ${highlighted ? "validation-focus-ring" : ""}`.trim()}
    >
      <div className="binding-field">
        <span className="binding-label">Runtime policy</span>
        <small className="section-copy">
          把执行边界、重试与 join 策略从纯 JSON 提升为结构化配置，减少图编辑阶段的语义误填。
        </small>
      </div>

      {showRuntimePolicyRemediation && focusedValidationItem ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={focusedValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <WorkflowNodeRuntimePolicyExecutionSection
        nodeId={node.id}
        nodeType={node.data.nodeType}
        runtimePolicy={runtimePolicy}
        currentHref={currentHref}
        onChange={onChange}
        highlightedFieldPath={highlightedFieldPath}
        focusedValidationItem={focusedValidationItem}
        sandboxReadiness={sandboxReadiness}
      />

      <div
        className={`binding-field compact-stack ${retryHighlighted ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="retry"
      >
        <span className="binding-label">Retry policy</span>
        <label
          className={`binding-field ${normalizedHighlightedField === "retry.maxAttempts" ? "validation-focus-ring" : ""}`.trim()}
          data-validation-field="retry.maxAttempts"
        >
          <span className="binding-label">Max attempts</span>
          <input
            className="trace-text-input"
            type="number"
            min={1}
            step={1}
            value={typeof retry.maxAttempts === "number" ? String(retry.maxAttempts) : ""}
            onChange={(event) =>
              updateRetryField("maxAttempts", parseNumericFieldValue(event.target.value))
            }
            placeholder="默认 1"
          />
        </label>

        <label
          className={`binding-field ${normalizedHighlightedField === "retry.backoffSeconds" ? "validation-focus-ring" : ""}`.trim()}
          data-validation-field="retry.backoffSeconds"
        >
          <span className="binding-label">Backoff seconds</span>
          <input
            className="trace-text-input"
            type="number"
            min={0}
            step={0.1}
            value={
              typeof retry.backoffSeconds === "number" ? String(retry.backoffSeconds) : ""
            }
            onChange={(event) =>
              updateRetryField("backoffSeconds", parseNumericFieldValue(event.target.value))
            }
            placeholder="默认 0"
          />
        </label>

        <label
          className={`binding-field ${normalizedHighlightedField === "retry.backoffMultiplier" ? "validation-focus-ring" : ""}`.trim()}
          data-validation-field="retry.backoffMultiplier"
        >
          <span className="binding-label">Backoff multiplier</span>
          <input
            className="trace-text-input"
            type="number"
            min={1}
            step={0.1}
            value={
              typeof retry.backoffMultiplier === "number"
                ? String(retry.backoffMultiplier)
                : ""
            }
            onChange={(event) =>
              updateRetryField("backoffMultiplier", parseNumericFieldValue(event.target.value))
            }
            placeholder="默认 1"
          />
        </label>

        <small className="section-copy">
          未填写时沿用默认值；表单会统一写回 `runtimePolicy.retry`，顺手消化旧的平铺重试字段。
        </small>
      </div>

      <div
        className={`binding-field compact-stack ${joinHighlighted ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="join"
      >
        <span className="binding-label">Join policy</span>

        {joinSupported ? (
          <>
            <label
              className={normalizedHighlightedField === "join" ? "validation-focus-ring" : undefined}
            >
              <input
                type="checkbox"
                checked={joinEnabled}
                onChange={(event) => toggleJoinEnabled(event.target.checked)}
              />{" "}
              enable join gate
            </label>

            {joinEnabled ? (
              <>
                <label
                  className={`binding-field ${normalizedHighlightedField === "join.mode" ? "validation-focus-ring" : ""}`.trim()}
                  data-validation-field="join.mode"
                >
                  <span className="binding-label">Mode</span>
                  <select
                    className="binding-select"
                    value={joinMode}
                    onChange={(event) => updateJoinField("mode", event.target.value)}
                  >
                    {JOIN_MODES.map((mode) => (
                      <option key={`${node.id}-join-mode-${mode}`} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  className={`binding-field ${normalizedHighlightedField === "join.onUnmet" ? "validation-focus-ring" : ""}`.trim()}
                  data-validation-field="join.onUnmet"
                >
                  <span className="binding-label">On unmet</span>
                  <select
                    className="binding-select"
                    value={joinOnUnmet}
                    onChange={(event) => updateJoinField("onUnmet", event.target.value)}
                  >
                    {JOIN_ON_UNMET_OPTIONS.map((option) => (
                      <option key={`${node.id}-join-on-unmet-${option}`} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  className={`binding-field ${normalizedHighlightedField === "join.mergeStrategy" ? "validation-focus-ring" : ""}`.trim()}
                  data-validation-field="join.mergeStrategy"
                >
                  <span className="binding-label">Merge strategy</span>
                  <select
                    className="binding-select"
                    value={joinMergeStrategy}
                    onChange={(event) => updateJoinField("mergeStrategy", event.target.value)}
                  >
                    {JOIN_MERGE_STRATEGIES.map((strategy) => (
                      <option key={`${node.id}-join-merge-${strategy}`} value={strategy}>
                        {strategy}
                      </option>
                    ))}
                  </select>
                </label>

                {joinMode === "all" ? (
                  <div
                    className={`binding-field compact-stack ${normalizedHighlightedField === "join.requiredNodeIds" ? "validation-focus-ring" : ""}`.trim()}
                    data-validation-field="join.requiredNodeIds"
                  >
                    <span className="binding-label">Required upstream nodes</span>
                    <small className="section-copy">
                      不勾选时默认等待全部入边来源；只在 `all` 模式下生效。
                    </small>
                    <div className="tool-badge-row">
                      {incomingNodes.map((incomingNode) => (
                        <label key={`${node.id}-join-source-${incomingNode.id}`}>
                          <input
                            type="checkbox"
                            checked={requiredNodeIds.includes(incomingNode.id)}
                            onChange={() => toggleRequiredNode(incomingNode.id)}
                          />{" "}
                          {incomingNode.data.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <small className="section-copy">
                    `any` 模式只看是否有任一激活入边到达当前节点，不额外消费 `requiredNodeIds`。
                  </small>
                )}
              </>
            ) : null}
          </>
        ) : node.data.nodeType === "trigger" ? (
          <small className="section-copy">
            Trigger 没有上游入边，不支持 `runtimePolicy.join`。
          </small>
        ) : (
          <small className="section-copy">
            当前节点还没有任何入边；等画布连线稳定后，再决定是否增加 join gate。
          </small>
        )}
      </div>
    </div>
  );
}

function normalizeRuntimePolicyFieldKey(fieldPath?: string | null) {
  const normalized = fieldPath?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "runtimePolicy.retry") {
    return "retry";
  }

  if (normalized.startsWith("runtimePolicy.retry.")) {
    return normalized.replace(/^runtimePolicy\./, "");
  }

  if (normalized === "runtimePolicy.join") {
    return "join";
  }

  if (normalized.startsWith("runtimePolicy.join.")) {
    return normalized.replace(/^runtimePolicy\./, "");
  }

  return null;
}

function readRetryPolicy(runtimePolicy: Record<string, unknown>) {
  const nestedRetry = toRecord(runtimePolicy.retry);
  if (nestedRetry) {
    return cloneRecord(nestedRetry);
  }

  const legacyRetry: Record<string, unknown> = {};
  if (typeof runtimePolicy.maxAttempts === "number") {
    legacyRetry.maxAttempts = runtimePolicy.maxAttempts;
  }
  if (typeof runtimePolicy.backoffSeconds === "number") {
    legacyRetry.backoffSeconds = runtimePolicy.backoffSeconds;
  }
  if (typeof runtimePolicy.backoffMultiplier === "number") {
    legacyRetry.backoffMultiplier = runtimePolicy.backoffMultiplier;
  }
  return legacyRetry;
}

function listIncomingNodes(
  nodeId: string,
  nodes: Array<Node<WorkflowCanvasNodeData>>,
  edges: Array<Edge<WorkflowCanvasEdgeData>>
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();

  return edges
    .filter((edge) => edge.target === nodeId)
    .flatMap((edge) => {
      const incomingNode = nodesById.get(edge.source);
      if (!incomingNode || seen.has(incomingNode.id)) {
        return [];
      }
      seen.add(incomingNode.id);
      return [incomingNode];
    })
    .sort((left, right) => left.data.label.localeCompare(right.data.label));
}
