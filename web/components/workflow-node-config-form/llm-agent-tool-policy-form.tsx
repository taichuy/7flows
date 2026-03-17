"use client";

import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import {
  compareToolsByGovernance,
  getToolGovernanceSummary
} from "@/lib/tool-governance";
import {
  WORKFLOW_EXECUTION_CLASS_OPTIONS,
  WORKFLOW_EXECUTION_FILESYSTEM_POLICY_OPTIONS,
  WORKFLOW_EXECUTION_NETWORK_POLICY_OPTIONS
} from "@/lib/workflow-runtime-policy";
import {
  cloneRecord,
  dedupeStrings,
  parseNumericFieldValue,
  toRecord,
  toStringArray
} from "@/components/workflow-node-config-form/shared";

type LlmAgentToolPolicyFormProps = {
  config: Record<string, unknown>;
  tools: PluginToolRegistryItem[];
  onChange: (nextConfig: Record<string, unknown>) => void;
};

export function LlmAgentToolPolicyForm({
  config,
  tools,
  onChange
}: LlmAgentToolPolicyFormProps) {
  const toolPolicy = toRecord(config.toolPolicy) ?? {};
  const execution = toRecord(toolPolicy.execution) ?? {};
  const allowedToolIds = dedupeStrings(toStringArray(toolPolicy.allowedToolIds));
  const callableTools = tools.filter((tool) => tool.callable).sort(compareToolsByGovernance);
  const governedCallableToolCount = callableTools.filter(
    (tool) => getToolGovernanceSummary(tool).requiresStrongIsolationByDefault
  ).length;

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
    field: "class" | "profile" | "timeoutMs" | "networkPolicy" | "filesystemPolicy",
    value: string | number | undefined
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

  const toggleAllowedTool = (toolId: string, checked: boolean) => {
    updateToolPolicy({
      allowedToolIds: checked
        ? [...allowedToolIds, toolId]
        : allowedToolIds.filter((currentToolId) => currentToolId !== toolId)
    });
  };

  return (
    <div className="binding-field">
      <span className="binding-label">Tool policy</span>

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
              仅在需要把 Agent 可调用工具强制收口到特定 execution class / profile 时填写；留空表示沿用工具默认能力声明。
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

        <label className="binding-field">
          <span className="binding-label">Execution class</span>
          <select
            className="binding-select"
            value={typeof execution.class === "string" ? execution.class : ""}
            onChange={(event) => updateExecutionField("class", event.target.value || undefined)}
          >
            <option value="">follow tool default</option>
            {WORKFLOW_EXECUTION_CLASS_OPTIONS.map((option) => (
              <option key={`tool-policy-execution-class-${option}`} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field">
          <span className="binding-label">Profile</span>
          <input
            className="trace-text-input"
            value={typeof execution.profile === "string" ? execution.profile : ""}
            onChange={(event) => updateExecutionField("profile", event.target.value)}
            placeholder="browser-safe / filesystem-heavy / trusted-local"
          />
        </label>

        <label className="binding-field">
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

        <label className="binding-field">
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

        <label className="binding-field">
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

      {callableTools.length > 0 ? (
        <div className="binding-field compact-stack">
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
