import React, { useEffect, useRef } from "react";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildWorkflowPublishDraftEndpointId } from "@/lib/workflow-publish-definition-links";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { LegacyPublishAuthContractCard } from "@/components/legacy-publish-auth-contract-card";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import type { WorkflowEditorPublishValidationIssue } from "./workflow-editor-publish-form-validation";

import {
  AUTH_MODES,
  PUBLISH_PROTOCOLS,
  assignOptionalString,
  formatPublishedEndpointAuthModeOptionLabel,
  isSupportedPublishedEndpointAuthMode,
  stringifyJson,
  toEnumValue,
  type WorkflowPublishedEndpointDraft
} from "./workflow-editor-publish-form-shared";
import {
  WorkflowEditorPublishEndpointCacheSection,
  WorkflowEditorPublishEndpointRateLimitSection
} from "./workflow-editor-publish-endpoint-card-sections";

type WorkflowEditorPublishEndpointCardProps = {
  endpoint: WorkflowPublishedEndpointDraft;
  endpointIndex: number;
  workflowVersion: string;
  validationIssues: WorkflowEditorPublishValidationIssue[];
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  highlighted?: boolean;
  highlightedFieldPath?: string | null;
  onUpdateEndpoint: (
    index: number,
    updater: (current: Record<string, unknown>) => Record<string, unknown>
  ) => void;
  onDeleteEndpoint: (index: number) => void;
  onApplySchemaField: (
    endpointIndex: number,
    field: "inputSchema" | "outputSchema",
    value: string
  ) => void;
};

