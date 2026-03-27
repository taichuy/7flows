"use client";

import React from "react";
import { useMemo, useState } from "react";

import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildOperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import { formatSandboxReadinessPreflightHint } from "@/lib/sandbox-readiness-presenters";
import { buildSandboxReadinessFollowUpCandidate } from "@/lib/system-overview-follow-up-presenters";
import {
  buildWorkflowValidationNavigatorItems,
  type WorkflowValidationNavigatorItem
} from "@/lib/workflow-validation-navigation";
import { validateContractSchema } from "@/lib/workflow-contract-schema-validation";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import { summarizeWorkflowPersistBlockers } from "@/components/workflow-editor-workbench/persist-blockers";
import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import { buildWorkflowPublishDraftSectionId } from "@/lib/workflow-publish-definition-links";
import { WorkflowEditorPublishEndpointCard } from "./workflow-editor-publish-endpoint-card";
import { buildPublishedEndpointValidationIssues } from "./workflow-editor-publish-form-validation";
import {
  cloneRecord,
  createPublishedEndpointDraft,
  createUniqueEndpointId,
  isRecord,
  normalizePublishedEndpoint
} from "./workflow-editor-publish-form-shared";

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

type FocusedPublishValidationItem = WorkflowValidationNavigatorItem & {
  target: Extract<WorkflowValidationNavigatorItem["target"], { scope: "publish" }>;
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const sandboxPreflightHint = formatSandboxReadinessPreflightHint(sandboxReadiness);
  const sandboxRecommendedNextStep = sandboxPreflightHint
    ? buildOperatorRecommendedNextStep({
        execution: buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
        currentHref
      })
    : null;

  const normalizedEndpoints = useMemo(
    () => publishEndpoints.map((endpoint, index) => normalizePublishedEndpoint(endpoint, index)),
    [publishEndpoints]
  );
  const validationIssues = useMemo(
    () =>
      buildPublishedEndpointValidationIssues(normalizedEndpoints, {
        allowedWorkflowVersions: availableWorkflowVersions
      }),
    [availableWorkflowVersions, normalizedEndpoints]
  );
  const validationIssuesByEndpoint = useMemo(
    () => groupValidationIssuesByEndpoint(validationIssues),
    [validationIssues]
  );
  const publishLegacyAuthValidationItem = useMemo(
    () =>
      buildWorkflowValidationNavigatorItems(
        { publish: normalizedEndpoints },
        validationIssues
          .filter((issue) => issue.category === "publish_draft" && issue.field === "authMode")
          .map((issue) => ({
            category: issue.category,
            message: issue.message,
            path: issue.path,
            field: issue.field,
            hasLegacyPublishAuthModeIssues: true
          }))
      )[0] ?? null,
    [normalizedEndpoints, validationIssues]
  );
  const publishPersistBlockers = useMemo(
    () => persistBlockers.filter((blocker) => blocker.id === "publish_draft"),
    [persistBlockers]
  );
  const publishPersistBlockerSummary = useMemo(
    () => summarizeWorkflowPersistBlockers(publishPersistBlockers),
    [publishPersistBlockers]
  );
  const focusedPublishValidationItem =
    focusedValidationItem?.target.scope === "publish"
      ? (focusedValidationItem as FocusedPublishValidationItem)
      : null;
  const focusedPublishEndpointExists =
    focusedPublishValidationItem !== null &&
    focusedPublishValidationItem.target.endpointIndex >= 0 &&
    focusedPublishValidationItem.target.endpointIndex < normalizedEndpoints.length;

  const commit = (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => {
    setFeedback(null);
    onChange(nextPublish, options);
  };

  const updateEndpoint = (
    index: number,
    updater: (current: Record<string, unknown>) => Record<string, unknown>
  ) => {
    commit(
      publishEndpoints.map((endpoint, endpointIndex) =>
        endpointIndex === index ? updater(cloneRecord(endpoint)) : cloneRecord(endpoint)
      )
    );
  };

  const handleAddEndpoint = () => {
    const nextId = createUniqueEndpointId(normalizedEndpoints.map((endpoint) => endpoint.id));
    const nextEndpoint = createPublishedEndpointDraft(nextId, normalizedEndpoints.length);

    commit([...publishEndpoints.map(cloneRecord), nextEndpoint], {
      successMessage: `已新增 publish endpoint ${nextId}。`
    });
  };

  const handleDeleteEndpoint = (index: number) => {
    const endpoint = normalizedEndpoints[index];
    commit(
      publishEndpoints
        .filter((_, endpointIndex) => endpointIndex !== index)
        .map(cloneRecord),
      {
        successMessage: `已移除 publish endpoint ${endpoint?.id ?? index + 1}。`
      }
    );
  };

  const applySchemaField = (
    endpointIndex: number,
    field: "inputSchema" | "outputSchema",
    value: string
  ) => {
    const normalized = value.trim();

    if (!normalized) {
      updateEndpoint(endpointIndex, (endpoint) => {
        if (field === "inputSchema") {
          endpoint.inputSchema = {};
        } else {
          delete endpoint.outputSchema;
        }
        return endpoint;
      });
      return;
    }

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (!isRecord(parsed)) {
        throw new Error(`${field} 必须是 JSON 对象。`);
      }
      const endpoint = normalizedEndpoints[endpointIndex];
      const endpointId = endpoint?.id ?? `endpoint_${endpointIndex + 1}`;
      validateContractSchema(parsed, {
        errorPrefix: `Published endpoint '${endpointId}' ${field}`
      });
      updateEndpoint(endpointIndex, (endpoint) => {
        endpoint[field] = parsed;
        return endpoint;
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : `${field} 不是合法 JSON。`);
    }
  };

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

      {validationIssues.length > 0 ? (
        <>
          <div className="sync-message error">
            <p>当前 publish draft 里还有这些字段级问题：</p>
            <ul className="roadmap-list compact-list">
              {validationIssues.map((issue) => (
                <li key={issue.key}>{issue.message}</li>
              ))}
            </ul>
          </div>
          {publishLegacyAuthValidationItem ? (
            <WorkflowValidationRemediationCard
              currentHref={currentHref}
              item={publishLegacyAuthValidationItem}
              sandboxReadiness={sandboxReadiness}
            />
          ) : null}
        </>
      ) : null}

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
                validationMessages={validationIssuesByEndpoint.get(String(endpointIndex)) ?? []}
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

function groupValidationIssuesByEndpoint(
  issues: ReturnType<typeof buildPublishedEndpointValidationIssues>
) {
  const issuesByEndpoint = new Map<string, string[]>();
  for (const issue of issues) {
    const nextMessages = issuesByEndpoint.get(issue.endpointKey) ?? [];
    nextMessages.push(issue.message);
    issuesByEndpoint.set(issue.endpointKey, nextMessages);
  }
  return issuesByEndpoint;
}
