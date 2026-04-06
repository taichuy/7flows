"use client";

import { useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { Alert, Button, Divider, Input, Select, Space, Switch, Typography } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";

import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type { CredentialItem } from "@/lib/get-credentials";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type {
  NativeModelProviderCatalogItem,
  WorkspaceModelProviderConfigItem,
  WorkspaceModelProviderRegistryStatus
} from "@/lib/model-provider-registry";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import { WorkflowEditorJsonPanel } from "@/components/workflow-editor-inspector-panels/workflow-editor-json-panel";
import { WorkflowNodeConfigForm } from "@/components/workflow-node-config-form";
import { WorkflowNodeIoSchemaForm } from "@/components/workflow-node-config-form/node-io-schema-form";
import { WorkflowNodeRuntimePolicyForm } from "@/components/workflow-node-config-form/runtime-policy-form";
import {
  dedupeStrings,
  getSupportedToolSchemaFields,
  getUnsupportedToolFieldNames,
  toRecord
} from "@/components/workflow-node-config-form/shared";

const { Text, Title } = Typography;

type WorkflowEditorNodeSettingsPanelProps = {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  credentials: CredentialItem[];
  modelProviderCatalog?: NativeModelProviderCatalogItem[];
  modelProviderConfigs?: WorkspaceModelProviderConfigItem[];
  modelProviderRegistryStatus?: WorkspaceModelProviderRegistryStatus;
  currentHref?: string | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  highlightedNodeSection?: "config" | "contract" | "runtime" | null;
  highlightedNodeFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  nodeConfigText: string;
  onNodeConfigTextChange: (value: string) => void;
  onApplyNodeConfigJson: () => void;
  onNodeNameChange: (value: string) => void;
  onNodeConfigChange: (nextConfig: Record<string, unknown>) => void;
  onNodeInputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeOutputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeRuntimePolicyUpdate: (nextRuntimePolicy: Record<string, unknown> | undefined) => void;
  onDeleteSelectedNode: () => void;
};

type TriggerInputFieldDraft = {
  id: string;
  name: string;
  label: string;
  description: string;
  type: "text" | "number" | "boolean" | "select";
  required: boolean;
  optionsText: string;
  defaultValue: string;
};

const FIELD_TYPE_OPTIONS = [
  { label: "String", value: "text" },
  { label: "Number", value: "number" },
  { label: "Boolean", value: "boolean" },
  { label: "Select", value: "select" }
] as const;

export function WorkflowEditorNodeSettingsPanel({
  node,
  nodes,
  edges,
  tools,
  adapters,
  credentials,
  modelProviderCatalog = [],
  modelProviderConfigs = [],
  modelProviderRegistryStatus = "idle",
  currentHref = null,
  sandboxReadiness = null,
  highlightedNodeSection = null,
  highlightedNodeFieldPath = null,
  focusedValidationItem = null,
  nodeConfigText,
  onNodeConfigTextChange,
  onApplyNodeConfigJson,
  onNodeNameChange,
  onNodeConfigChange,
  onNodeInputSchemaChange,
  onNodeOutputSchemaChange,
  onNodeRuntimePolicyUpdate,
  onDeleteSelectedNode
}: WorkflowEditorNodeSettingsPanelProps) {
  const isTriggerNode = node.data.nodeType === "trigger";
  const downstreamNodes = useMemo(
    () =>
      dedupeStrings(
        edges
          .filter((edge) => edge.source === node.id)
          .map((edge) => nodes.find((candidate) => candidate.id === edge.target)?.data.label)
          .filter((label): label is string => Boolean(label))
      ),
    [edges, node.id, nodes]
  );

  return (
    <Space
      orientation="vertical"
      size={24}
      style={{ width: "100%" }}
      className="workflow-editor-node-settings-panel"
      data-component="workflow-editor-node-settings-panel"
    >
      <div className="workflow-editor-inspector-section">
        <div className="workflow-editor-inspector-section-title">节点名称</div>
        <Input
          value={node.data.label}
          onChange={(event) => onNodeNameChange(event.target.value)}
        />
      </div>

      {isTriggerNode ? (
        <WorkflowEditorTriggerInputFieldsSection
          node={node}
          downstreamNodes={downstreamNodes}
          onNodeInputSchemaChange={onNodeInputSchemaChange}
        />
      ) : null}

      {!isTriggerNode ? (
        <WorkflowNodeConfigForm
          node={node}
          nodes={nodes}
          tools={tools}
          adapters={adapters}
          credentials={credentials}
          modelProviderCatalog={modelProviderCatalog}
          modelProviderConfigs={modelProviderConfigs}
          modelProviderRegistryStatus={modelProviderRegistryStatus}
          currentHref={currentHref}
          sandboxReadiness={sandboxReadiness}
          highlightedFieldPath={highlightedNodeSection === "config" ? highlightedNodeFieldPath : null}
          focusedValidationItem={
            highlightedNodeSection === "config" ? focusedValidationItem : null
          }
          onChange={onNodeConfigChange}
        />
      ) : null}

      <Divider style={{ marginBlock: 0 }} />

      <WorkflowNodeIoSchemaForm
        node={node}
        currentHref={currentHref}
        onInputSchemaChange={onNodeInputSchemaChange}
        onOutputSchemaChange={onNodeOutputSchemaChange}
        highlighted={highlightedNodeSection === "contract"}
        highlightedFieldPath={
          highlightedNodeSection === "contract" ? highlightedNodeFieldPath : null
        }
        focusedValidationItem={
          highlightedNodeSection === "contract" ? focusedValidationItem : null
        }
        sandboxReadiness={sandboxReadiness}
      />

      <Divider style={{ marginBlock: 0 }} />

      <WorkflowNodeRuntimePolicyForm
        node={node}
        nodes={nodes}
        edges={edges}
        currentHref={currentHref}
        onChange={onNodeRuntimePolicyUpdate}
        highlighted={highlightedNodeSection === "runtime"}
        highlightedFieldPath={
          highlightedNodeSection === "runtime" ? highlightedNodeFieldPath : null
        }
        focusedValidationItem={
          highlightedNodeSection === "runtime" ? focusedValidationItem : null
        }
        sandboxReadiness={sandboxReadiness}
      />

      <Divider style={{ marginBlock: 0 }} />

      <WorkflowEditorJsonPanel
        nodeConfigText={nodeConfigText}
        onNodeConfigTextChange={onNodeConfigTextChange}
        onApplyNodeConfigJson={onApplyNodeConfigJson}
        onDeleteSelectedNode={onDeleteSelectedNode}
      />
    </Space>
  );
}

function WorkflowEditorTriggerInputFieldsSection({
  node,
  downstreamNodes,
  onNodeInputSchemaChange
}: {
  node: Node<WorkflowCanvasNodeData>;
  downstreamNodes: string[];
  onNodeInputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
}) {
  const [fields, setFields] = useState<TriggerInputFieldDraft[]>(() =>
    buildTriggerInputFieldDrafts(node.data.inputSchema)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputSchemaRecord = useMemo(
    () => toRecord(node.data.inputSchema) ?? {},
    [node.data.inputSchema]
  );
  const supportedFieldNames = useMemo(
    () => getSupportedToolSchemaFields(inputSchemaRecord).map((field) => field.name),
    [inputSchemaRecord]
  );
  const unsupportedFieldNames = useMemo(
    () =>
      getUnsupportedToolFieldNames(inputSchemaRecord, getSupportedToolSchemaFields(inputSchemaRecord)),
    [inputSchemaRecord]
  );

  useEffect(() => {
    setFields(buildTriggerInputFieldDrafts(node.data.inputSchema));
    setErrorMessage(null);
  }, [node.id, node.data.inputSchema]);

  const updateField = (
    fieldId: string,
    patch: Partial<TriggerInputFieldDraft>
  ) => {
    setFields((current) =>
      current.map((field) => (field.id === fieldId ? { ...field, ...patch } : field))
    );
  };

  const handleApply = () => {
    const validationError = validateTriggerFieldDrafts(fields);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    onNodeInputSchemaChange(
      buildTriggerInputSchema({
        previousSchema: node.data.inputSchema,
        fields,
        supportedFieldNames,
        unsupportedFieldNames
      })
    );
  };

  return (
    <div
      className="workflow-editor-trigger-fields-section"
      data-component="workflow-editor-trigger-fields-section"
    >
      <div className="workflow-editor-trigger-fields-header">
        <div>
          <Text className="workflow-editor-trigger-fields-eyebrow">Trigger settings</Text>
          <Title level={5} style={{ margin: "4px 0 0" }}>
            输入字段
          </Title>
          <Text type="secondary">
            这些字段会作为 workflow run 的 `input_payload` 进入入口节点，并在运行时以
            `trigger_input.*` 读取。
          </Text>
        </div>
        <Button
          type="default"
          icon={<PlusOutlined />}
          onClick={() =>
            setFields((current) => [
              ...current,
              createEmptyTriggerInputFieldDraft(current.length + 1)
            ])
          }
        >
          新增字段
        </Button>
      </div>

      {unsupportedFieldNames.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title="当前 trigger inputSchema 含复杂字段"
          description={`结构化编辑会保留 ${unsupportedFieldNames.join("、")}，但复杂对象 / 数组仍建议直接在下方 I/O schema JSON 里维护。`}
        />
      ) : null}

      {errorMessage ? (
        <Alert type="error" showIcon title="输入字段未通过校验" description={errorMessage} />
      ) : null}

      <div className="workflow-editor-trigger-fields-list">
        {fields.length === 0 ? (
          <div className="workflow-editor-trigger-empty">
            <Text type="secondary">
              当前入口节点还没有显式输入字段。你可以保持空输入，或者新增几个结构化字段作为运行入口。
            </Text>
          </div>
        ) : (
          fields.map((field, index) => (
            <div
              key={field.id}
              className="workflow-editor-trigger-field-card"
              data-component="workflow-editor-trigger-field-card"
            >
              <div className="workflow-editor-trigger-field-main-row">
                <Input
                  value={field.name}
                  placeholder={`字段 key ${index + 1}`}
                  onChange={(event) => updateField(field.id, { name: event.target.value })}
                />
                <Select
                  value={field.type}
                  options={FIELD_TYPE_OPTIONS.map((item) => ({
                    label: item.label,
                    value: item.value
                  }))}
                  onChange={(value) =>
                    updateField(field.id, { type: value as TriggerInputFieldDraft["type"] })
                  }
                />
                <div className="workflow-editor-trigger-field-required">
                  <span>必填</span>
                  <Switch
                    checked={field.required}
                    onChange={(checked) => updateField(field.id, { required: checked })}
                  />
                </div>
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    setFields((current) =>
                      current.filter((candidate) => candidate.id !== field.id)
                    )
                  }
                />
              </div>

              <div className="workflow-editor-trigger-field-detail-row">
                <Input
                  value={field.label}
                  placeholder="展示名称"
                  onChange={(event) => updateField(field.id, { label: event.target.value })}
                />
                <Input
                  value={field.defaultValue}
                  placeholder="默认值（可选）"
                  onChange={(event) =>
                    updateField(field.id, { defaultValue: event.target.value })
                  }
                />
              </div>

              <Input.TextArea
                rows={2}
                value={field.description}
                placeholder="字段描述（可选）"
                onChange={(event) => updateField(field.id, { description: event.target.value })}
              />

              {field.type === "select" ? (
                <Input.TextArea
                  rows={3}
                  value={field.optionsText}
                  placeholder="每行一个可选值"
                  onChange={(event) => updateField(field.id, { optionsText: event.target.value })}
                />
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="workflow-editor-trigger-fields-actions">
        <Button type="primary" onClick={handleApply}>
          应用输入字段
        </Button>
        <Button
          onClick={() => {
            setFields([]);
            setErrorMessage(null);
            onNodeInputSchemaChange(undefined);
          }}
        >
          清空字段
        </Button>
      </div>

      <div className="workflow-editor-trigger-next-step">
        <div className="workflow-editor-inspector-section-title">下一步</div>
        {downstreamNodes.length > 0 ? (
          <div className="workflow-editor-trigger-next-step-list">
            {downstreamNodes.map((label) => (
              <div key={label} className="workflow-editor-trigger-next-step-card">
                <span className="workflow-editor-trigger-next-step-node">入口</span>
                <span className="workflow-editor-trigger-next-step-arrow">→</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        ) : (
          <Text type="secondary">当前入口节点还没有连接到后续节点。</Text>
        )}
      </div>
    </div>
  );
}

function buildTriggerInputFieldDrafts(
  value: Record<string, unknown> | null | undefined
): TriggerInputFieldDraft[] {
  const schema = toRecord(value) ?? {};
  const fields = getSupportedToolSchemaFields(schema);

  if (fields.length === 0) {
    return [];
  }

  return fields.map((field, index) => ({
    id: createTriggerFieldId(field.name || `field_${index + 1}`),
    name: field.name,
    label: field.label,
    description: field.description,
    type: field.type,
    required: field.required,
    optionsText: field.options.join("\n"),
    defaultValue:
      field.defaultValue === undefined
        ? ""
        : typeof field.defaultValue === "string"
          ? field.defaultValue
          : JSON.stringify(field.defaultValue)
  }));
}

function buildTriggerInputSchema({
  previousSchema,
  fields,
  supportedFieldNames,
  unsupportedFieldNames
}: {
  previousSchema: Record<string, unknown> | null | undefined;
  fields: TriggerInputFieldDraft[];
  supportedFieldNames: string[];
  unsupportedFieldNames: string[];
}) {
  const previous = toRecord(previousSchema) ?? {};
  const previousProperties = toRecord(previous.properties) ?? {};
  const unsupportedProperties = Object.fromEntries(
    unsupportedFieldNames
      .map((fieldName) => [fieldName, previousProperties[fieldName]])
      .filter((entry): entry is [string, unknown] => entry[1] !== undefined)
  );
  const unsupportedRequired = readRequiredFieldNames(previous).filter((fieldName) =>
    unsupportedFieldNames.includes(fieldName)
  );

  const nextProperties: Record<string, unknown> = { ...unsupportedProperties };
  const nextRequired = new Set(unsupportedRequired);

  fields.forEach((field) => {
    const normalizedName = field.name.trim();
    if (!normalizedName) {
      return;
    }

    nextProperties[normalizedName] = buildTriggerFieldSchema(field);
    if (field.required) {
      nextRequired.add(normalizedName);
    } else {
      nextRequired.delete(normalizedName);
    }
  });

  supportedFieldNames.forEach((fieldName) => {
    if (!fields.some((field) => field.name.trim() === fieldName)) {
      delete nextProperties[fieldName];
      nextRequired.delete(fieldName);
    }
  });

  if (Object.keys(nextProperties).length === 0) {
    return undefined;
  }

  const nextSchema: Record<string, unknown> = {
    ...previous,
    type: "object",
    properties: nextProperties
  };

  if (nextRequired.size > 0) {
    nextSchema.required = [...nextRequired];
  } else {
    delete nextSchema.required;
  }

  return nextSchema;
}

function buildTriggerFieldSchema(field: TriggerInputFieldDraft) {
  const baseField: Record<string, unknown> = {
    type:
      field.type === "text"
        ? "string"
        : field.type === "number"
          ? "number"
          : field.type === "boolean"
            ? "boolean"
            : "string"
  };

  if (field.label.trim()) {
    baseField.title = field.label.trim();
  }

  if (field.description.trim()) {
    baseField.description = field.description.trim();
  }

  if (field.type === "select") {
    const options = field.optionsText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (options.length > 0) {
      baseField.enum = options;
    }
  }

  const normalizedDefaultValue = field.defaultValue.trim();
  if (normalizedDefaultValue) {
    if (field.type === "number") {
      const parsed = Number(normalizedDefaultValue);
      if (!Number.isNaN(parsed)) {
        baseField.default = parsed;
      }
    } else if (field.type === "boolean") {
      if (normalizedDefaultValue === "true" || normalizedDefaultValue === "false") {
        baseField.default = normalizedDefaultValue === "true";
      }
    } else {
      baseField.default = normalizedDefaultValue;
    }
  }

  return baseField;
}

function validateTriggerFieldDrafts(fields: TriggerInputFieldDraft[]) {
  const normalizedNames = fields.map((field) => field.name.trim()).filter(Boolean);

  if (fields.some((field) => !field.name.trim())) {
    return "字段 key 不能为空。";
  }

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return "字段 key 不能重复。";
  }

  const invalidSelectField = fields.find(
    (field) =>
      field.type === "select" &&
      field.optionsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean).length === 0
  );
  if (invalidSelectField) {
    return `字段 ${invalidSelectField.name} 选择了 Select，但还没有提供可选值。`;
  }

  return null;
}

function readRequiredFieldNames(schema: Record<string, unknown>) {
  return Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
}

function createTriggerFieldId(seed: string) {
  const normalizedSeed = seed.trim() || "field";
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${normalizedSeed}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${normalizedSeed}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyTriggerInputFieldDraft(index: number): TriggerInputFieldDraft {
  return {
    id: createTriggerFieldId(`field_${index}`),
    name: `field_${index}`,
    label: "",
    description: "",
    type: "text",
    required: false,
    optionsText: "",
    defaultValue: ""
  };
}
