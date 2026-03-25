import React from "react";
import Link from "next/link";

import { LegacyPublishAuthContractCard } from "@/components/legacy-publish-auth-contract-card";
import type { RunExecutionView } from "@/lib/get-run-views";
import { buildLegacyPublishAuthGovernanceSurfaceCopy } from "@/lib/legacy-publish-auth-governance-presenters";
import { appendWorkflowLibraryViewStateForWorkflow } from "@/lib/workflow-library-query";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

export function RunDiagnosticsLegacyAuthGovernanceCard({
  executionView
}: {
  executionView: RunExecutionView;
}) {
  const snapshot = executionView.legacy_auth_governance ?? null;
  if (!snapshot || snapshot.binding_count <= 0) {
    return null;
  }

  const workflowSummary =
    snapshot.workflows.find((item) => item.workflow_id === executionView.workflow_id) ??
    snapshot.workflows[0] ??
    null;
  const legacyAuthSurfaceCopy = buildLegacyPublishAuthGovernanceSurfaceCopy();
  const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
    workflowId: executionView.workflow_id,
    variant: "editor"
  });
  const workflowDetailHref = workflowSummary
    ? appendWorkflowLibraryViewStateForWorkflow(workflowDetailLink.href, workflowSummary, {
        definitionIssue: null
      })
    : workflowDetailLink.href;

  return (
    <section>
      <div className="section-heading compact-heading">
        <div>
          <span className="binding-label">{legacyAuthSurfaceCopy.title}</span>
        </div>
        <div className="tool-badge-row">
          <span className="event-chip">{snapshot.binding_count} legacy bindings</span>
          <span className="event-chip">shared workflow artifact</span>
        </div>
      </div>

      <p className="section-copy entry-copy">{legacyAuthSurfaceCopy.description}</p>

      <LegacyPublishAuthContractCard contract={snapshot.auth_mode_contract} />

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Draft cleanup</span>
          <strong>{snapshot.summary.draft_candidate_count}</strong>
        </article>
        <article className="summary-card">
          <span>Published blockers</span>
          <strong>{snapshot.summary.published_blocker_count}</strong>
        </article>
        <article className="summary-card">
          <span>Offline inventory</span>
          <strong>{snapshot.summary.offline_inventory_count}</strong>
        </article>
      </div>

      {snapshot.checklist.length > 0 ? (
        <div className="publish-key-list">
          {snapshot.checklist.map((item) => (
            <article className="payload-card compact-card" key={item.key}>
              <div className="payload-card-header">
                <span className="status-meta">{item.tone_label}</span>
                <span className="event-chip">{item.count} items</span>
              </div>
              <p className="binding-meta">{item.title}</p>
              <p className="section-copy entry-copy">{item.detail}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="binding-actions">
        <div>
          <p className="entry-card-title">{legacyAuthSurfaceCopy.workflowFollowUpTitle}</p>
          <p className="section-copy entry-copy">
            {workflowSummary
              ? `当前 workflow 仍有 ${workflowSummary.draft_candidate_count} 条 draft cleanup、${workflowSummary.published_blocker_count} 条 published blocker、${workflowSummary.offline_inventory_count} 条 offline inventory；回到 detail 后可继续沿同一份 handoff 收口。`
              : legacyAuthSurfaceCopy.workflowFollowUpFallback}
          </p>
        </div>
        <Link className="activity-link" href={workflowDetailHref}>
          {workflowDetailLink.label}
        </Link>
      </div>
    </section>
  );
}
