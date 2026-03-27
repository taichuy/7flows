"use client";

import React from "react";
import type { Node } from "@xyflow/react";

import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import {
  describePluginAdapterHealth,
  formatPluginAdapterDescriptor
} from "@/lib/plugin-adapter-presenters";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import { getToolGovernanceSummary } from "@/lib/tool-governance";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import { WorkflowValidationRemediationCard } from "@/components/workflow-validation-remediation-card";
import { CredentialPicker } from "@/components/workflow-node-config-form/credential-picker";
import {
  cloneRecord,
  getSupportedToolSchemaFields,
  getUnsupportedToolFieldNames,
  parseNumericFieldValue,
  readToolBinding,
  readToolInputValue,
  toRecord,
  type ToolSchemaField
} from "@/components/workflow-node-config-form/shared";

type ToolNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  highlightedFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

export function ToolNodeConfigForm({
  node,
  tools,
  adapters,
  currentHref = null,
  sandboxReadiness = null,
  highlightedFieldPath = null,
  focusedValidationItem = null,
  onChange
}: ToolNodeConfigFormProps) {
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const config = cloneRecord(node.data.config);
  const binding = readToolBinding(config);
  const boundToolId = binding?.toolId ?? "";
  const selectedTool = tools.find((tool) => tool.id === boundToolId) ?? null;
  const schemaFields = selectedTool ? getSupportedToolSchemaFields(selectedTool.input_schema) : [];
  const unsupportedFields = selectedTool
    ? getUnsupportedToolFieldNames(selectedTool.input_schema, schemaFields)
    : [];
  const selectedToolGovernance = selectedTool ? getToolGovernanceSummary(selectedTool) : null;
  const adapterDiagnostics = buildCompatAdapterDiagnostics({
    tool: selectedTool,
    adapterId: binding?.adapterId ?? null,
    adapters
  });
  const inputs = toRecord(config.inputs) ?? {};
  const normalizedHighlightedField = normalizeToolBindingFieldKey(highlightedFieldPath);

  React.useEffect(() => {
    if (!normalizedHighlightedField) {
      return;
    }

    const target = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${normalizedHighlightedField}"] input, ` +
        `[data-validation-field="${normalizedHighlightedField}"] select`
    );

    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus();
  }, [normalizedHighlightedField]);

  const handleToolSelection = (toolId: string) => {
    const nextConfig = cloneRecord(config);
    delete nextConfig.toolId;

    if (!toolId) {
      delete nextConfig.tool;
      onChange(nextConfig);
      return;
    }

    const nextTool = tools.find((tool) => tool.id === toolId);
    if (!nextTool) {
      return;
    }

    const previousBinding = readToolBinding(nextConfig);
    const nextBinding: Record<string, unknown> = {
      toolId: nextTool.id,
      ecosystem: nextTool.ecosystem
    };

    if (previousBinding?.adapterId && nextTool.ecosystem !== "native") {
      nextBinding.adapterId = previousBinding.adapterId;
    }
    if (typeof previousBinding?.timeoutMs === "number") {
      nextBinding.timeoutMs = previousBinding.timeoutMs;
    }
    if (previousBinding?.credentials && Object.keys(previousBinding.credentials).length > 0) {
      nextBinding.credentials = previousBinding.credentials;
    }

    nextConfig.tool = nextBinding;
    onChange(nextConfig);
  };

  const handleToolBindingFieldChange = (
    field: "adapterId" | "timeoutMs",
    value: string
  ) => {
    const nextConfig = cloneRecord(config);
    const currentBinding = readToolBinding(nextConfig);
    if (!currentBinding) {
      return;
    }
    const nextBinding: Record<string, unknown> = { ...currentBinding };

    if (field === "adapterId") {
      const normalized = value.trim();
      if (!normalized || String(nextBinding.ecosystem ?? "native") === "native") {
        delete nextBinding.adapterId;
      } else {
        nextBinding.adapterId = normalized;
      }
    } else {
      const nextTimeout = parseNumericFieldValue(value);
      if (nextTimeout === undefined) {
        delete nextBinding.timeoutMs;
      } else if (nextTimeout > 0) {
        nextBinding.timeoutMs = Math.round(nextTimeout);
      } else {
        return;
      }
    }

    nextConfig.tool = nextBinding;
    onChange(nextConfig);
  };

  const handleToolCredentialChange = (credKey: string, value: string | undefined) => {
    const nextConfig = cloneRecord(config);
    const currentBinding = readToolBinding(nextConfig);
    if (!currentBinding) {
      return;
    }
    const nextBinding: Record<string, unknown> = { ...currentBinding };
    const nextCredentials = { ...(toRecord(nextBinding.credentials) ?? {}) };

    if (value === undefined || value === "") {
      delete nextCredentials[credKey];
    } else {
      nextCredentials[credKey] = value;
    }

    if (Object.keys(nextCredentials).length === 0) {
      delete nextBinding.credentials;
    } else {
      nextBinding.credentials = nextCredentials;
    }

    nextConfig.tool = nextBinding;
    onChange(nextConfig);
  };

  const handleToolInputChange = (field: ToolSchemaField, value: unknown) => {
    const nextConfig = cloneRecord(config);
    const nextInputs = cloneRecord(toRecord(nextConfig.inputs) ?? {});

    if (value === undefined) {
      delete nextInputs[field.name];
    } else {
      nextInputs[field.name] = value;
    }

    if (Object.keys(nextInputs).length === 0) {
      delete nextConfig.inputs;
    } else {
      nextConfig.inputs = nextInputs;
    }

    onChange(nextConfig);
  };

  return (
    <div className="binding-form" ref={sectionRef}>
      {focusedValidationItem && normalizedHighlightedField ? (
        <WorkflowValidationRemediationCard
          currentHref={currentHref}
          item={focusedValidationItem}
          sandboxReadiness={sandboxReadiness}
        />
      ) : null}

      <div className="section-heading">
        <div>
          <p className="eyebrow">Structured config</p>
          <h3>Tool binding</h3>
        </div>
      </div>

      <label
        className={`binding-field ${normalizedHighlightedField === "tool.toolId" ? "validation-focus-ring" : ""}`.trim()}
        data-validation-field="tool.toolId"
      >
        <span className="binding-label">Catalog tool</span>
        <select
          className="binding-select"
          value={boundToolId}
          onChange={(event) => handleToolSelection(event.target.value)}
        >
          <option value="">未绑定工具目录项</option>
          {!selectedTool && boundToolId ? (
            <option value={boundToolId}>当前绑定 {boundToolId} (目录缺失)</option>
          ) : null}
          {tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {tool.name} · {tool.ecosystem}
            </option>
          ))}
        </select>
      </label>

      {selectedTool ? (
        <>
          <div className="tool-badge-row">
            <span className="event-chip">{selectedTool.ecosystem}</span>
            <span className="event-chip">{selectedTool.source}</span>
            <span className="event-chip">{selectedTool.callable ? "callable" : "catalog only"}</span>
            {selectedToolGovernance?.sensitivityLevel ? (
              <span className="event-chip">
                sensitivity {selectedToolGovernance.sensitivityLevel}
              </span>
            ) : null}
            {selectedToolGovernance?.defaultExecutionClass ? (
              <span className="event-chip">
                default {selectedToolGovernance.defaultExecutionClass}
              </span>
            ) : null}
          </div>

          <p className="section-copy">
            {selectedTool.description || "当前目录项没有补充描述。"}
          </p>

          {selectedToolGovernance ? (
            <div className="binding-field compact-stack">
              <span className="binding-label">Governance summary</span>
              <p className="section-copy">{selectedToolGovernance.summary}</p>
              <div className="tool-badge-row">
                {selectedToolGovernance.supportedExecutionClasses.map((executionClass) => (
                  <span className="event-chip" key={`${selectedTool.id}-${executionClass}`}>
                    supports {executionClass}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <label
            className={`binding-field ${normalizedHighlightedField === "tool.adapterId" ? "validation-focus-ring" : ""}`.trim()}
            data-validation-field="tool.adapterId"
          >
            <span className="binding-label">Adapter ID</span>
            <input
              className="trace-text-input"
              value={binding?.adapterId ?? ""}
              onChange={(event) =>
                handleToolBindingFieldChange("adapterId", event.target.value)
              }
              placeholder={
                selectedTool.ecosystem === "native"
                  ? "native 工具无需 adapterId"
                  : "可选：覆盖 compat adapter 标识"
              }
            />
          </label>

          {adapterDiagnostics ? (
            <div className="binding-field compact-stack">
              <span className="binding-label">Resolved compat adapter</span>
              <div className="tool-badge-row">
                <span className={`health-pill ${adapterDiagnostics.healthPill}`}>
                  {adapterDiagnostics.statusLabel}
                </span>
                {adapterDiagnostics.badges.map((badge) => (
                  <span className="event-chip" key={`${selectedTool.id}:${badge}`}>
                    {badge}
                  </span>
                ))}
              </div>
              <p className="section-copy">{adapterDiagnostics.summary}</p>
              {adapterDiagnostics.detail ? (
                <p className="binding-meta">{adapterDiagnostics.detail}</p>
              ) : null}
            </div>
          ) : null}

          <label className="binding-field">
            <span className="binding-label">Timeout (ms)</span>
            <input
              className="trace-text-input"
              inputMode="numeric"
              value={
                typeof binding?.timeoutMs === "number" ? String(binding.timeoutMs) : ""
              }
              onChange={(event) =>
                handleToolBindingFieldChange("timeoutMs", event.target.value)
              }
              placeholder="为空则使用后端默认超时"
            />
          </label>

          <CredentialPicker
            label="Tool credential"
            value={
              typeof binding?.credentials?.auth === "string"
                ? binding.credentials.auth
                : ""
            }
            onChange={(value) => handleToolCredentialChange("auth", value)}
            hint="选择后会写入 config.tool.credentials.auth，运行时自动解密注入。"
            placeholder="选择工具凭证"
          />

          {schemaFields.length > 0 ? (
            <>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Inputs</p>
                  <h3>Schema-driven fields</h3>
                </div>
              </div>

              {schemaFields.map((field) => {
                const currentValue = readToolInputValue(inputs[field.name], field.defaultValue);

                if (field.type === "boolean") {
                  return (
                    <label className="binding-field" key={field.name}>
                      <span className="binding-label">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(currentValue)}
                        onChange={(event) =>
                          handleToolInputChange(field, event.target.checked)
                        }
                      />
                      {field.description ? (
                        <small className="section-copy">{field.description}</small>
                      ) : null}
                    </label>
                  );
                }

                if (field.type === "select") {
                  return (
                    <label className="binding-field" key={field.name}>
                      <span className="binding-label">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <select
                        className="binding-select"
                        value={typeof currentValue === "string" ? currentValue : ""}
                        onChange={(event) =>
                          handleToolInputChange(field, event.target.value || undefined)
                        }
                      >
                        <option value="">未设置</option>
                        {field.options.map((option) => (
                          <option key={`${field.name}-${option}`} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {field.description ? (
                        <small className="section-copy">{field.description}</small>
                      ) : null}
                    </label>
                  );
                }

                if (field.type === "number") {
                  return (
                    <label className="binding-field" key={field.name}>
                      <span className="binding-label">
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <input
                        className="trace-text-input"
                        inputMode="decimal"
                        value={typeof currentValue === "number" ? String(currentValue) : ""}
                        onChange={(event) =>
                          handleToolInputChange(
                            field,
                            parseNumericFieldValue(event.target.value)
                          )
                        }
                        placeholder="输入数值"
                      />
                      {field.description ? (
                        <small className="section-copy">{field.description}</small>
                      ) : null}
                    </label>
                  );
                }

                return (
                  <label className="binding-field" key={field.name}>
                    <span className="binding-label">
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    <input
                      className="trace-text-input"
                      type={field.inputType ?? "text"}
                      value={typeof currentValue === "string" ? currentValue : ""}
                      onChange={(event) =>
                        handleToolInputChange(field, event.target.value || undefined)
                      }
                      placeholder={field.description || field.name}
                    />
                    {field.description ? (
                      <small className="section-copy">{field.description}</small>
                    ) : null}
                  </label>
                );
              })}
            </>
          ) : (
            <p className="empty-state compact">
              当前工具 schema 没有可直接渲染的简单输入字段，可继续通过下方高级 JSON
              补充 `config.inputs`。
            </p>
          )}

          {unsupportedFields.length > 0 ? (
            <div className="binding-field">
              <span className="binding-label">Advanced-only fields</span>
              <div className="tool-badge-row">
                {unsupportedFields.map((fieldName) => (
                  <span className="event-chip" key={`${selectedTool.id}-${fieldName}`}>
                    {fieldName}
                  </span>
                ))}
              </div>
              <small className="section-copy">
                这些字段仍可通过高级 JSON 继续编辑，不会在结构化表单里丢失。
              </small>
            </div>
          ) : null}
        </>
      ) : (
        <p className="empty-state compact">
          先从持久化 tool catalog 里选择一个目录项，编辑器才会根据 schema 渲染输入字段。
        </p>
      )}
    </div>
  );
}

function normalizeToolBindingFieldKey(fieldPath?: string | null) {
  const normalized = fieldPath?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized === "config.tool" || normalized === "config.tool.toolId") {
    return "tool.toolId";
  }

  if (normalized === "config.tool.adapterId") {
    return "tool.adapterId";
  }

  return null;
}

type CompatAdapterDiagnostics = {
  healthPill: string;
  statusLabel: string;
  summary: string;
  detail: string | null;
  badges: string[];
};

function buildCompatAdapterDiagnostics({
  tool,
  adapterId,
  adapters
}: {
  tool: PluginToolRegistryItem | null;
  adapterId: string | null;
  adapters: PluginAdapterRegistryItem[];
}): CompatAdapterDiagnostics | null {
  if (!tool || tool.ecosystem === "native") {
    return null;
  }

  const normalizedAdapterId = adapterId?.trim() ?? "";
  const ecosystemAdapters = adapters.filter((adapter) => adapter.ecosystem === tool.ecosystem);

  if (normalizedAdapterId) {
    const explicitAdapter = adapters.find((adapter) => adapter.id === normalizedAdapterId) ?? null;
    if (!explicitAdapter) {
      return {
        healthPill: "disabled",
        statusLabel: "missing",
        summary: `当前固定绑定了 adapter ${normalizedAdapterId}，但 workspace 里看不到这个 adapter。`,
        detail:
          ecosystemAdapters.length > 0
            ? `同生态候选：${ecosystemAdapters.map(formatPluginAdapterDescriptor).join("；")}`
            : `当前还没有 ${tool.ecosystem} adapter；请先到 Adapter health and sync 注册 compat runtime。`,
        badges: [tool.ecosystem]
      };
    }

    if (explicitAdapter.ecosystem !== tool.ecosystem) {
      return {
        healthPill: "disabled",
        statusLabel: "mismatch",
        summary: `当前固定绑定了 adapter ${explicitAdapter.id}，但它服务于 ${explicitAdapter.ecosystem}，与工具所需的 ${tool.ecosystem} 不一致。`,
        detail:
          ecosystemAdapters.length > 0
            ? `当前 ${tool.ecosystem} adapter：${ecosystemAdapters.map(formatPluginAdapterDescriptor).join("；")}`
            : `当前还没有 ${tool.ecosystem} adapter；请先到 Adapter health and sync 注册 compat runtime。`,
        badges: [tool.ecosystem]
      };
    }

    return {
      healthPill: explicitAdapter.enabled ? explicitAdapter.status : "disabled",
      statusLabel: explicitAdapter.enabled ? explicitAdapter.status : "disabled",
      summary: explicitAdapter.enabled
        ? `当前固定使用 adapter ${explicitAdapter.id}。`
        : `当前固定绑定了 adapter ${explicitAdapter.id}，但它已禁用。`,
      detail: describePluginAdapterHealth(explicitAdapter),
      badges: buildCompatAdapterBadges(explicitAdapter)
    };
  }

  const defaultAdapter = ecosystemAdapters.find((adapter) => adapter.enabled) ?? null;
  if (defaultAdapter) {
    return {
      healthPill: defaultAdapter.status,
      statusLabel: defaultAdapter.status,
      summary: `当前未显式填写 adapterId；保存和运行时会默认路由到 adapter ${defaultAdapter.id}。`,
      detail: describePluginAdapterHealth(defaultAdapter),
      badges: buildCompatAdapterBadges(defaultAdapter)
    };
  }

  if (ecosystemAdapters.length === 0) {
    return {
      healthPill: "disabled",
      statusLabel: "missing",
      summary: `当前还没有 ${tool.ecosystem} adapter，compat 工具还不能进入运行时。`,
      detail: "请先到 Adapter health and sync 注册 compat runtime，否则这里只会停留在 catalog 绑定。",
      badges: [tool.ecosystem]
    };
  }

  return {
    healthPill: "disabled",
    statusLabel: "unavailable",
    summary: `当前 ${tool.ecosystem} adapter 都不可用，compat 工具还不能进入运行时。`,
    detail: `已发现：${ecosystemAdapters.map(formatPluginAdapterDescriptor).join("；")}`,
    badges: [tool.ecosystem]
  };
}

function buildCompatAdapterBadges(adapter: PluginAdapterRegistryItem) {
  const badges: string[] = [adapter.ecosystem];
  if (adapter.mode) {
    badges.push(`mode ${adapter.mode}`);
  }
  const executionClasses = adapter.supported_execution_classes.length
    ? adapter.supported_execution_classes
    : ["subprocess"];
  executionClasses.forEach((executionClass) => {
    badges.push(`supports ${executionClass}`);
  });
  return badges;
}
