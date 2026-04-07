"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Node } from "@xyflow/react";
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography
} from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";

import { triggerWorkflowNodeTrialRun } from "@/app/actions/runs";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { RunDetail } from "@/lib/get-run-detail";
import {
  cleanNodePayload,
  formatDurationMs,
  formatJsonPayload
} from "@/lib/runtime-presenters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import {
  resolveWorkflowNodeInputSchema,
  type WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import { WorkflowNodeIoSchemaForm } from "@/components/workflow-node-config-form/node-io-schema-form";
import {
  getSupportedToolSchemaFields,
  getUnsupportedToolFieldNames,
  toRecord
} from "@/components/workflow-node-config-form/shared";

const { Text, Title } = Typography;

export type WorkflowEditorNodeRuntimePanelProps = {
  workflowId: string;
  node: Node<WorkflowCanvasNodeData>;
  run?: RunDetail | null;
  currentHref?: string | null;
  onNodeInputSchemaChange?: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeOutputSchemaChange?: (nextSchema: Record<string, unknown> | undefined) => void;
  highlightedNodeSection?: "config" | "contract" | "runtime" | null;
  highlightedNodeFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  onRunSuccess?: (runId?: string | null) => void;
  onRunError?: (message: string) => void;
  onOpenRunOverlay?: () => void;
};

