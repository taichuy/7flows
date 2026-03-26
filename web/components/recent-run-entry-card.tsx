import React from "react";
import Link from "next/link";

import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import type { RecentRunCheck } from "@/lib/get-system-overview";
import { formatTimestamp } from "@/lib/runtime-presenters";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";

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
  const toolGovernance = run.tool_governance ?? {
    referenced_tool_ids: [],
    missing_tool_ids: [],
    governed_tool_count: 0,
    strong_isolation_tool_count: 0
  };
  const workflowGovernanceHandoff = buildWorkflowGovernanceHandoff({
    workflowId: run.workflow_id,
    workflowDetailHref: workflowHref,
    toolGovernance,
    legacyAuthGovernance: run.legacy_auth_governance ?? null,
    workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
      toolGovernance,
      subjectLabel: "run",
      returnDetail:
        "先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。"
    })
  });
  const scopedWorkflowHref = workflowGovernanceHandoff.workflowGovernanceHref;
  const missingWorkflowLinkFallback =
    workflowGovernanceHandoff.workflowCatalogGapSummary && workflowGovernanceHandoff.legacyAuthHandoff
      ? "当前入口还没有可用的 workflow deep link，请回到 workflow library 继续处理 catalog gap / publish auth contract backlog。"
      : workflowGovernanceHandoff.workflowCatalogGapSummary
        ? "当前入口还没有可用的 workflow deep link，请回到 workflow library 继续处理 catalog gap。"
        : workflowGovernanceHandoff.legacyAuthHandoff
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
      <WorkflowGovernanceHandoffCards
        workflowCatalogGapSummary={workflowGovernanceHandoff.workflowCatalogGapSummary}
        workflowCatalogGapDetail={workflowGovernanceHandoff.workflowCatalogGapDetail}
        workflowCatalogGapHref={workflowGovernanceHandoff.workflowCatalogGapHref}
        workflowGovernanceHref={scopedWorkflowHref}
        legacyAuthHandoff={workflowGovernanceHandoff.legacyAuthHandoff}
        cardClassName="payload-card compact-card"
      />
      <div className="section-actions">
        <Link className="activity-link" href={runHref}>
          {runLinkLabel}
        </Link>
        {scopedWorkflowHref && workflowLinkLabel ? (
          <Link className="inline-link secondary" href={scopedWorkflowHref}>
            {workflowLinkLabel}
          </Link>
        ) : null}
      </div>
      {!scopedWorkflowHref && missingWorkflowLinkFallback ? (
        <p className="section-copy">{missingWorkflowLinkFallback}</p>
      ) : null}
    </article>
  );
}
