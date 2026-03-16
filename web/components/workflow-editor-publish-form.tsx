"use client";

import { useMemo, useState } from "react";

import { validateContractSchema } from "@/lib/workflow-contract-schema-validation";
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
  workflowVersion: string;
  availableWorkflowVersions: string[];
  publishEndpoints: Array<Record<string, unknown>>;
  onChange: (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  highlightedEndpointIndex?: number | null;
};

export function WorkflowEditorPublishForm({
  workflowVersion,
  availableWorkflowVersions,
  publishEndpoints,
  onChange,
  highlightedEndpointIndex = null
}: WorkflowEditorPublishFormProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

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
    <article className="diagnostic-panel editor-panel">
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
        <div className="sync-message error">
          <p>当前 publish draft 还有待修正问题，先在编辑器里处理掉会更稳妥：</p>
          <ul className="roadmap-list compact-list">
            {validationIssues.map((issue) => (
              <li key={issue.key}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {normalizedEndpoints.length > 0 ? (
        <div className="binding-form compact-stack">
          {normalizedEndpoints.map((endpoint, endpointIndex) => (
            <WorkflowEditorPublishEndpointCard
              key={`publish-endpoint-${endpointIndex}`}
              endpoint={endpoint}
              endpointIndex={endpointIndex}
              workflowVersion={workflowVersion}
              validationMessages={validationIssuesByEndpoint.get(String(endpointIndex)) ?? []}
              highlighted={highlightedEndpointIndex === endpointIndex}
              onUpdateEndpoint={updateEndpoint}
              onDeleteEndpoint={handleDeleteEndpoint}
              onApplySchemaField={applySchemaField}
            />
          ))}
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
