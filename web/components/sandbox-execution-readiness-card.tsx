import React from "react";

import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildSandboxExecutionReadinessInsight } from "@/lib/sandbox-readiness-presenters";
import type { RunExecutionNodeItem } from "@/lib/get-run-views";

type SandboxExecutionReadinessCardProps = {
  readiness?: SandboxReadinessCheck | null;
  node: {
    node_type: RunExecutionNodeItem["node_type"];
    execution_class?: RunExecutionNodeItem["execution_class"] | null;
    requested_execution_class?: RunExecutionNodeItem["requested_execution_class"] | null;
    effective_execution_class?: RunExecutionNodeItem["effective_execution_class"] | null;
    execution_blocking_reason?: RunExecutionNodeItem["execution_blocking_reason"] | null;
    execution_sandbox_backend_id?: RunExecutionNodeItem["execution_sandbox_backend_id"] | null;
    execution_blocked_count?: number;
    execution_unavailable_count?: number;
  };
  title?: string;
};

export function SandboxExecutionReadinessCard({
  readiness,
  node,
  title = "Live sandbox readiness"
}: SandboxExecutionReadinessCardProps) {
  if (!readiness) {
    return null;
  }

  const insight = buildSandboxExecutionReadinessInsight(readiness, node);
  if (!insight) {
    return null;
  }

  return (
    <article className="payload-card compact-card">
      <div className="payload-card-header">
        <span className="status-meta">{title}</span>
        <span
          className={`event-chip ${
            insight.status === "blocked"
              ? "trace-export-blocked"
              : insight.status === "tool_capability_missing"
                ? "pending"
                : "healthy"
          }`}
        >
          {insight.executionClass}
        </span>
      </div>
      <p className="section-copy entry-copy">{insight.headline}</p>
      {insight.detail ? <p className="binding-meta">{insight.detail}</p> : null}
      {insight.chips.length > 0 ? (
        <div className="tool-badge-row">
          {insight.chips.map((chip) => (
            <span className="event-chip" key={`${insight.executionClass}-${chip}`}>
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