export function WorkflowEditorNodeRuntimePanel({
  workflowId,
  node,
  run = null,
  currentHref = null,
  onNodeInputSchemaChange,
  onNodeOutputSchemaChange,
  highlightedNodeSection = null,
  highlightedNodeFieldPath = null,
  focusedValidationItem = null,
  sandboxReadiness = null,
  onRunSuccess,
  onRunError,
  onOpenRunOverlay
}: WorkflowEditorNodeRuntimePanelProps) {
  const [form] = Form.useForm();
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [lastTriggeredRunId, setLastTriggeredRunId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resolvedInputSchema = useMemo(
    () => resolveWorkflowNodeInputSchema(node.data.nodeType, node.data.inputSchema),
    [node.data.inputSchema, node.data.nodeType]
  );
  const supportedFields = useMemo(
    () => getSupportedToolSchemaFields(toRecord(resolvedInputSchema) ?? {}),
    [resolvedInputSchema]
  );
  const unsupportedFieldNames = useMemo(
    () =>
      getUnsupportedToolFieldNames(toRecord(resolvedInputSchema) ?? {}, supportedFields),
    [resolvedInputSchema, supportedFields]
  );
  const currentNodeRun = useMemo(
    () => run?.node_runs.find((item) => item.node_id === node.id) ?? null,
    [node.id, run]
  );
  const currentNodeInputJson = useMemo(
    () => formatJsonPayload(cleanNodePayload(currentNodeRun?.input_payload) ?? null),
    [currentNodeRun?.input_payload]
  );
  const currentNodeOutputJson = useMemo(
    () => formatJsonPayload(cleanNodePayload(currentNodeRun?.output_payload) ?? null),
    [currentNodeRun?.output_payload]
  );

  useEffect(() => {
    form.resetFields();
    form.setFieldsValue(
      Object.fromEntries(
        supportedFields
          .filter((field) => field.defaultValue !== undefined)
          .map((field) => [field.name, field.defaultValue])
      )
    );
    setStatusMessage(null);
    setLastTriggeredRunId(null);
  }, [form, node.id, supportedFields]);

  const handleSubmit = (values: Record<string, unknown>) => {
    const payload = buildRuntimePayload(values, supportedFields);
    startTransition(async () => {
      const result = await triggerWorkflowNodeTrialRun(workflowId, node.id, payload);

      if (result.status === "success") {
        setLastTriggeredRunId(result.runId ?? null);
        setStatusMessage({
          type: "success",
          text: result.runId
            ? `试运行已提交，run ${result.runId} 已写入运行缓存。`
            : "试运行已提交。"
        });
        onRunSuccess?.(result.runId ?? null);
        return;
      }

      setStatusMessage({
        type: "error",
        text: result.message
      });
      onRunError?.(result.message);
    });
  };

  return (
    <Space
      orientation="vertical"
      size={24}
      style={{ width: "100%" }}
      data-component="workflow-editor-node-runtime-panel"
    >
      <div className="workflow-editor-runtime-summary-card">
        <div>
          <Text className="workflow-editor-trigger-fields-eyebrow">Runtime</Text>
          <Title level={5} style={{ margin: "4px 0 0" }}>
            当前节点运行态
          </Title>
          <Text type="secondary">
            这里承接节点最近一次运行反馈。试运行会把当前节点包装成最小 7Flows IR 执行，并把结果写入
            `runs / node_runs / run_events`。
          </Text>
        </div>

        <div className="workflow-editor-runtime-summary-grid">
          <div className="workflow-editor-runtime-summary-item">
            <span>状态</span>
            <strong>{node.data.runStatus ?? "尚无 node run"}</strong>
          </div>
          <div className="workflow-editor-runtime-summary-item">
            <span>Node run</span>
            <strong>{node.data.runNodeId ?? "n/a"}</strong>
          </div>
          <div className="workflow-editor-runtime-summary-item">
            <span>耗时</span>
            <strong>{formatDurationMs(node.data.runDurationMs)}</strong>
          </div>
          <div className="workflow-editor-runtime-summary-item">
            <span>事件</span>
            <strong>
              {typeof node.data.runEventCount === "number" ? node.data.runEventCount : "n/a"}
            </strong>
          </div>
        </div>

        {node.data.runLastEventType ? (
          <Text type="secondary">最近事件：{node.data.runLastEventType}</Text>
        ) : null}
        {node.data.runErrorMessage ? (
          <Alert
            type="error"
            showIcon
            title="最近一次运行返回错误"
            description={node.data.runErrorMessage}
          />
        ) : null}

        {onOpenRunOverlay ? (
          <div className="workflow-editor-trigger-fields-actions">
            <Button onClick={onOpenRunOverlay}>打开运行面板</Button>
            {lastTriggeredRunId ? (
              <Text type="secondary">最近试运行的 run: {lastTriggeredRunId}</Text>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="workflow-editor-runtime-form-card">
        <div className="workflow-editor-inspector-section">
          <div className="workflow-editor-inspector-section-title">试运行输入</div>
          <Text type="secondary">
            这里只提供本次试运行的直接输入，不自动补齐原工作流上游节点的真实 context。
            要查看完整链路，请继续从整条 workflow 的运行入口发起执行。
          </Text>
        </div>

        {unsupportedFieldNames.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            title="部分字段无法在结构化试运行表单里输入"
            description={`当前仅支持 string / number / boolean / select / string[]。${unsupportedFieldNames.join("、")} 仍需通过 API 或 JSON schema 约束来补齐。`}
          />
        ) : null}

        {statusMessage ? (
          <Alert
            type={statusMessage.type}
            showIcon
            title={statusMessage.type === "success" ? "试运行已提交" : "试运行失败"}
            description={statusMessage.text}
          />
        ) : null}

        {supportedFields.length === 0 ? (
          <div className="workflow-editor-trigger-empty">
            <Text type="secondary">
              当前节点没有结构化输入字段，可以直接发起一次空输入试运行。
            </Text>
            <div className="workflow-editor-trigger-fields-actions">
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={isPending}
                onClick={() => handleSubmit({})}
              >
                试运行当前节点
              </Button>
            </div>
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            className="workflow-editor-runtime-form"
          >
            {supportedFields.map((field) => {
              if (field.type === "boolean") {
                return (
                  <Form.Item
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                );
              }

              if (field.type === "number") {
                return (
                  <Form.Item
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    extra={field.description || undefined}
                    rules={[
                      {
                        required: field.required,
                        message: `请输入 ${field.label}`
                      }
                    ]}
                  >
                    <InputNumber style={{ width: "100%" }} />
                  </Form.Item>
                );
              }

              if (field.type === "select") {
                return (
                  <Form.Item
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    extra={field.description || undefined}
                    rules={[
                      {
                        required: field.required,
                        message: `请选择 ${field.label}`
                      }
                    ]}
                  >
                    <Select
                      options={field.options.map((option) => ({
                        label: option,
                        value: option
                      }))}
                    />
                  </Form.Item>
                );
              }

              if (field.type === "array") {
                return (
                  <Form.Item
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    extra={field.description || "按标签录入文件引用。"}
                    rules={[
                      {
                        required: field.required,
                        message: `请输入 ${field.label}`
                      }
                    ]}
                  >
                    <Select mode="tags" tokenSeparators={[","]} open={false} />
                  </Form.Item>
                );
              }

              return (
                <Form.Item
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  extra={field.description || undefined}
                  rules={[
                    {
                      required: field.required,
                      message: `请输入 ${field.label}`
                    }
                  ]}
                >
                  <Input />
                </Form.Item>
              );
            })}

            <div className="workflow-editor-trigger-fields-actions">
              <Button onClick={() => form.resetFields()}>重置</Button>
              <Button
                type="primary"
                htmlType="submit"
                icon={<PlayCircleOutlined />}
                loading={isPending}
              >
                试运行当前节点
              </Button>
            </div>
          </Form>
        )}
      </div>

      <div className="workflow-editor-runtime-form-card" data-component="workflow-editor-node-runtime-results">
        <div className="workflow-editor-inspector-section">
          <div className="workflow-editor-inspector-section-title">运行后结果</div>
          <Text type="secondary">
            这里展示当前选中 run 里该节点最近一次 node run 的 input / output JSON。
          </Text>
        </div>

        {!run ? (
          <Text type="secondary">
            完成一次试运行后，这里会显示该节点最近一次 node run 的输入输出 JSON。
          </Text>
        ) : !currentNodeRun ? (
          <Alert
            type="info"
            showIcon
            title="当前 run 还没有命中这个节点"
            description="先执行一次试运行，或从运行面板切到包含该节点的 run。"
          />
        ) : (
          <Form layout="vertical">
            <Text type="secondary">当前 run：{run.id}</Text>
            <Form.Item label="Input JSON">
              <Input.TextArea readOnly autoSize={{ minRows: 4, maxRows: 12 }} value={currentNodeInputJson} />
            </Form.Item>
            <Form.Item label="Output JSON">
              <Input.TextArea readOnly autoSize={{ minRows: 4, maxRows: 12 }} value={currentNodeOutputJson} />
            </Form.Item>
          </Form>
        )}
      </div>

      {node.data.nodeType === "startNode" && onNodeInputSchemaChange && onNodeOutputSchemaChange ? (
        <div className="workflow-editor-runtime-form-card" data-component="workflow-editor-node-runtime-contract">
          <div className="workflow-editor-inspector-section">
            <div className="workflow-editor-inspector-section-title">高级系统设置</div>
            <Text type="secondary">
              开始节点的 input / output schema JSON 统一收口到运行时标签里维护。
            </Text>
          </div>

          <WorkflowNodeIoSchemaForm
            node={node}
            currentHref={currentHref}
            onInputSchemaChange={onNodeInputSchemaChange}
            onOutputSchemaChange={onNodeOutputSchemaChange}
            highlighted={highlightedNodeSection === "contract"}
            highlightedFieldPath={highlightedNodeSection === "contract" ? highlightedNodeFieldPath : null}
            focusedValidationItem={highlightedNodeSection === "contract" ? focusedValidationItem : null}
            sandboxReadiness={sandboxReadiness}
          />
        </div>
      ) : null}
    </Space>
  );
}

function buildRuntimePayload(
  values: Record<string, unknown>,
  fields: ReturnType<typeof getSupportedToolSchemaFields>
) {
  const payload: Record<string, unknown> = {};

  fields.forEach((field) => {
    const value = values[field.name];

    if (field.type === "boolean") {
      if (typeof value === "boolean") {
        payload[field.name] = value;
      }
      return;
    }

    if (field.type === "array") {
      if (Array.isArray(value) && value.length > 0) {
        payload[field.name] = value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
      }
      return;
    }

    if (value === undefined || value === null || value === "") {
      return;
    }

    payload[field.name] = value;
  });

  return payload;
}
