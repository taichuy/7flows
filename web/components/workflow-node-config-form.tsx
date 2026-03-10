"use client";

import type { Node } from "@xyflow/react";

import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";

type WorkflowNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  tools: PluginToolRegistryItem[];
  onChange: (nextConfig: Record<string, unknown>) => void;
};

type ToolSchemaField = {
  name: string;
  label: string;
  description: string;
  type: "text" | "number" | "boolean" | "select";
  required: boolean;
  options: string[];
  inputType?: "text" | "password" | "url";
  defaultValue?: unknown;
};

type BranchMode = "selector" | "expression" | "fixed";

const BRANCH_OPERATORS = [
  "exists",
  "not_exists",
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "not_in",
  "contains"
] as const;

const MCP_ARTIFACT_TYPES = ["json", "text", "file", "tool_result", "message"] as const;
const MCP_EXTRA_ARTIFACT_TYPES = MCP_ARTIFACT_TYPES.filter(
  (artifactType) => artifactType !== "json"
);

export function WorkflowNodeConfigForm({
  node,
  nodes,
  tools,
  onChange
}: WorkflowNodeConfigFormProps) {
  switch (node.data.nodeType) {
    case "tool":
      return <ToolNodeConfigForm node={node} tools={tools} onChange={onChange} />;
    case "mcp_query":
      return <McpQueryNodeConfigForm node={node} nodes={nodes} onChange={onChange} />;
    case "condition":
    case "router":
      return <BranchNodeConfigForm node={node} onChange={onChange} />;
    default:
      return null;
  }
}

type ToolNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  tools: PluginToolRegistryItem[];
  onChange: (nextConfig: Record<string, unknown>) => void;
};

