"use client";

import React from "react";

import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildOperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import {
  buildSandboxExecutionPolicyPreflightInsight,
  formatSandboxReadinessPreflightHint
} from "@/lib/sandbox-readiness-presenters";
import { buildSandboxReadinessFollowUpCandidate } from "@/lib/system-overview-follow-up-presenters";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import {
  compareToolsByGovernance,
  getToolExecutionOverrideScope,
  getToolGovernanceSummary
} from "@/lib/tool-governance";
import {
  WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS,
  WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS,
  WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS
} from "@/lib/workflow-runtime-policy";
import {
  cloneRecord,
  dedupeStrings,
  formatJsonObjectFieldValue,
  parseNumericFieldValue,
  parseJsonObjectFieldValue,
  toRecord,
  toStringArray
} from "@/components/workflow-node-config-form/shared";

type LlmAgentToolPolicyFormProps = {
  config: Record<string, unknown>;
  tools: PluginToolRegistryItem[];
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

export function LlmAgentToolPolicyForm({
  config,
  tools,
  currentHref = null,
  sandboxReadiness,
  highlightedFieldPath = null,
  focusedValidationItem = null,
  onChange
}: LlmAgentToolPolicyFormProps) {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const toolPolicy = toRecord(config.toolPolicy) ?? {};
  const execution = toRecord(toolPolicy.execution) ?? {};
  const allowedToolIds = dedupeStrings(toStringArray(toolPolicy.allowedToolIds));
  const callableTools = tools.filter((tool) => tool.callable).sort(compareToolsByGovernance);
  const governedCallableToolCount = callableTools.filter(
    (tool) => getToolGovernanceSummary(tool).requiresStrongIsolationByDefault
  ).length;
  const executionOverrideScope = getToolExecutionOverrideScope({
    tools: callableTools,
    allowedToolIds,
    selectedExecutionClass: typeof execution.class === "string" ? execution.class : null
  });
  const scopedCallableTools = executionOverrideScope.scopedTools;
  const executionClassOptions = executionOverrideScope.sharedExecutionClasses;
  const compatibleExecutionTools = executionOverrideScope.compatibleSelectedTools;
  const unsupportedExecutionTools = executionOverrideScope.unsupportedSelectedTools;
  const selectedExecutionClass = typeof execution.class === "string" ? execution.class : "";
  const hasInvalidSelectedExecutionClass =
    selectedExecutionClass.trim().length > 0 && unsupportedExecutionTools.length > 0;
  const sandboxPreflightHint = formatSandboxReadinessPreflightHint(sandboxReadiness);
  const normalizedHighlightedField = normalizeToolPolicyFieldKey(highlightedFieldPath);
  const backendExtensions =
    execution.backendExtensions &&
    typeof execution.backendExtensions === "object" &&
    !Array.isArray(execution.backendExtensions) &&
    Object.keys(execution.backendExtensions as Record<string, unknown>).length > 0
      ? (execution.backendExtensions as Record<string, unknown>)
      : undefined;
  const backendExtensionsValue = React.useMemo(
    () => formatJsonObjectFieldValue(backendExtensions),
    [backendExtensions]
  );
  const [backendExtensionsInput, setBackendExtensionsInput] = React.useState(
    backendExtensionsValue
  );
  const [backendExtensionsError, setBackendExtensionsError] = React.useState<string | null>(null);
  const showStrongIsolationFields =
    selectedExecutionClass === "sandbox" ||
    selectedExecutionClass === "microvm" ||
    (typeof execution.dependencyMode === "string" && execution.dependencyMode.trim().length > 0) ||
    (typeof execution.builtinPackageSet === "string" &&
      execution.builtinPackageSet.trim().length > 0) ||
    (typeof execution.dependencyRef === "string" && execution.dependencyRef.trim().length > 0) ||
    Boolean(backendExtensions);
  const toolExecutionInsight =
    sandboxReadiness && (selectedExecutionClass === "sandbox" || selectedExecutionClass === "microvm")
      ? buildSandboxExecutionPolicyPreflightInsight(sandboxReadiness, {
          executionClass: selectedExecutionClass,
          nodeType: "tool",
          profile: typeof execution.profile === "string" ? execution.profile : null,
          dependencyMode:
            typeof execution.dependencyMode === "string" ? execution.dependencyMode : null,
          builtinPackageSet:
            typeof execution.builtinPackageSet === "string" ? execution.builtinPackageSet : null,
          dependencyRef:
            typeof execution.dependencyRef === "string" ? execution.dependencyRef : null,
          backendExtensions: backendExtensions ?? null,
          networkPolicy:
            typeof execution.networkPolicy === "string" ? execution.networkPolicy : null,
          filesystemPolicy:
            typeof execution.filesystemPolicy === "string" ? execution.filesystemPolicy : null
        })
      : null;
  const sandboxRecommendedNextStep =
    callableTools.length > 0 && (toolExecutionInsight || sandboxPreflightHint)
      ? buildOperatorRecommendedNextStep({
          execution: buildSandboxReadinessFollowUpCandidate(sandboxReadiness, "sandbox readiness"),
          currentHref
        })
      : null;

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

  const updateToolPolicy = (patch: {
    allowedToolIds?: string[];
    timeoutMs?: number | undefined;
  }) => {
    const nextConfig = cloneRecord(config);
    const nextToolPolicy = cloneRecord(toolPolicy);

    if (patch.allowedToolIds !== undefined) {
      const normalizedToolIds = dedupeStrings(patch.allowedToolIds);
      if (normalizedToolIds.length === 0) {
        delete nextToolPolicy.allowedToolIds;
      } else {
        nextToolPolicy.allowedToolIds = normalizedToolIds;
      }
    }

    if (patch.timeoutMs !== undefined) {
      nextToolPolicy.timeoutMs = patch.timeoutMs;
    } else if (Object.prototype.hasOwnProperty.call(patch, "timeoutMs")) {
      delete nextToolPolicy.timeoutMs;
    }

    if (Object.keys(nextToolPolicy).length === 0) {
      delete nextConfig.toolPolicy;
    } else {
      nextConfig.toolPolicy = nextToolPolicy;
    }

    onChange(nextConfig);
  };

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
    const nextConfig = cloneRecord(config);
    const nextToolPolicy = cloneRecord(toolPolicy);
    const nextExecution = cloneRecord(execution);

    if (value === undefined || value === "") {
      delete nextExecution[field];
    } else {
      nextExecution[field] = value;
    }

    const normalizedExecution = normalizeToolPolicyExecution(nextExecution);
    if (normalizedExecution) {
      nextToolPolicy.execution = normalizedExecution;
    } else {
      delete nextToolPolicy.execution;
    }

    if (Object.keys(nextToolPolicy).length === 0) {
      delete nextConfig.toolPolicy;
    } else {
      nextConfig.toolPolicy = nextToolPolicy;
    }

    onChange(nextConfig);
  };

  const clearExecutionOverride = () => {
    const nextConfig = cloneRecord(config);
    const nextToolPolicy = cloneRecord(toolPolicy);
    delete nextToolPolicy.execution;

    if (Object.keys(nextToolPolicy).length === 0) {
      delete nextConfig.toolPolicy;
    } else {
      nextConfig.toolPolicy = nextToolPolicy;
    }

    onChange(nextConfig);
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

  const toggleAllowedTool = (toolId: string, checked: boolean) => {
    updateToolPolicy({
      allowedToolIds: checked
        ? [...allowedToolIds, toolId]
        : allowedToolIds.filter((currentToolId) => currentToolId !== toolId)
    });
  };

  const scopeExecutionOverrideToCompatibleTools = () => {
    if (compatibleExecutionTools.length === 0) {
      return;
    }

    updateToolPolicy({
      allowedToolIds: compatibleExecutionTools.map((tool) => tool.id)
    });
  };

  return (
    <div className="binding-field" ref={sectionRef}>
      <span className="binding-label">Tool policy</span>
      {focusedValidationItem && normalizedHighlightedField ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={focusedValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <label className="binding-field">
        <span className="binding-label">Per-tool timeout (ms)</span>
        <input
          className="trace-text-input"
          inputMode="numeric"
          value={typeof toolPolicy.timeoutMs === "number" ? String(toolPolicy.timeoutMs) : ""}
          onChange={(event) =>
            updateToolPolicy({ timeoutMs: parseNumericFieldValue(event.target.value) })
          }
          placeholder="为空时沿用运行时默认值"
        />
      </label>

      <div className="binding-field compact-stack">
        <div className="section-heading compact-heading">
          <div>
            <span className="binding-label">Tool execution override</span>
            <small className="section-copy">
              仅在需要把 Agent 可调用工具强制收口到特定 execution class / profile / capability hints 时填写；留空表示沿用工具默认能力声明。
            </small>
          </div>
          {Object.keys(execution).length > 0 ? (
            <div className="tool-badge-row">
              <span className="event-chip">explicit override</span>
              <button className="sync-button" type="button" onClick={clearExecutionOverride}>
                Clear execution override
              </button>
            </div>
          ) : null}
        </div>

        <label className="binding-field" data-validation-field="execution.class">
          <span className="binding-label">Execution class</span>
          <select
            className="binding-select"
            value={selectedExecutionClass}
            onChange={(event) => updateExecutionField("class", event.target.value || undefined)}
          >
            <option value="">follow tool default</option>
            {hasInvalidSelectedExecutionClass ? (
              <option value={selectedExecutionClass}>{selectedExecutionClass} · incompatible</option>
            ) : null}
            {executionClassOptions.map((option) => (
              <option key={`tool-policy-execution-class-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <small className="section-copy">
          {describeExecutionOverrideScope({
            callableToolCount: callableTools.length,
            scopedToolCount: scopedCallableTools.length,
            allowedToolCount: allowedToolIds.length,
            executionClassOptions
          })}
        </small>
        {hasInvalidSelectedExecutionClass ? (
          <small className="status-meta warning-text">
            当前 override `{selectedExecutionClass}` 不被 {unsupportedExecutionTools
              .map((tool) => tool.name || tool.id)
              .join("、")} 支持；保存前请改为共享 execution class，或清空 override 以沿用工具默认值。
          </small>
        ) : null}
        {hasInvalidSelectedExecutionClass && compatibleExecutionTools.length > 0 ? (
          <div className="tool-badge-row">
            <button
              className="sync-button"
              type="button"
              onClick={scopeExecutionOverrideToCompatibleTools}
            >
              仅保留兼容工具 ({compatibleExecutionTools.length})
            </button>
            <small className="section-copy">
              会把 allow list 收口到支持 `{selectedExecutionClass}` 的工具，和后端 preflight 的约束保持一致。
            </small>
          </div>
        ) : null}

        <label className="binding-field" data-validation-field="execution.profile">
          <span className="binding-label">Profile</span>
          <input
            className="trace-text-input"
            value={typeof execution.profile === "string" ? execution.profile : ""}
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
            placeholder="为空时沿用工具或运行时默认值"
          />
        </label>

        <label className="binding-field" data-validation-field="execution.networkPolicy">
          <span className="binding-label">Network policy</span>
          <select
            className="binding-select"
            value={typeof execution.networkPolicy === "string" ? execution.networkPolicy : ""}
            onChange={(event) =>
              updateExecutionField("networkPolicy", event.target.value || undefined)
            }
          >
            <option value="">follow tool default</option>
            {WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS.map((option) => (
              <option key={`tool-policy-network-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field" data-validation-field="execution.filesystemPolicy">
          <span className="binding-label">Filesystem policy</span>
          <select
            className="binding-select"
            value={typeof execution.filesystemPolicy === "string" ? execution.filesystemPolicy : ""}
            onChange={(event) =>
              updateExecutionField("filesystemPolicy", event.target.value || undefined)
            }
          >
            <option value="">follow tool default</option>
            {WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS.map((option) => (
              <option key={`tool-policy-filesystem-${option}`} value={option}>
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
                value={typeof execution.dependencyMode === "string" ? execution.dependencyMode : ""}
                onChange={(event) =>
                  updateExecutionField("dependencyMode", event.target.value || undefined)
                }
              >
                <option value="">follow tool default</option>
                {WORKFLOW_EXECUTION_DEPENDENCY_MODE_OPTIONS.map((option) => (
                  <option key={`tool-policy-dependency-mode-${option}`} value={option}>
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
                  value={typeof execution.builtinPackageSet === "string" ? execution.builtinPackageSet : ""}
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
                  value={typeof execution.dependencyRef === "string" ? execution.dependencyRef : ""}
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

        {toolExecutionInsight ? (
          <div className="binding-field compact-stack">
            <span className="binding-label">Live sandbox readiness</span>
            <small className="section-copy">
              {toolExecutionInsight.headline}
              {toolExecutionInsight.detail ? ` ${toolExecutionInsight.detail}` : ""}
            </small>
            {toolExecutionInsight.chips.length > 0 ? (
              <div className="tool-badge-row">
                {toolExecutionInsight.chips.map((chip) => (
                  <span className="event-chip" key={`tool-policy-readiness-${chip}`}>
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="tool-badge-row">
        <button
          className="sync-button"
          type="button"
          onClick={() => updateToolPolicy({ allowedToolIds: [] })}
        >
          允许全部工具
        </button>
      </div>

      {callableTools.length > 0 ? (
        <p className="section-copy">
          当前可调用工具共 {callableTools.length} 个，其中 {governedCallableToolCount} 个默认执行级别已收口到
          `sandbox / microvm`。如果这里显式覆盖 execution class，建议同时通过
          `allowedToolIds` 收窄范围，避免把高敏工具和低隔离目标混在一起。
        </p>
      ) : null}
      {sandboxPreflightHint && callableTools.length > 0 && !toolExecutionInsight ? (
        <p className="section-copy">
          当前 tool policy 若继续把 Agent 收口到 strong-isolation execution class，请先对照 live sandbox
          readiness：{sandboxPreflightHint}
        </p>
      ) : null}
      <OperatorRecommendedNextStepCard recommendedNextStep={sandboxRecommendedNextStep} />

      {callableTools.length > 0 ? (
        <div className="binding-field compact-stack" data-validation-field="allowedToolIds">
          {callableTools.map((tool) => {
            const checked = allowedToolIds.includes(tool.id);
            const governance = getToolGovernanceSummary(tool);
            return (
              <label className="binding-field compact-stack" key={tool.id}>
                <span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggleAllowedTool(tool.id, event.target.checked)}
                  />{" "}
                  {tool.name || tool.id}
                </span>
                <div className="tool-badge-row">
                  <span className="event-chip">{tool.ecosystem}</span>
                  {governance.sensitivityLevel ? (
                    <span className="event-chip">sensitivity {governance.sensitivityLevel}</span>
                  ) : null}
                  {governance.defaultExecutionClass ? (
                    <span className="event-chip">
                      default {governance.defaultExecutionClass}
                    </span>
                  ) : null}
                  {governance.supportedExecutionClasses.map((executionClass) => (
                    <span className="event-chip" key={`${tool.id}-${executionClass}`}>
                      {executionClass}
                    </span>
                  ))}
                </div>
                <small className="section-copy">{governance.summary}</small>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="empty-state compact">
          当前还没有可调用的 tool catalog 项，tool policy 先保留为空即可。
        </p>
      )}

      <small className="section-copy">
        不勾选任何工具表示不额外限制，LLM Agent 可继续使用运行时可见的全部工具；需要收缩权限时，再显式勾选白名单。
      </small>
    </div>
  );
}

function normalizeToolPolicyFieldKey(fieldPath?: string | null) {
  const normalized = fieldPath?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "config.toolPolicy.allowedToolIds") {
    return "allowedToolIds";
  }

  if (normalized === "config.toolPolicy.execution") {
    return "execution.class";
  }

  if (normalized.startsWith("config.toolPolicy.execution.")) {
    return normalized.replace(/^config\.toolPolicy\./, "");
  }

  return null;
}

function normalizeToolPolicyExecution(execution: Record<string, unknown>) {
  const normalizedExecution: Record<string, unknown> = {};
  const dependencyMode =
    typeof execution.dependencyMode === "string" && execution.dependencyMode.trim()
      ? execution.dependencyMode.trim()
      : undefined;
  const builtinPackageSet =
    dependencyMode === "builtin" &&
    typeof execution.builtinPackageSet === "string" &&
    execution.builtinPackageSet.trim()
      ? execution.builtinPackageSet.trim()
      : undefined;
  const dependencyRef =
    dependencyMode === "dependency_ref" &&
    typeof execution.dependencyRef === "string" &&
    execution.dependencyRef.trim()
      ? execution.dependencyRef.trim()
      : undefined;
  const backendExtensions =
    execution.backendExtensions &&
    typeof execution.backendExtensions === "object" &&
    !Array.isArray(execution.backendExtensions) &&
    Object.keys(execution.backendExtensions as Record<string, unknown>).length > 0
      ? (execution.backendExtensions as Record<string, unknown>)
      : undefined;

  if (typeof execution.class === "string" && execution.class.trim()) {
    normalizedExecution.class = execution.class.trim();
  }
  if (typeof execution.profile === "string" && execution.profile.trim()) {
    normalizedExecution.profile = execution.profile.trim();
  }
  if (typeof execution.timeoutMs === "number") {
    normalizedExecution.timeoutMs = Math.max(1, Math.round(execution.timeoutMs));
  }
  if (typeof execution.networkPolicy === "string" && execution.networkPolicy.trim()) {
    normalizedExecution.networkPolicy = execution.networkPolicy.trim();
  }
  if (
    typeof execution.filesystemPolicy === "string" &&
    execution.filesystemPolicy.trim()
  ) {
    normalizedExecution.filesystemPolicy = execution.filesystemPolicy.trim();
  }
  if (dependencyMode) {
    normalizedExecution.dependencyMode = dependencyMode;
  }
  if (builtinPackageSet) {
    normalizedExecution.builtinPackageSet = builtinPackageSet;
  }
  if (dependencyRef) {
    normalizedExecution.dependencyRef = dependencyRef;
  }
  if (backendExtensions) {
    normalizedExecution.backendExtensions = backendExtensions;
  }

  return Object.keys(normalizedExecution).length > 0 ? normalizedExecution : undefined;
}

function describeExecutionOverrideScope({
  callableToolCount,
  scopedToolCount,
  allowedToolCount,
  executionClassOptions
}: {
  callableToolCount: number;
  scopedToolCount: number;
  allowedToolCount: number;
  executionClassOptions: string[];
}) {
  if (callableToolCount === 0) {
    return "当前还没有可调用工具目录项，execution override 先保持 follow tool default 即可。";
  }
  if (scopedToolCount === 0) {
    return "当前 allow list 没有命中可调用工具；execution override 暂时不会收口到有效工具集。";
  }

  const scopeCopy =
    allowedToolCount > 0
      ? `当前 override 会作用于已勾选的 ${scopedToolCount} 个工具。`
      : `当前 override 会作用于全部 ${scopedToolCount} 个可调用工具。`;

  if (executionClassOptions.length === 0) {
    return `${scopeCopy} 这些工具之间没有共同支持的 execution class；建议缩小 allowedToolIds，或沿用各工具默认执行级别。`;
  }

  return `${scopeCopy} 这里只保留它们共同支持的 execution class：${executionClassOptions.join(" / ")}。`;
}
