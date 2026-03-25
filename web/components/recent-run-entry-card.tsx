import Link from "next/link";

import type { RecentRunCheck } from "@/lib/get-system-overview";
import { buildLegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  formatCatalogGapToolSummary,
  formatWorkflowMissingToolSummary,
  hasWorkflowMissingToolIssues
} from "@/lib/workflow-definition-governance";

type RecentRunEntryCardProps = {
  run: RecentRunCheck;
  runHref: string;
  runLinkLabel: string;
  workflowHref?: string | null;
  workflowLinkLabel?: string | null;
};

export function RecentRunEntryCard({
  run,
  runHref,
  runLinkLabel,
  workflowHref,
  workflowLinkLabel
}: RecentRunEntryCardProps) {
  const workflowLabel = run.workflow_name?.trim() || run.workflow_id;
  const legacyAuthHandoff = buildLegacyPublishAuthWorkflowHandoff(
    run.legacy_auth_governance,
    run.workflow_id
  );
  const toolGovernance = run.tool_governance ?? {
    referenced_tool_ids: [],
    missing_tool_ids: [],
    governed_tool_count: 0,
    strong_isolation_tool_count: 0
  };
  const missingToolSummary = formatWorkflowMissingToolSummary({
    tool_governance: toolGovernance
  });
  const hasMissingToolIssues = hasWorkflowMissingToolIssues({
    tool_governance: toolGovernance
  });
  const catalogGapToolCopy = formatCatalogGapToolSummary(toolGovernance.missing_tool_ids);
  const missingToolDetail = catalogGapToolCopy
    ? `当前 workflow 仍有 catalog gap（${catalogGapToolCopy}）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。`
    : "当前 workflow 仍有 catalog gap；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。";
  const missingWorkflowLinkFallback =
    hasMissingToolIssues && legacyAuthHandoff
      ? "当前入口还没有可用的 workflow deep link，请回到 workflow library 继续处理 catalog gap / publish auth contract backlog。"
      : hasMissingToolIssues
        ? "当前入口还没有可用的 workflow deep link，请回到 workflow library 继续处理 catalog gap。"
        : legacyAuthHandoff
          ? "当前入口还没有可用的 workflow deep link，请回到 workflow library 继续处理 publish auth contract backlog。"
          : null;

  return (
    <article className="activity-row">
      <div className="activity-header">
        <div>
          <h3>{workflowLabel}</h3>
          <p>
            workflow {run.workflow_id} · run {run.id} · version {run.workflow_version}
          </p>
        </div>
        <span className={`health-pill ${run.status}`}>{run.status}</span>
      </div>
      <p className="activity-copy">
        Created {formatTimestamp(run.created_at)} · events {run.event_count}
      </p>
      {missingToolSummary ? (
        <>
          <div className="event-type-strip">
            <span className="event-chip">{missingToolSummary}</span>
          </div>
          <p className="activity-copy">{missingToolDetail}</p>
        </>
      ) : null}
      {legacyAuthHandoff ? (
        <>
          <div className="event-type-strip">
            <span className="event-chip">{legacyAuthHandoff.bindingChipLabel}</span>
            <span className="event-chip">{legacyAuthHandoff.statusChipLabel}</span>
          </div>
          <p className="activity-copy">{legacyAuthHandoff.detail}</p>
        </>
      ) : null}
      <div className="section-actions">
        <Link className="activity-link" href={runHref}>
          {runLinkLabel}
        </Link>
        {workflowHref && workflowLinkLabel ? (
          <Link className="inline-link secondary" href={workflowHref}>
            {workflowLinkLabel}
          </Link>
        ) : null}
      </div>
      {!workflowHref && missingWorkflowLinkFallback ? (
        <p className="section-copy">{missingWorkflowLinkFallback}</p>
      ) : null}
    </article>
  );
}
