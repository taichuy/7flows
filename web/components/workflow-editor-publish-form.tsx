"use client";

import React from "react";

import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildOperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import { buildSandboxReadinessFollowUpCandidate } from "@/lib/system-overview-follow-up-presenters";
import { type WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import { buildWorkflowPublishDraftSectionId } from "@/lib/workflow-publish-definition-links";
import { WorkflowEditorPublishEndpointCard } from "./workflow-editor-publish-endpoint-card";
import { WorkflowEditorPublishFormValidationSummary } from "./workflow-editor-publish-form-validation-summary";
import { useWorkflowEditorPublishDraftState } from "./workflow-editor-publish-form-state";

type WorkflowEditorPublishFormProps = {
  currentHref?: string | null;
  workflowVersion: string;
  availableWorkflowVersions: string[];
  publishEndpoints: Array<Record<string, unknown>>;
  sandboxReadiness?: SandboxReadinessCheck | null;
  onChange: (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  persistBlockers?: WorkflowPersistBlocker[];
  highlightedEndpointIndex?: number | null;
  highlightedEndpointFieldPath?: string | null;
};

export function WorkflowEditorPublishForm({
  currentHref = null,
  workflowVersion,
  availableWorkflowVersions,
  publishEndpoints,
  sandboxReadiness,
  onChange,
  focusedValidationItem = null,
  persistBlockers = [],
  highlightedEndpointIndex = null,
  highlightedEndpointFieldPath = null
}: WorkflowEditorPublishFormProps) {
  const sandboxPreflightHint = formatSandboxReadinessPreflightHint(sandboxReadiness);
  const sandboxRecommendedNextStep = sandboxPreflightHint
    ? buildOperatorRecommendedNextStep({
        execution: buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
        currentHref
      })
    : null;
  const {
    feedback,
    normalizedEndpoints,
    genericValidationIssues,
    genericValidationRemediationItem,
    remainingGenericValidationIssues,
    validationIssuesByEndpoint,
    publishLegacyAuthValidationItem,
    publishPersistBlockers,
    publishPersistBlockerSummary,
    focusedPublishValidationItem,
    focusedPublishEndpointExists,
    updateEndpoint,
    handleAddEndpoint,
    handleDeleteEndpoint,
    applySchemaField
  } = useWorkflowEditorPublishDraftState({
    availableWorkflowVersions,
    publishEndpoints,
    onChange,
    focusedValidationItem,
    persistBlockers
  });

  return (
    <article
      className="diagnostic-panel editor-panel workflow-definition-anchor-target"
      id={buildWorkflowPublishDraftSectionId()}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workflow publish</p>
          <h2>Published endpoints</h2>
        </div>
      </div>

      <p className="section-copy">
        直接在 workflow definition 里维护发布入口，先把协议、鉴权、schema 与缓存策略收敛到同一处；真正发布和 API key 治理仍走独立 publish 页面。
      </p>
      <p className="section-copy entry-copy">
        `workflowVersion` 留空时会自动跟随当前保存出来的 workflow version，避免 draft 被默认钉死在旧版本。
      </p>
      {sandboxPreflightHint ? (
        <p className="section-copy entry-copy">
          当前 publish draft 与正式 publish 页面共用同一条 strong-isolation / capability 链路；保存前可先对照：
          {sandboxPreflightHint}
        </p>
      ) : null}
      {focusedPublishValidationItem && !focusedPublishEndpointExists ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={focusedPublishValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}
      <OperatorRecommendedNextStepCard recommendedNextStep={sandboxRecommendedNextStep} />
      <WorkflowPersistBlockerNotice
        title="Publish save gate"
        summary={publishPersistBlockerSummary}
        blockers={publishPersistBlockers}
        sandboxReadiness={sandboxReadiness}
        currentHref={currentHref}
      />

      <div className="tool-badge-row">
        <span className="event-chip">draft count {normalizedEndpoints.length}</span>
        <span className="event-chip">current workflow version {workflowVersion}</span>
        {availableWorkflowVersions.length > 0 ? (
          <span className="event-chip">
            pin targets {availableWorkflowVersions.join(" / ")}
          </span>
        ) : null}
      </div>

      <div className="binding-actions">
        <button className="sync-button" type="button" onClick={handleAddEndpoint}>
          新增 publish endpoint
        </button>
      </div>

      <WorkflowEditorPublishFormValidationSummary
        currentHref={currentHref}
        sandboxReadiness={sandboxReadiness}
        genericValidationIssues={genericValidationIssues}
        genericValidationRemediationItem={genericValidationRemediationItem}
        remainingGenericValidationIssues={remainingGenericValidationIssues}
        publishLegacyAuthValidationItem={publishLegacyAuthValidationItem}
      />

      {normalizedEndpoints.length > 0 ? (
        <div className="binding-form compact-stack">
          {normalizedEndpoints.map((endpoint, endpointIndex) => {
            const endpointFocusedValidationItem =
              focusedPublishValidationItem?.target.endpointIndex === endpointIndex
                ? focusedPublishValidationItem
                : null;

            return (
              <WorkflowEditorPublishEndpointCard
                key={`publish-endpoint-${endpointIndex}`}
                endpoint={endpoint}
                endpointIndex={endpointIndex}
                workflowVersion={workflowVersion}
                validationIssues={validationIssuesByEndpoint.get(String(endpointIndex)) ?? []}
                focusedValidationItem={endpointFocusedValidationItem}
                currentHref={currentHref}
                sandboxReadiness={sandboxReadiness}
                highlighted={
                  highlightedEndpointIndex === endpointIndex || endpointFocusedValidationItem !== null
                }
                highlightedFieldPath={
                  highlightedEndpointIndex === endpointIndex
                    ? highlightedEndpointFieldPath
                    : endpointFocusedValidationItem?.target.fieldPath ?? null
                }
                onUpdateEndpoint={updateEndpoint}
                onDeleteEndpoint={handleDeleteEndpoint}
                onApplySchemaField={applySchemaField}
              />
            );
          })}
        </div>
      ) : (
        <p className="empty-state compact">
          当前 workflow definition 还没有 publish endpoint，先在这里补 draft，再到 publish 页面做正式发布和治理。
        </p>
      )}

      {feedback ? <p className="sync-message error">{feedback}</p> : null}
    </article>
  );
}
