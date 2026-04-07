"use client";

import { useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import {
  Alert,
  Button,
  Collapse,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Typography
} from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";

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
import {
  buildDefaultStartNodeInputSchema,
  resolveWorkflowNodeInputSchema
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
  type: "text" | "number" | "boolean" | "select" | "array";
  required: boolean;
  optionsText: string;
  defaultValue: string;
};

const FIELD_TYPE_OPTIONS = [
  { label: "String", value: "text" },
  { label: "Number", value: "number" },
  { label: "Boolean", value: "boolean" },
  { label: "Select", value: "select" },
  { label: "Array", value: "array" }
] as const;

const LOCKED_START_FIELD_NAMES = new Set(["query", "files"]);

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
  onNodeConfigChange,
  onNodeInputSchemaChange,
  onNodeOutputSchemaChange,
  onNodeRuntimePolicyUpdate,
  onDeleteSelectedNode
}: WorkflowEditorNodeSettingsPanelProps) {
  const isTriggerNode = node.data.nodeType === "startNode";
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

  const highlightedAdvancedKeys = useMemo(
    () => resolveAdvancedSectionKeys({ highlightedNodeSection, isTriggerNode }),
    [highlightedNodeSection, isTriggerNode]
  );
  const [expandedSectionKeys, setExpandedSectionKeys] = useState<string[]>(highlightedAdvancedKeys);

  useEffect(() => {
    setExpandedSectionKeys(highlightedAdvancedKeys);
  }, [highlightedAdvancedKeys, node.id]);

  return (
    <Space
      orientation="vertical"
      size={20}
      style={{ width: "100%" }}
      className="workflow-editor-node-settings-panel"
      data-component="workflow-editor-node-settings-panel"
    >
      {isTriggerNode ? (
        <WorkflowEditorTriggerInputFieldsSection
          node={node}
          downstreamNodes={downstreamNodes}
          onNodeInputSchemaChange={onNodeInputSchemaChange}
        />
      ) : (
        <div
          className="workflow-editor-node-settings-primary"
          data-component="workflow-editor-node-settings-primary"
        >
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
        </div>
      )}

      {!isTriggerNode ? (
        <Collapse
          activeKey={expandedSectionKeys}
          onChange={(keys) =>
            setExpandedSectionKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])
          }
          className="workflow-editor-node-settings-advanced"
          items={[
            {
              key: "advanced",
              label: "高级设置",
              children: (
                <Space
                  orientation="vertical"
                  size={20}
                  style={{ width: "100%" }}
                  className="workflow-editor-node-settings-advanced-content"
                >
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
                </Space>
              )
            },
            {
              key: "json",
              label: "原始 JSON",
              children: (
                <WorkflowEditorJsonPanel
                  nodeConfigText={nodeConfigText}
                  onNodeConfigTextChange={onNodeConfigTextChange}
                  onApplyNodeConfigJson={onApplyNodeConfigJson}
                  onDeleteSelectedNode={onDeleteSelectedNode}
                />
              )
            }
          ]}
        />
      ) : null}
    </Space>
  );
}