export function WorkflowEditorPublishEndpointCard({
  endpoint,
  endpointIndex,
  workflowVersion,
  validationIssues,
  focusedValidationItem = null,
  currentHref = null,
  sandboxReadiness = null,
  highlighted = false,
  highlightedFieldPath = null,
  onUpdateEndpoint,
  onDeleteEndpoint,
  onApplySchemaField
}: WorkflowEditorPublishEndpointCardProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const normalizedHighlightedField = normalizePublishFieldKey(highlightedFieldPath);
  const versionChip = endpoint.workflowVersion
    ? `pinned ${endpoint.workflowVersion}`
    : `tracks current ${workflowVersion}`;
  const hasLegacyUnsupportedAuthMode = !isSupportedPublishedEndpointAuthMode(endpoint.authMode);
  const legacyAuthValidationIssue =
    validationIssues.find(
      (issue) => issue.category === "publish_draft" && issue.field === "authMode"
    ) ?? null;
  const genericValidationMessages = validationIssues
    .filter((issue) => issue !== legacyAuthValidationIssue)
    .map((issue) => issue.message);
  const legacyAuthValidationItem = legacyAuthValidationIssue
    ? {
        key: legacyAuthValidationIssue.key,
        category: legacyAuthValidationIssue.category,
        message: legacyAuthValidationIssue.message,
        target: {
          scope: "publish" as const,
          endpointIndex,
          fieldPath: legacyAuthValidationIssue.field,
          label:
            endpoint.name && endpoint.name !== endpoint.id
              ? `Publish · ${endpoint.name}`
              : `Publish · ${endpoint.id}`
        },
        hasLegacyPublishAuthModeIssues: true
      }
    : null;
  const focusedAuthModeRemediation =
    focusedValidationItem?.target.scope === "publish" &&
    focusedValidationItem.target.fieldPath === "authMode";
  const shouldRenderLegacyAuthRemediation =
    legacyAuthValidationItem !== null && !focusedAuthModeRemediation;
  const shouldRenderStandaloneLegacyAuthContract =
    hasLegacyUnsupportedAuthMode && !shouldRenderLegacyAuthRemediation && !focusedAuthModeRemediation;

  useEffect(() => {
    if (!highlighted) {
      return;
    }

    const target = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${normalizedHighlightedField}"] input, ` +
        `[data-validation-field="${normalizedHighlightedField}"] select, ` +
        `[data-validation-field="${normalizedHighlightedField}"] textarea`
    );

    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus();
  }, [highlighted, normalizedHighlightedField]);

  return (
    <section
      className={
        `entry-card compact-card workflow-definition-anchor-target ${highlighted ? "validation-focus-ring" : ""}`.trim()
      }
      id={buildWorkflowPublishDraftEndpointId(endpoint.id)}
      ref={sectionRef}
    >
      <div className="binding-card-header">
        <div>
          <p className="status-meta">Endpoint draft</p>
          <h3>{endpoint.name}</h3>
        </div>
        <span className="event-chip">{endpoint.protocol}</span>
      </div>

      <div className="tool-badge-row">
        <span className="event-chip">id {endpoint.id}</span>
        <span className="event-chip">auth {endpoint.authMode}</span>
        <span className="event-chip">{endpoint.streaming ? "streaming" : "non-streaming"}</span>
        <span className="event-chip">{versionChip}</span>
      </div>

      {focusedValidationItem && normalizedHighlightedField ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={focusedValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      {genericValidationMessages.length > 0 ? (
        <div className="sync-message error">
          <ul className="roadmap-list compact-list">
            {genericValidationMessages.map((message) => (
              <li key={`${endpoint.id}-${message}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {shouldRenderLegacyAuthRemediation ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={legacyAuthValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <label className="binding-field" data-validation-field="name">
        <span className="binding-label">Name</span>
        <input
          className="trace-text-input"
          value={endpoint.name}
          onChange={(event) =>
            onUpdateEndpoint(endpointIndex, (current) => {
              current.name = event.target.value.trimStart();
              return current;
            })
          }
        />
      </label>

      <label className="binding-field" data-validation-field="id">
        <span className="binding-label">Endpoint id</span>
        <input
          className="trace-text-input"
          value={endpoint.id}
          onChange={(event) =>
            onUpdateEndpoint(endpointIndex, (current) => {
              current.id = event.target.value.trim();
              return current;
            })
          }
        />
      </label>

      <div className="publish-meta-grid">
        <label className="binding-field" data-validation-field="alias">
          <span className="binding-label">Alias</span>
          <input
            className="trace-text-input"
            value={endpoint.alias ?? ""}
            placeholder={endpoint.id}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) =>
                assignOptionalString(current, "alias", event.target.value)
              )
            }
          />
        </label>

        <label className="binding-field" data-validation-field="path">
          <span className="binding-label">Path</span>
          <input
            className="trace-text-input"
            value={endpoint.path ?? ""}
            placeholder={`/${endpoint.id}`}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) =>
                assignOptionalString(current, "path", event.target.value)
              )
            }
          />
        </label>
      </div>

      <div className="publish-meta-grid">
        <label className="binding-field" data-validation-field="protocol">
          <span className="binding-label">Protocol</span>
          <select
            className="binding-select"
            value={endpoint.protocol}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) => {
                current.protocol = toEnumValue(event.target.value, PUBLISH_PROTOCOLS, "native");
                return current;
              })
            }
          >
            {PUBLISH_PROTOCOLS.map((protocol) => (
              <option key={`${endpoint.id}-${protocol}`} value={protocol}>
                {protocol}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field" data-validation-field="authMode">
          <span className="binding-label">Auth mode</span>
          <select
            className="binding-select"
            value={endpoint.authMode}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) => {
                current.authMode = toEnumValue(event.target.value, AUTH_MODES, "api_key");
                return current;
              })
            }
          >
            {hasLegacyUnsupportedAuthMode ? (
              <option value={endpoint.authMode} disabled>
                {formatPublishedEndpointAuthModeOptionLabel(endpoint.authMode)}
              </option>
            ) : null}
            {AUTH_MODES.map((authMode) => (
              <option key={`${endpoint.id}-${authMode}`} value={authMode}>
                {formatPublishedEndpointAuthModeOptionLabel(authMode)}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field" data-validation-field="workflowVersion">
          <span className="binding-label">Workflow version</span>
          <input
            className="trace-text-input"
            value={endpoint.workflowVersion ?? ""}
            placeholder={workflowVersion}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) =>
                assignOptionalString(current, "workflowVersion", event.target.value)
              )
            }
          />
        </label>
      </div>

      <p className="section-copy entry-copy">
        `workflowVersion` 留空时会跟随当前保存出来的 workflow version；只有填写语义版本时才会把 endpoint 固定到指定版本。
      </p>

      {shouldRenderStandaloneLegacyAuthContract ? <LegacyPublishAuthContractCard /> : null}

      {endpoint.workflowVersion ? (
        <div className="binding-actions">
          <button
            className="sync-button secondary-button"
            type="button"
            onClick={() =>
              onUpdateEndpoint(endpointIndex, (current) => {
                delete current.workflowVersion;
                return current;
              })
            }
          >
            跟随当前 workflow 版本
          </button>
        </div>
      ) : null}

      <label className="binding-field" data-validation-field="streaming">
        <span className="binding-label">Streaming</span>
        <input
          type="checkbox"
          checked={endpoint.streaming}
          onChange={(event) =>
            onUpdateEndpoint(endpointIndex, (current) => {
              current.streaming = event.target.checked;
              return current;
            })
          }
        />
      </label>

      <label className="binding-field" data-validation-field="inputSchema">
        <span className="binding-label">Input schema JSON</span>
        <textarea
          key={`${endpoint.id}-input-schema-${JSON.stringify(endpoint.inputSchema)}`}
          className="editor-json-area"
          defaultValue={stringifyJson(endpoint.inputSchema)}
          onBlur={(event) => onApplySchemaField(endpointIndex, "inputSchema", event.target.value)}
        />
      </label>

      <label className="binding-field" data-validation-field="outputSchema">
        <span className="binding-label">Output schema JSON</span>
        <textarea
          key={`${endpoint.id}-output-schema-${JSON.stringify(endpoint.outputSchema ?? {})}`}
          className="editor-json-area"
          defaultValue={stringifyJson(endpoint.outputSchema ?? {})}
          onBlur={(event) => onApplySchemaField(endpointIndex, "outputSchema", event.target.value)}
        />
      </label>

      <WorkflowEditorPublishEndpointRateLimitSection
        endpoint={endpoint}
        endpointIndex={endpointIndex}
        onUpdateEndpoint={onUpdateEndpoint}
      />

      <WorkflowEditorPublishEndpointCacheSection
        endpoint={endpoint}
        endpointIndex={endpointIndex}
        onUpdateEndpoint={onUpdateEndpoint}
      />

      <button
        className="editor-danger-button"
        type="button"
        onClick={() => onDeleteEndpoint(endpointIndex)}
      >
        删除此 publish endpoint
      </button>
    </section>
  );
}

function normalizePublishFieldKey(fieldPath: string | null | undefined) {
  if (!fieldPath) {
    return "name";
  }

  if (fieldPath.startsWith("inputSchema")) {
    return "inputSchema";
  }
  if (fieldPath.startsWith("outputSchema")) {
    return "outputSchema";
  }
  if (fieldPath.startsWith("rateLimit.requests")) {
    return "rateLimit.requests";
  }
  if (fieldPath.startsWith("rateLimit.windowSeconds")) {
    return "rateLimit.windowSeconds";
  }
  if (fieldPath.startsWith("cache.enabled")) {
    return "cache.enabled";
  }
  if (fieldPath.startsWith("cache.ttl")) {
    return "cache.ttl";
  }
  if (fieldPath.startsWith("cache.maxEntries")) {
    return "cache.maxEntries";
  }
  if (fieldPath.startsWith("cache.varyBy")) {
    return "cache.varyBy";
  }

  return fieldPath;
}
