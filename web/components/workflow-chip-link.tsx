import Link from "next/link";

import type { WorkflowListItem } from "@/lib/get-workflows";
import {
  getWorkflowLegacyPublishAuthBacklogCount,
  getWorkflowLegacyPublishAuthStatusLabel,
  formatWorkflowMissingToolSummary,
  hasWorkflowMissingToolIssues
} from "@/lib/workflow-definition-governance";

type WorkflowChipLinkProps = {
  workflow: WorkflowListItem;
  href: string;
  selected?: boolean;
};

export function WorkflowChipLink({
  workflow,
  href,
  selected = false
}: WorkflowChipLinkProps) {
  const missingToolSummary = formatWorkflowMissingToolSummary(workflow);
  const hasMissingToolIssues = hasWorkflowMissingToolIssues(workflow);
  const governedToolCount = workflow.tool_governance?.governed_tool_count ?? 0;
  const strongIsolationToolCount = workflow.tool_governance?.strong_isolation_tool_count ?? 0;
  const legacyPublishAuthBacklogCount = getWorkflowLegacyPublishAuthBacklogCount(workflow);
  const legacyPublishAuthStatusLabel = getWorkflowLegacyPublishAuthStatusLabel(workflow);

  return (
    <Link className={`workflow-chip ${selected ? "selected" : ""}`} href={href}>
      <strong className="workflow-chip-title">{workflow.name}</strong>
      <small>
        {workflow.version} · {workflow.status}
      </small>
      <small>
        {workflow.node_count} nodes · {governedToolCount} governed tools · {strongIsolationToolCount} strong isolation
      </small>
      {legacyPublishAuthBacklogCount > 0 ? (
        <small>
          {legacyPublishAuthBacklogCount} legacy auth cleanup item
          {legacyPublishAuthBacklogCount === 1 ? "" : "s"}
        </small>
      ) : null}
      {missingToolSummary ? <small>{missingToolSummary}</small> : null}
      {strongIsolationToolCount > 0 || hasMissingToolIssues || legacyPublishAuthBacklogCount > 0 ? (
        <div className="workflow-chip-flags">
          {legacyPublishAuthStatusLabel ? (
            <span className="event-chip">{legacyPublishAuthStatusLabel}</span>
          ) : null}
          {strongIsolationToolCount > 0 ? <span className="event-chip">strong isolation</span> : null}
          {hasMissingToolIssues ? <span className="event-chip">catalog gap</span> : null}
        </div>
      ) : null}
    </Link>
  );
}