function resolveAdvancedSectionKeys({
  highlightedNodeSection,
  isTriggerNode
}: {
  highlightedNodeSection: "config" | "contract" | "runtime" | null;
  isTriggerNode: boolean;
}) {
  if (highlightedNodeSection === "contract") {
    return ["advanced"];
  }

  if (highlightedNodeSection === "runtime" && !isTriggerNode) {
    return ["advanced"];
  }

  return [];
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
  const [createFieldForm] = Form.useForm<TriggerInputFieldDraft>();
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const resolvedInputSchema = useMemo(
    () => resolveWorkflowNodeInputSchema(node.data.nodeType, node.data.inputSchema),
    [node.data.inputSchema, node.data.nodeType]
  );
  const [fields, setFields] = useState<TriggerInputFieldDraft[]>(() =>
    buildTriggerInputFieldDrafts(resolvedInputSchema)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputSchemaRecord = useMemo(
    () => toRecord(resolvedInputSchema) ?? {},
    [resolvedInputSchema]
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
    setFields(buildTriggerInputFieldDrafts(resolvedInputSchema));
    setErrorMessage(null);
    setEditingFieldId(null);
    setIsFieldModalOpen(false);
    createFieldForm.resetFields();
  }, [createFieldForm, node.id, resolvedInputSchema]);

  const persistFields = (nextFields: TriggerInputFieldDraft[]) => {
    const validationError = validateTriggerFieldDrafts(nextFields);
    if (validationError) {
      setErrorMessage(validationError);
      return false;
    }

    setErrorMessage(null);
    setFields(nextFields);
    onNodeInputSchemaChange(
      buildTriggerInputSchema({
        previousSchema: resolvedInputSchema,
        fields: nextFields,
        supportedFieldNames,
        unsupportedFieldNames
      })
    );
    return true;
  };

  const handleOpenCreateFieldModal = () => {
    setEditingFieldId(null);
    createFieldForm.setFieldsValue({
      name: "",
      label: "",
      description: "",
      type: "text",
      required: false,
      optionsText: "",
      defaultValue: ""
    });
    setIsFieldModalOpen(true);
  };

  const handleOpenEditFieldModal = (fieldId: string) => {
    const field = fields.find((item) => item.id === fieldId);
    if (!field) {
      return;
    }

    setEditingFieldId(fieldId);
    createFieldForm.setFieldsValue(field);
    setIsFieldModalOpen(true);
  };

  const handleSubmitField = async () => {
    let values: TriggerInputFieldDraft;

    try {
      values = await createFieldForm.validateFields();
    } catch {
      return;
    }

    const nextField: TriggerInputFieldDraft = {
      id:
        editingFieldId ?? createTriggerFieldId(values.name || `field_${fields.length + 1}`),
      name: values.name ?? "",
      label: values.label ?? "",
      description: values.description ?? "",
      type: values.type ?? "text",
      required: Boolean(values.required),
      optionsText: values.optionsText ?? "",
      defaultValue: values.defaultValue ?? ""
    };

    const nextFields = editingFieldId
      ? fields.map((field) => (field.id === editingFieldId ? nextField : field))
      : [...fields, nextField];

    if (!persistFields(nextFields)) {
      return;
    }

    setEditingFieldId(null);
    setIsFieldModalOpen(false);
    createFieldForm.resetFields();
  };

  const createFieldType = Form.useWatch("type", createFieldForm);

  return (
    <div
      className="workflow-editor-trigger-fields-section"
      data-component="workflow-editor-trigger-fields-section"
    >
      <div className="workflow-editor-trigger-fields-header">
        <div>
          <Title level={5} style={{ margin: 0 }}>
            输入字段
          </Title>
        </div>
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          onClick={handleOpenCreateFieldModal}
        >
          新增参数
        </Button>
      </div>

      {unsupportedFieldNames.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title="当前 trigger inputSchema 含复杂字段"
          description={`结构化编辑会保留 ${unsupportedFieldNames.join("、")}，但复杂对象仍建议直接在下方 I/O schema JSON 里维护。`}
        />
      ) : null}

      {errorMessage ? (
        <Alert type="error" showIcon title="输入字段未通过校验" description={errorMessage} />
      ) : null}

      <div className="workflow-editor-trigger-fields-list">
        {fields.length === 0
          ? null
          : fields.map((field, index) => (
            <div
              key={field.id}
              className="workflow-editor-trigger-field-card"
              data-component="workflow-editor-trigger-field-card"
            >
              <div className="workflow-editor-trigger-field-compact-main">
                <span className="workflow-editor-trigger-field-compact-name">
                  {field.name || `field_${index + 1}`}
                </span>
                <span className="workflow-editor-trigger-field-compact-type">
                  {formatTriggerFieldTypeLabel(field.type)}
                </span>
              </div>
              <div className="workflow-editor-trigger-field-compact-actions">
                {isLockedStartField(field.name) ? null : (
                  <>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      aria-label={`编辑参数 ${field.name}`}
                      onClick={() => handleOpenEditFieldModal(field.id)}
                    />
                    <Button
                      danger
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      aria-label={`删除参数 ${field.name}`}
                      onClick={() =>
                        persistFields(fields.filter((candidate) => candidate.id !== field.id))
                      }
                    />
                  </>
                )}
              </div>
            </div>
          ))}
      </div>

      <div className="workflow-editor-trigger-fields-actions">
        <Button
          size="small"
          onClick={() => {
            const defaultSchema = buildDefaultStartNodeInputSchema();
            setFields(buildTriggerInputFieldDrafts(defaultSchema));
            setErrorMessage(null);
            onNodeInputSchemaChange(defaultSchema);
          }}
        >
          恢复默认参数
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

      <Modal
        title={editingFieldId ? "编辑开始节点参数" : "新增开始节点参数"}
        open={isFieldModalOpen}
        width={420}
        onOk={() => void handleSubmitField()}
        onCancel={() => {
          setEditingFieldId(null);
          setIsFieldModalOpen(false);
        }}
        okText={editingFieldId ? "保存参数" : "添加参数"}
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={createFieldForm} layout="vertical">
          <Form.Item
            name="name"
            label="参数 key"
            rules={[{ required: true, message: "请输入参数 key" }]}
          >
            <Input placeholder="例如：query / files" />
          </Form.Item>
          <Form.Item name="label" label="展示名称">
            <Input placeholder="例如：Query / Files" />
          </Form.Item>
          <Form.Item name="type" label="参数类型" initialValue="text">
            <Select
              options={FIELD_TYPE_OPTIONS.map((item) => ({
                label: item.label,
                value: item.value
              }))}
            />
          </Form.Item>
          <Form.Item name="required" label="必填" valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
          <Form.Item name="defaultValue" label="默认值">
            <Input placeholder={createFieldType === "array" ? "可写 JSON 数组或每行一个值" : "可选"} />
          </Form.Item>
          <Form.Item name="description" label="字段描述">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
          {createFieldType === "select" ? (
            <Form.Item
              name="optionsText"
              label="可选值"
              rules={[{ required: true, message: "请输入至少一个可选值" }]}
            >
              <Input.TextArea rows={3} placeholder="每行一个可选值" />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
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
            : field.type === "array"
              ? "array"
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

  if (field.type === "array") {
    baseField.items = { type: "string" };
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
    } else if (field.type === "array") {
      const parsed = parseArrayDefaultValue(normalizedDefaultValue);
      if (parsed.length > 0) {
        baseField.default = parsed;
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

function formatTriggerFieldTypeLabel(type: TriggerInputFieldDraft["type"]) {
  switch (type) {
    case "number":
      return "Number";
    case "boolean":
      return "Boolean";
    case "select":
      return "Select";
    case "array":
      return "Array";
    case "text":
    default:
      return "String";
  }
}

function isLockedStartField(fieldName: string) {
  return LOCKED_START_FIELD_NAMES.has(fieldName.trim());
}

function parseArrayDefaultValue(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return [] as string[];
  }

  if (normalized.startsWith("[")) {
    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        );
      }
    } catch {
      return [] as string[];
    }
  }

  return normalized
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
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