function ToolNodeConfigForm({
  node,
  tools,
  onChange
}: ToolNodeConfigFormProps) {
  const config = cloneRecord(node.data.config);
  const binding = readToolBinding(config);
  const boundToolId = binding?.toolId ?? "";
  const selectedTool = tools.find((tool) => tool.id === boundToolId) ?? null;
  const schemaFields = selectedTool ? getSupportedToolSchemaFields(selectedTool.input_schema) : [];
  const unsupportedFields = selectedTool
    ? getUnsupportedToolFieldNames(selectedTool.input_schema, schemaFields)
    : [];
  const inputs = toRecord(config.inputs) ?? {};

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
    const nextBinding = cloneRecord(readToolBinding(nextConfig) ?? {});
    if (!nextBinding.toolId) {
      return;
    }

    if (field === "adapterId") {
      const normalized = value.trim();
      if (!normalized || String(nextBinding.ecosystem ?? "native") === "native") {
        delete nextBinding.adapterId;
      } else {
        nextBinding.adapterId = normalized;
      }
    } else {
      const normalized = value.trim();
      if (!normalized) {
        delete nextBinding.timeoutMs;
      } else {
        const parsed = Number(normalized);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return;
        }
        nextBinding.timeoutMs = Math.round(parsed);
      }
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
    <div className="binding-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Structured config</p>
          <h3>Tool binding</h3>
        </div>
      </div>

      <label className="binding-field">
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
          </div>

          <p className="section-copy">
            {selectedTool.description || "当前目录项没有补充描述。"}
          </p>

          <label className="binding-field">
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

type McpQueryNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

function McpQueryNodeConfigForm({
  node,
  nodes,
  onChange
}: McpQueryNodeConfigFormProps) {
  const config = cloneRecord(node.data.config);
  const contextAccess = toRecord(config.contextAccess) ?? {};
  const query: Record<string, unknown> = toRecord(config.query) ?? {
    type: "authorized_context"
  };
  const availableNodes = nodes.filter((candidate) => candidate.id !== node.id);
  const readableArtifacts = readReadableArtifacts(contextAccess.readableArtifacts);
  const readableNodeIds = Array.from(
    new Set([
      ...toStringArray(contextAccess.readableNodeIds),
      ...readableArtifacts.map((artifact) => artifact.nodeId)
    ])
  );
  const querySourceNodeIds = toStringArray(query.sourceNodeIds);
  const queryArtifactTypes = toStringArray(query.artifactTypes);
  const effectiveQueryArtifactTypes =
    queryArtifactTypes.length > 0 ? queryArtifactTypes : ["json"];

  const updateConfig = (
    nextReadableNodeIds: string[],
    nextReadableArtifacts: Array<{ nodeId: string; artifactType: string }>,
    nextQueryPatch?: Record<string, unknown>
  ) => {
    const nextConfig = cloneRecord(config);
    const nextContextAccess: Record<string, unknown> = {};
    const normalizedReadableNodeIds = dedupeStrings(nextReadableNodeIds);
    const normalizedReadableArtifacts = dedupeArtifactRefs(nextReadableArtifacts);

    if (normalizedReadableNodeIds.length > 0) {
      nextContextAccess.readableNodeIds = normalizedReadableNodeIds;
    }
    if (normalizedReadableArtifacts.length > 0) {
      nextContextAccess.readableArtifacts = normalizedReadableArtifacts;
    }

    if (Object.keys(nextContextAccess).length === 0) {
      delete nextConfig.contextAccess;
    } else {
      nextConfig.contextAccess = nextContextAccess;
    }

    const nextQuery: Record<string, unknown> = {
      type: "authorized_context",
      ...cloneRecord(query),
      ...(nextQueryPatch ?? {})
    };

    const normalizedSourceNodeIds = dedupeStrings(toStringArray(nextQuery.sourceNodeIds));
    if (normalizedSourceNodeIds.length > 0) {
      nextQuery.sourceNodeIds = normalizedSourceNodeIds;
    } else {
      delete nextQuery.sourceNodeIds;
    }

    const normalizedArtifactTypes = dedupeStrings(toStringArray(nextQuery.artifactTypes));
    if (normalizedArtifactTypes.length > 0) {
      nextQuery.artifactTypes = normalizedArtifactTypes;
    } else {
      delete nextQuery.artifactTypes;
    }

    nextConfig.query = nextQuery;
    onChange(nextConfig);
  };

  const toggleReadableNode = (nodeId: string, checked: boolean) => {
    const nextReadableNodeIds = checked
      ? dedupeStrings([...readableNodeIds, nodeId])
      : readableNodeIds.filter((currentNodeId) => currentNodeId !== nodeId);
    const nextReadableArtifacts = checked
      ? readableArtifacts
      : readableArtifacts.filter((artifact) => artifact.nodeId !== nodeId);
    const nextQuerySourceNodeIds = checked
      ? querySourceNodeIds
      : querySourceNodeIds.filter((currentNodeId) => currentNodeId !== nodeId);

    updateConfig(nextReadableNodeIds, nextReadableArtifacts, {
      sourceNodeIds: nextQuerySourceNodeIds
    });
  };

  const toggleReadableArtifact = (
    nodeId: string,
    artifactType: string,
    checked: boolean
  ) => {
    const nextReadableArtifacts = checked
      ? [...readableArtifacts, { nodeId, artifactType }]
      : readableArtifacts.filter(
          (artifact) =>
            artifact.nodeId !== nodeId || artifact.artifactType !== artifactType
        );

    updateConfig(readableNodeIds, nextReadableArtifacts);
  };

  const toggleQuerySource = (nodeId: string, checked: boolean) => {
    const nextQuerySourceNodeIds = checked
      ? [...querySourceNodeIds, nodeId]
      : querySourceNodeIds.filter((currentNodeId) => currentNodeId !== nodeId);

    updateConfig(readableNodeIds, readableArtifacts, {
      sourceNodeIds: nextQuerySourceNodeIds
    });
  };

  const toggleQueryArtifactType = (artifactType: string, checked: boolean) => {
    const currentArtifactTypes = queryArtifactTypes.length > 0 ? queryArtifactTypes : ["json"];
    const nextArtifactTypes = checked
      ? [...currentArtifactTypes, artifactType]
      : currentArtifactTypes.filter((currentType) => currentType !== artifactType);

    updateConfig(readableNodeIds, readableArtifacts, {
      artifactTypes: nextArtifactTypes
    });
  };

  return (
    <div className="binding-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Structured config</p>
          <h3>MCP authorized context</h3>
        </div>
      </div>

      <div className="binding-field">
        <span className="binding-label">Query type</span>
        <div className="tool-badge-row">
          <span className="event-chip">authorized_context</span>
        </div>
        <small className="section-copy">
          当前 editor 先围绕已落地的 `authorized_context` 查询模型提供结构化编辑。
        </small>
      </div>

      <div className="binding-field">
        <span className="binding-label">Readable nodes (默认授权 JSON)</span>
        {availableNodes.length === 0 ? (
          <p className="empty-state compact">当前画布没有可授权的其他节点。</p>
        ) : (
          <div className="tool-badge-row">
            {availableNodes.map((candidate) => {
              const checked = readableNodeIds.includes(candidate.id);
              return (
                <label key={`${node.id}-readable-${candidate.id}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      toggleReadableNode(candidate.id, event.target.checked)
                    }
                  />{" "}
                  {candidate.data.label}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {readableNodeIds.length > 0 ? (
        <div className="binding-field">
          <span className="binding-label">Extra artifact grants</span>
          {readableNodeIds.map((nodeId) => {
            const relatedNode =
              availableNodes.find((candidate) => candidate.id === nodeId) ?? null;
            return (
              <div className="payload-card compact-card" key={`${node.id}-artifact-${nodeId}`}>
                <div className="payload-card-header">
                  <span className="status-meta">
                    {relatedNode?.data.label ?? nodeId} · extra artifacts
                  </span>
                </div>
                <div className="tool-badge-row">
                  {MCP_EXTRA_ARTIFACT_TYPES.map((artifactType) => (
                    <label key={`${nodeId}-${artifactType}`}>
                      <input
                        type="checkbox"
                        checked={readableArtifacts.some(
                          (artifact) =>
                            artifact.nodeId === nodeId &&
                            artifact.artifactType === artifactType
                        )}
                        onChange={(event) =>
                          toggleReadableArtifact(
                            nodeId,
                            artifactType,
                            event.target.checked
                          )
                        }
                      />{" "}
                      {artifactType}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <small className="section-copy">
            `readableNodeIds` 已默认授予 `json`，这里只补充 `text/file/tool_result/message`
            等额外授权。
          </small>
        </div>
      ) : null}

      <div className="binding-field">
        <span className="binding-label">Query source nodes</span>
        {readableNodeIds.length === 0 ? (
          <p className="empty-state compact">先授权至少一个节点，再选择 query source。</p>
        ) : (
          <div className="tool-badge-row">
            {readableNodeIds.map((nodeId) => {
              const relatedNode =
                availableNodes.find((candidate) => candidate.id === nodeId) ?? null;
              return (
                <label key={`${node.id}-source-${nodeId}`}>
                  <input
                    type="checkbox"
                    checked={querySourceNodeIds.includes(nodeId)}
                    onChange={(event) =>
                      toggleQuerySource(nodeId, event.target.checked)
                    }
                  />{" "}
                  {relatedNode?.data.label ?? nodeId}
                </label>
              );
            })}
          </div>
        )}
        <small className="section-copy">
          不勾选时会沿用后端默认语义: 读取全部已授权 source。
        </small>
      </div>

      <div className="binding-field">
        <span className="binding-label">Query artifact types</span>
        <div className="tool-badge-row">
          {MCP_ARTIFACT_TYPES.map((artifactType) => (
            <label key={`${node.id}-query-artifact-${artifactType}`}>
              <input
                type="checkbox"
                checked={effectiveQueryArtifactTypes.includes(artifactType)}
                onChange={(event) =>
                  toggleQueryArtifactType(artifactType, event.target.checked)
                }
              />{" "}
              {artifactType}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

type BranchNodeConfigFormProps = {
  node: Node<WorkflowCanvasNodeData>;
  onChange: (nextConfig: Record<string, unknown>) => void;
};

function BranchNodeConfigForm({
  node,
  onChange
}: BranchNodeConfigFormProps) {
  const config = cloneRecord(node.data.config);
  const branchMode = readBranchMode(config);
  const selector = toRecord(config.selector) ?? {};
  const rules = readSelectorRules(selector.rules, node.data.nodeType);
  const expression = typeof config.expression === "string" ? config.expression : "";
  const defaultBranch = readDefaultBranch(config);
  const fixedBranch =
    typeof config.selected === "string" && config.selected.trim()
      ? config.selected
      : "default";

  const applyBranchMode = (nextMode: BranchMode) => {
    const nextConfig = cloneRecord(config);

    if (nextMode === "selector") {
      delete nextConfig.expression;
      delete nextConfig.selected;
      delete nextConfig.default;
      nextConfig.selector =
        Object.keys(selector).length > 0
          ? selector
          : {
              rules: [createDefaultBranchRule(node.data.nodeType)]
            };
      onChange(nextConfig);
      return;
    }

    if (nextMode === "expression") {
      delete nextConfig.selector;
      delete nextConfig.selected;
      nextConfig.expression =
        expression ||
        (node.data.nodeType === "condition"
          ? "trigger_input.approved"
          : "trigger_input.intent");
      if (defaultBranch && defaultBranch !== "default") {
        nextConfig.default = defaultBranch;
      } else {
        delete nextConfig.default;
      }
      onChange(nextConfig);
      return;
    }

    delete nextConfig.selector;
    delete nextConfig.expression;
    delete nextConfig.default;
    nextConfig.selected = fixedBranch || "default";
    onChange(nextConfig);
  };

  const applySelectorRules = (
    nextRules: Array<Record<string, unknown>>,
    nextDefault?: string
  ) => {
    const nextConfig = cloneRecord(config);
    delete nextConfig.expression;
    delete nextConfig.selected;
    const nextSelector: Record<string, unknown> = {
      rules: nextRules
    };
    if (nextDefault?.trim()) {
      nextSelector.default = nextDefault.trim();
    }
    nextConfig.selector = nextSelector;
    onChange(nextConfig);
  };

  const updateSelectorRule = (
    index: number,
    patch: Partial<Record<"key" | "path" | "operator" | "value", unknown>>
  ) => {
    const nextRules = rules.map((rule, ruleIndex) =>
      ruleIndex === index
        ? {
            ...rule,
            ...patch
          }
        : rule
    );

    applySelectorRules(
      nextRules,
      typeof selector.default === "string" ? selector.default : undefined
    );
  };

  const removeSelectorRule = (index: number) => {
    if (rules.length <= 1) {
      return;
    }
    const nextRules = rules.filter((_, ruleIndex) => ruleIndex !== index);
    applySelectorRules(
      nextRules,
      typeof selector.default === "string" ? selector.default : undefined
    );
  };

  return (
    <div className="binding-form">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Structured config</p>
          <h3>{node.data.nodeType === "condition" ? "Condition branches" : "Router branches"}</h3>
        </div>
      </div>

      <label className="binding-field">
        <span className="binding-label">Decision mode</span>
        <select
          className="binding-select"
          value={branchMode}
          onChange={(event) => applyBranchMode(event.target.value as BranchMode)}
        >
          <option value="selector">selector rules</option>
          <option value="expression">safe expression</option>
          <option value="fixed">fixed branch</option>
        </select>
      </label>

      {branchMode === "selector" ? (
        <>
          {rules.map((rule, index) => (
            <div className="payload-card compact-card" key={`${node.id}-rule-${index}`}>
              <div className="payload-card-header">
                <span className="status-meta">Rule {index + 1}</span>
              </div>

              <label className="binding-field">
                <span className="binding-label">Key</span>
                <input
                  className="trace-text-input"
                  value={String(rule.key ?? "")}
                  onChange={(event) =>
                    updateSelectorRule(index, {
                      key: event.target.value.trim() || `branch_${index + 1}`
                    })
                  }
                  placeholder="例如 urgent / search"
                />
              </label>

              <label className="binding-field">
                <span className="binding-label">Path</span>
                <input
                  className="trace-text-input"
                  value={String(rule.path ?? "")}
                  onChange={(event) =>
                    updateSelectorRule(index, {
                      path: event.target.value.trim() || "trigger_input.value"
                    })
                  }
                  placeholder="例如 trigger_input.intent"
                />
              </label>

              <label className="binding-field">
                <span className="binding-label">Operator</span>
                <select
                  className="binding-select"
                  value={String(rule.operator ?? "eq")}
                  onChange={(event) =>
                    updateSelectorRule(index, { operator: event.target.value })
                  }
                >
                  {BRANCH_OPERATORS.map((operator) => (
                    <option key={`${node.id}-${index}-${operator}`} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
              </label>

              <label className="binding-field">
                <span className="binding-label">Value</span>
                <input
                  className="trace-text-input"
                  value={formatBranchRuleValue(rule.value)}
                  onChange={(event) =>
                    updateSelectorRule(index, {
                      value: parseBranchRuleValue(event.target.value)
                    })
                  }
                  placeholder='支持字符串或 JSON 字面量，如 "high" / 7 / ["a"]'
                />
              </label>

              <button
                className="editor-danger-button"
                type="button"
                onClick={() => removeSelectorRule(index)}
                disabled={rules.length <= 1}
              >
                删除规则
              </button>
            </div>
          ))}

          <button
            className="sync-button"
            type="button"
            onClick={() =>
              applySelectorRules(
                [...rules, createDefaultBranchRule(node.data.nodeType, rules.length + 1)],
                typeof selector.default === "string" ? selector.default : undefined
              )
            }
          >
            添加规则
          </button>

          <label className="binding-field">
            <span className="binding-label">Default branch</span>
            <input
              className="trace-text-input"
              value={typeof selector.default === "string" ? selector.default : ""}
              onChange={(event) =>
                applySelectorRules(rules, event.target.value || undefined)
              }
              placeholder="为空时沿用默认 fallback edge"
            />
          </label>
        </>
      ) : null}

      {branchMode === "expression" ? (
        <>
          <label className="binding-field">
            <span className="binding-label">Expression</span>
            <textarea
              className="editor-json-area"
              value={expression}
              onChange={(event) => {
                const nextConfig = cloneRecord(config);
                delete nextConfig.selector;
                delete nextConfig.selected;
                nextConfig.expression = event.target.value;
                if (defaultBranch && defaultBranch !== "default") {
                  nextConfig.default = defaultBranch;
                } else {
                  delete nextConfig.default;
                }
                onChange(nextConfig);
              }}
            />
          </label>

          <label className="binding-field">
            <span className="binding-label">Default branch key</span>
            <input
              className="trace-text-input"
              value={defaultBranch === "default" ? "" : defaultBranch}
              onChange={(event) => {
                const nextConfig = cloneRecord(config);
                delete nextConfig.selector;
                delete nextConfig.selected;
                nextConfig.expression = expression;
                if (event.target.value.trim()) {
                  nextConfig.default = event.target.value.trim();
                } else {
                  delete nextConfig.default;
                }
                onChange(nextConfig);
              }}
              placeholder="为空时走 condition/router 的默认 fallback"
            />
          </label>

          <small className="section-copy">
            {node.data.nodeType === "condition"
              ? "condition 节点的 expression 模式建议把出边 condition 约束在 true / false。"
              : "router 节点的 expression 结果会映射到同名出边 condition。"}
          </small>
        </>
      ) : null}

      {branchMode === "fixed" ? (
        <label className="binding-field">
          <span className="binding-label">Selected branch</span>
          <input
            className="trace-text-input"
            value={fixedBranch}
            onChange={(event) => {
              const nextConfig = cloneRecord(config);
              delete nextConfig.selector;
              delete nextConfig.expression;
              delete nextConfig.default;
              nextConfig.selected = event.target.value || "default";
              onChange(nextConfig);
            }}
            placeholder="例如 default / search / true"
          />
        </label>
      ) : null}
    </div>
  );
}

function getSupportedToolSchemaFields(inputSchema: Record<string, unknown>) {
  const properties = toRecord(inputSchema.properties);
  if (!properties) {
    return [] as ToolSchemaField[];
  }

  const required = new Set(toStringArray(inputSchema.required));
  const fields: ToolSchemaField[] = [];

  Object.entries(properties).forEach(([name, rawField]) => {
    const field = toRecord(rawField);
    if (!field) {
      return;
    }

    const enumOptions = Array.isArray(field.enum)
      ? field.enum.filter((option): option is string => typeof option === "string")
      : [];
    const fieldType = typeof field.type === "string" ? field.type : "string";
    const label =
      typeof field.title === "string" && field.title.trim() ? field.title : name;
    const description =
      typeof field.description === "string" ? field.description : "";

    if (enumOptions.length > 0) {
      fields.push({
        name,
        label,
        description,
        type: "select",
        required: required.has(name),
        options: enumOptions,
        defaultValue: field.default
      });
      return;
    }

    if (fieldType === "boolean") {
      fields.push({
        name,
        label,
        description,
        type: "boolean",
        required: required.has(name),
        options: [],
        defaultValue: field.default
      });
      return;
    }

    if (fieldType === "number" || fieldType === "integer") {
      fields.push({
        name,
        label,
        description,
        type: "number",
        required: required.has(name),
        options: [],
        defaultValue: field.default
      });
      return;
    }

    if (fieldType === "string") {
      fields.push({
        name,
        label,
        description,
        type: "text",
        required: required.has(name),
        options: [],
        defaultValue: field.default,
        inputType:
          field.format === "password"
            ? "password"
            : field.format === "uri"
              ? "url"
              : "text"
      });
      return;
    }
  });

  return fields;
}

function getUnsupportedToolFieldNames(
  inputSchema: Record<string, unknown>,
  supportedFields: ToolSchemaField[]
) {
  const properties = toRecord(inputSchema.properties);
  if (!properties) {
    return [] as string[];
  }

  const supportedNames = new Set(supportedFields.map((field) => field.name));
  return Object.keys(properties).filter((fieldName) => !supportedNames.has(fieldName));
}

function readToolBinding(config: Record<string, unknown>) {
  const binding = toRecord(config.tool);
  if (!binding) {
    return null;
  }

  const toolId = typeof binding.toolId === "string" ? binding.toolId : "";
  if (!toolId) {
    return null;
  }

  return {
    toolId,
    ecosystem: typeof binding.ecosystem === "string" ? binding.ecosystem : "native",
    adapterId: typeof binding.adapterId === "string" ? binding.adapterId : "",
    timeoutMs: typeof binding.timeoutMs === "number" ? binding.timeoutMs : undefined,
    credentials: toRecord(binding.credentials) ?? {}
  };
}

function readToolInputValue(value: unknown, defaultValue: unknown) {
  if (value !== undefined) {
    return value;
  }
  return defaultValue;
}

function readReadableArtifacts(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ nodeId: string; artifactType: string }>;
  }

  return value.flatMap((item) => {
    const artifact = toRecord(item);
    if (!artifact) {
      return [];
    }
    const nodeId = typeof artifact.nodeId === "string" ? artifact.nodeId.trim() : "";
    const artifactType =
      typeof artifact.artifactType === "string" ? artifact.artifactType.trim() : "";
    if (!nodeId || !artifactType) {
      return [];
    }
    return [{ nodeId, artifactType }];
  });
}

function readBranchMode(config: Record<string, unknown>): BranchMode {
  if (toRecord(config.selector)) {
    return "selector";
  }
  if (typeof config.expression === "string" && config.expression.trim()) {
    return "expression";
  }
  return "fixed";
}

function readDefaultBranch(config: Record<string, unknown>) {
  if (typeof config.default === "string" && config.default.trim()) {
    return config.default;
  }
  if (typeof config.selected === "string" && config.selected.trim()) {
    return config.selected;
  }
  return "default";
}

function readSelectorRules(value: unknown, nodeType: string) {
  if (!Array.isArray(value) || value.length === 0) {
    return [createDefaultBranchRule(nodeType)];
  }

  return value.flatMap((item, index) => {
    const rule = toRecord(item);
    if (!rule) {
      return [];
    }
    return [
      {
        key:
          typeof rule.key === "string" && rule.key.trim()
            ? rule.key
            : `branch_${index + 1}`,
        path:
          typeof rule.path === "string" && rule.path.trim()
            ? rule.path
            : "trigger_input.value",
        operator:
          typeof rule.operator === "string" && rule.operator.trim()
            ? rule.operator
            : "eq",
        value: rule.value
      }
    ];
  });
}

function createDefaultBranchRule(nodeType: string, index = 1) {
  return {
    key: nodeType === "condition" && index === 1 ? "true" : `branch_${index}`,
    path: "trigger_input.value",
    operator: "eq",
    value: ""
  };
}

function formatBranchRuleValue(value: unknown) {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseBranchRuleValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (/^(\{|\[|true$|false$|null$|-?\d)/.test(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return value;
    }
  }

  return value;
}

function parseNumericFieldValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function dedupeArtifactRefs(values: Array<{ nodeId: string; artifactType: string }>) {
  const seen = new Set<string>();
  const nextValues: Array<{ nodeId: string; artifactType: string }> = [];

  values.forEach((value) => {
    const nodeId = value.nodeId.trim();
    const artifactType = value.artifactType.trim();
    if (!nodeId || !artifactType) {
      return;
    }
    const key = `${nodeId}:${artifactType}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    nextValues.push({ nodeId, artifactType });
  });

  return nextValues.sort((left, right) =>
    `${left.nodeId}:${left.artifactType}`.localeCompare(
      `${right.nodeId}:${right.artifactType}`
    )
  );
}

function cloneRecord(value: Record<string, unknown>) {
  return structuredClone(value);
}

function toRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}
