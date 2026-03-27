import React from "react";

import { LegacyPublishAuthContractCard } from "@/components/legacy-publish-auth-contract-card";
import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  buildWorkflowCatalogGapDetail,
  buildWorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import { buildWorkflowPersistBlockerRecommendedNextStep } from "@/components/workflow-editor-workbench/persist-blockers";

type WorkflowPersistBlockerNoticeProps = {
  title: string;
  summary?: string | null;
  blockers: WorkflowPersistBlocker[];
  sandboxReadiness?: SandboxReadinessCheck | null;
  currentHref?: string | null;
  hideRecommendedNextStep?: boolean;
  limit?: number;
};

function buildPersistBlockerWorkflowGovernanceHandoff(
  blockers: WorkflowPersistBlocker[],
  currentHref?: string | null
) {
  const catalogGapToolIds = Array.from(
    new Set(
      blockers.flatMap((blocker) =>
        blocker.id === "tool_reference" ? blocker.catalogGapToolIds ?? [] : []
      )
    )
  );

  if (catalogGapToolIds.length === 0) {
    return null;
  }

  const toolGovernance = {
    referenced_tool_ids: catalogGapToolIds,
    missing_tool_ids: catalogGapToolIds,
    governed_tool_count: 0,
    strong_isolation_tool_count: 0
  };

  return buildWorkflowGovernanceHandoff({
    workflowDetailHref: currentHref ?? null,
    toolGovernance,
    workflowCatalogGapDetail: buildWorkflowCatalogGapDetail({
      toolGovernance,
      subjectLabel: "这次保存入口",
      returnDetail: "先回到当前 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续保存。"
    })
  });
}

export function WorkflowPersistBlockerNotice({
  title,
  summary = null,
  blockers,
  sandboxReadiness = null,
  currentHref = null,
  hideRecommendedNextStep = false,
  limit = 4
}: WorkflowPersistBlockerNoticeProps) {
  if (blockers.length === 0) {
    return null;
  }

  const recommendedNextStep = buildWorkflowPersistBlockerRecommendedNextStep(
    blockers,
    sandboxReadiness,
    currentHref
  );
  const workflowGovernanceHandoff = buildPersistBlockerWorkflowGovernanceHandoff(
    blockers,
    currentHref
  );
  const hasLegacyPublishAuthModeIssues = blockers.some(
    (blocker) => blocker.id === "publish_draft" && blocker.hasLegacyPublishAuthModeIssues
  );

  return (
    <div className="sync-message error">
      <strong>{title}</strong>
      {summary ? <p className="section-copy entry-copy">{summary}</p> : null}
      {hideRecommendedNextStep ? null : (
        <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
      )}
      <WorkflowGovernanceHandoffCards
        workflowCatalogGapSummary={workflowGovernanceHandoff?.workflowCatalogGapSummary}
        workflowCatalogGapDetail={workflowGovernanceHandoff?.workflowCatalogGapDetail}
        workflowCatalogGapHref={workflowGovernanceHandoff?.workflowCatalogGapHref}
        workflowGovernanceHref={workflowGovernanceHandoff?.workflowGovernanceHref}
        legacyAuthHandoff={workflowGovernanceHandoff?.legacyAuthHandoff}
        cardClassName="entry-card compact-card"
        currentHref={currentHref}
      />
      {hasLegacyPublishAuthModeIssues ? (
        <LegacyPublishAuthContractCard title="Save-gate publish auth contract" />
      ) : null}
      <ul className="event-list compact-list">
        {blockers.slice(0, limit).map((blocker) => (
          <li key={blocker.id}>
            <strong>{blocker.label}</strong>：{blocker.detail} {blocker.nextStep}
          </li>
        ))}
      </ul>
    </div>
  );
}
