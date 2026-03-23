"use client";

import React from "react";

import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildOperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { buildSandboxExecutionPolicyPreflightInsight } from "@/lib/sandbox-readiness-presenters";
import { buildSandboxReadinessFollowUpCandidate } from "@/lib/system-overview-follow-up-presenters";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import {
  cloneRecord,
  formatJsonObjectFieldValue,
  parseNumericFieldValue,
  parseJsonObjectFieldValue,
  toRecord
} from "@/components/workflow-node-config-form/shared";
import {
  commitRuntimePolicy,
  normalizeExecutionPolicy,
  normalizeRuntimePolicy,
  readExecutionPolicy
} from "@/components/workflow-node-config-form/runtime-policy-helpers";
import {
  WORKFLOW_EXECUTION_CLASS_OPTIONS,
  WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS,
  WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS,
  WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS
} from "@/lib/workflow-runtime-policy";

type WorkflowNodeRuntimePolicyExecutionSectionProps = {
  nodeId: string;
  nodeType: string;
  runtimePolicy: Record<string, unknown>;
  onChange: (nextRuntimePolicy: Record<string, unknown> | undefined) => void;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function WorkflowNodeRuntimePolicyExecutionSection({
  nodeId,
  nodeType,
  runtimePolicy,
  onChange,
  highlightedFieldPath = null,
  focusedValidationItem = null,
  sandboxReadiness = null
}: WorkflowNodeRuntimePolicyExecutionSectionProps) {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const execution = readExecutionPolicy(runtimePolicy, nodeType);
  const sandboxExecutionInsight =
    sandboxReadiness && (execution.className === "sandbox" || execution.className === "microvm")
      ? buildSandboxExecutionPolicyPreflightInsight(sandboxReadiness, {
          executionClass: execution.className,
          nodeType,
          profile: execution.profile,
          dependencyMode: execution.dependencyMode,
          builtinPackageSet: execution.builtinPackageSet,
          dependencyRef: execution.dependencyRef,
          backendExtensions: execution.backendExtensions ?? null,
          networkPolicy: execution.networkPolicy,
          filesystemPolicy: execution.filesystemPolicy
        })
      : null;
  const sandboxRecommendedNextStep = sandboxExecutionInsight
    ? buildOperatorRecommendedNextStep({
        execution: buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness")
      })
    : null;
  const normalizedHighlightedField = normalizeRuntimeExecutionFieldKey(highlightedFieldPath);
  const backendExtensionsValue = React.useMemo(
    () => formatJsonObjectFieldValue(execution.backendExtensions),
    [execution.backendExtensions]
  );
  const [backendExtensionsInput, setBackendExtensionsInput] = React.useState(
    backendExtensionsValue
  );
  const [backendExtensionsError, setBackendExtensionsError] = React.useState<string | null>(null);
  const showStrongIsolationFields =
    execution.className === "sandbox" ||
    execution.className === "microvm" ||
    Boolean(execution.dependencyMode) ||
    Boolean(execution.builtinPackageSet) ||
    Boolean(execution.dependencyRef) ||
    Boolean(execution.backendExtensions && Object.keys(execution.backendExtensions).length > 0);

  React.useEffect(() => {
    setBackendExtensionsInput(backendExtensionsValue);
    setBackendExtensionsError(null);
  }, [backendExtensionsValue]);

  React.useEffect(() => {
    if (!normalizedHighlightedField) {
      return;
    }

    const target = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${normalizedHighlightedField}"] input, ` +
        `[data-validation-field="${normalizedHighlightedField}"] select, ` +
        `[data-validation-field="${normalizedHighlightedField}"] textarea`
    );

    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus();
  }, [normalizedHighlightedField]);

  const updateExecutionField = (
    field:
      | "class"
      | "profile"
      | "timeoutMs"
      | "networkPolicy"
      | "filesystemPolicy"
      | "dependencyMode"
      | "builtinPackageSet"
      | "dependencyRef"
      | "backendExtensions",
    value: string | number | Record<string, unknown> | undefined
  ) => {
    const nextPolicy = normalizeRuntimePolicy(runtimePolicy);
    const nextExecution = cloneRecord(toRecord(nextPolicy.execution) ?? {});

    if (value === undefined || value === "") {
      delete nextExecution[field];
    } else {
      nextExecution[field] = value;
    }

    const normalizedExecution = normalizeExecutionPolicy(nextExecution, nodeType);
    if (normalizedExecution) {
      nextPolicy.execution = normalizedExecution;
    } else {
      delete nextPolicy.execution;
    }

    commitRuntimePolicy(nextPolicy, onChange);
  };

  const clearExecutionOverride = () => {
    const nextPolicy = normalizeRuntimePolicy(runtimePolicy);
    delete nextPolicy.execution;
    commitRuntimePolicy(nextPolicy, onChange);
  };

  const commitBackendExtensions = () => {
    const parsed = parseJsonObjectFieldValue(
      backendExtensionsInput,
      "Backend extensions"
    );
    setBackendExtensionsError(parsed.error);
    if (parsed.error) {
      return;
    }
    updateExecutionField("backendExtensions", parsed.value);
  };

  return (
    <div className="binding-field compact-stack" ref={sectionRef}>
      <div className="section-heading compact-heading">
        <div>
          <span className="binding-label">Execution policy</span>
          <small className="section-copy">
            Resolve the effective execution boundary first, then only persist
            `runtimePolicy.execution` when class/profile/capability hints differ from the default.
          </small>
        </div>
        <div className="tool-badge-row">
          <span className="event-chip">default {execution.defaultClass}</span>
          <span className="event-chip">
            {execution.explicit ? "explicit override" : "resolved default"}
          </span>
          {execution.explicit ? (
            <button className="sync-button" type="button" onClick={clearExecutionOverride}>
              Clear execution override
            </button>
          ) : null}
        </div>
      </div>

      {focusedValidationItem && normalizedHighlightedField ? (
        <WorkflowValidationRemediationCard
          item={focusedValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <label className="binding-field" data-validation-field="execution.class">
        <span className="binding-label">Execution class</span>
        <select
          className="binding-select"
          value={execution.className}
          onChange={(event) => updateExecutionField("class", event.target.value)}
        >
          {WORKFLOW_EXECUTION_CLASS_OPTIONS.map((option) => (
            <option key={`${nodeId}-execution-class-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="binding-field" data-validation-field="execution.profile">
        <span className="binding-label">Profile</span>
        <input
          className="trace-text-input"
          value={execution.profile}
          onChange={(event) => updateExecutionField("profile", event.target.value)}
          placeholder="browser-safe / filesystem-heavy / trusted-local"
        />
      </label>

      <label className="binding-field" data-validation-field="execution.timeoutMs">
        <span className="binding-label">Timeout ms</span>
        <input
          className="trace-text-input"
          type="number"
          min={1}
          step={1000}
          value={typeof execution.timeoutMs === "number" ? String(execution.timeoutMs) : ""}
          onChange={(event) =>
            updateExecutionField("timeoutMs", parseNumericFieldValue(event.target.value))
          }
          placeholder="Fallback to node/tool default timeout"
        />
      </label>

      <label className="binding-field" data-validation-field="execution.networkPolicy">
        <span className="binding-label">Network policy</span>
        <select
          className="binding-select"
          value={execution.networkPolicy}
          onChange={(event) => updateExecutionField("networkPolicy", event.target.value)}
        >
          {WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS.map((option) => (
            <option key={`${nodeId}-execution-network-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="binding-field" data-validation-field="execution.filesystemPolicy">
        <span className="binding-label">Filesystem policy</span>
        <select
          className="binding-select"
          value={execution.filesystemPolicy}
          onChange={(event) => updateExecutionField("filesystemPolicy", event.target.value)}
        >
          {WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS.map((option) => (
            <option key={`${nodeId}-execution-filesystem-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      {showStrongIsolationFields ? (
        <>
          <label className="binding-field" data-validation-field="execution.dependencyMode">
            <span className="binding-label">Dependency mode</span>
            <select
              className="binding-select"
              value={execution.dependencyMode ?? ""}
              onChange={(event) =>
                updateExecutionField("dependencyMode", event.target.value || undefined)
              }
            >
              <option value="">omit dependency hints</option>
              {WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS.map((option) => (
                <option key={`${nodeId}-execution-dependency-mode-${option}`} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {execution.dependencyMode === "builtin" ? (
            <label className="binding-field" data-validation-field="execution.builtinPackageSet">
              <span className="binding-label">Builtin package set</span>
              <input
                className="trace-text-input"
                value={execution.builtinPackageSet}
                onChange={(event) =>
                  updateExecutionField("builtinPackageSet", event.target.value)
                }
                placeholder="py-data-basic"
              />
            </label>
          ) : null}

          {execution.dependencyMode === "dependency_ref" ? (
            <label className="binding-field" data-validation-field="execution.dependencyRef">
              <span className="binding-label">Dependency ref</span>
              <input
                className="trace-text-input"
                value={execution.dependencyRef}
                onChange={(event) => updateExecutionField("dependencyRef", event.target.value)}
                placeholder="bundle:finance-safe-v1"
              />
            </label>
          ) : null}

          <label className="binding-field" data-validation-field="execution.backendExtensions">
            <span className="binding-label">Backend extensions JSON</span>
            <textarea
              className="trace-text-input"
              rows={4}
              value={backendExtensionsInput}
              onChange={(event) => {
                setBackendExtensionsInput(event.target.value);
                if (!event.target.value.trim()) {
                  setBackendExtensionsError(null);
                }
              }}
              onBlur={commitBackendExtensions}
              placeholder='{"mountPreset":"analytics"}'
            />
          </label>
          {backendExtensionsError ? (
            <small className="status-meta warning-text">{backendExtensionsError}</small>
          ) : null}
        </>
      ) : null}

      {sandboxExecutionInsight ? (
        <div className="binding-field compact-stack">
          <span className="binding-label">Live sandbox readiness</span>
          <small className="section-copy">
            {sandboxExecutionInsight.headline}
            {sandboxExecutionInsight.detail ? ` ${sandboxExecutionInsight.detail}` : ""}
          </small>
          {sandboxExecutionInsight.chips.length > 0 ? (
            <div className="tool-badge-row">
              {sandboxExecutionInsight.chips.map((chip) => (
                <span className="event-chip" key={`${nodeId}-execution-readiness-${chip}`}>
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <OperatorRecommendedNextStepCard recommendedNextStep={sandboxRecommendedNextStep} />
    </div>
  );
}

function normalizeRuntimeExecutionFieldKey(fieldPath?: string | null) {
  const normalized = fieldPath?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "runtimePolicy.execution") {
    return "execution.class";
  }

  if (normalized.startsWith("runtimePolicy.execution.")) {
    return normalized.replace(/^runtimePolicy\./, "");
  }

  return null;
}
