"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Node } from "@xyflow/react";
import { Alert, Button, Form, Input, InputNumber, Select, Space, Switch, Typography } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";

import { triggerWorkflowRun } from "@/app/actions/runs";
import { formatDurationMs } from "@/lib/runtime-presenters";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import {
  getSupportedToolSchemaFields,
  getUnsupportedToolFieldNames,
  toRecord
} from "@/components/workflow-node-config-form/shared";

const { Text, Title } = Typography;

export type WorkflowEditorNodeRuntimePanelProps = {
  workflowId: string;
  node: Node<WorkflowCanvasNodeData>;
  onRunSuccess?: (runId?: string | null) => void;
  onRunError?: (message: string) => void;
  onOpenRunOverlay?: () => void;
};

export function WorkflowEditorNodeRuntimePanel({
  workflowId,
  node,
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
  const supportedFields = useMemo(
    () => getSupportedToolSchemaFields(toRecord(node.data.inputSchema) ?? {}),
    [node.data.inputSchema]
  );
  const unsupportedFieldNames = useMemo(
    () =>
      getUnsupportedToolFieldNames(
        toRecord(node.data.inputSchema) ?? {},
        supportedFields
      ),
    [node.data.inputSchema, supportedFields]
  );
  const isTriggerNode = node.data.nodeType === "trigger";

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
      const result = await triggerWorkflowRun(workflowId, payload);

      if (result.status === "success") {
        setLastTriggeredRunId(result.runId ?? null);
        setStatusMessage({
          type: "success",
          text: result.runId
            ? `运行已触发，run ${result.runId} 已进入 runtime。`
            : "运行已触发。"
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
            这里承接节点最近一次运行反馈。Trigger 额外支持直接填入入口参数并触发整条 workflow。
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
            <strong>{typeof node.data.runEventCount === "number" ? node.data.runEventCount : "n/a"}</strong>
          </div>
        </div>

        {node.data.runLastEventType ? (
          <Text type="secondary">最近事件：{node.data.runLastEventType}</Text>
        ) : null}
        {node.data.runErrorMessage ? (
          <Alert type="error" showIcon title="最近一次运行返回错误" description={node.data.runErrorMessage} />
        ) : null}

        {onOpenRunOverlay ? (
          <div className="workflow-editor-trigger-fields-actions">
            <Button onClick={onOpenRunOverlay}>打开运行面板</Button>
            {lastTriggeredRunId ? (
              <Text type="secondary">最近触发的 run: {lastTriggeredRunId}</Text>
            ) : null}
          </div>
        ) : null}
      </div>

      {isTriggerNode ? (
        <div className="workflow-editor-runtime-form-card">
          <div className="workflow-editor-inspector-section">
            <div className="workflow-editor-inspector-section-title">运行时输入</div>
            <Text type="secondary">
              这层直接走现有 `/api/workflows/{workflowId}/runs`，不会伪造不存在的单节点执行链路。
            </Text>
          </div>

          {unsupportedFieldNames.length > 0 ? (
            <Alert
              type="warning"
              showIcon
              title="部分字段无法在结构化运行时表单里输入"
              description={`当前仅支持 string / number / boolean / select。${unsupportedFieldNames.join("、")} 仍需通过 API 或下方 JSON schema 约束来补齐。`}
            />
          ) : null}

          {statusMessage ? (
            <Alert
              type={statusMessage.type}
              showIcon
              title={statusMessage.type === "success" ? "运行已提交" : "运行失败"}
              description={statusMessage.text}
            />
          ) : null}

          {supportedFields.length === 0 ? (
            <div className="workflow-editor-trigger-empty">
              <Text type="secondary">
                当前 trigger 没有结构化输入字段，可以直接发起一次空输入运行。
              </Text>
              <div className="workflow-editor-trigger-fields-actions">
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={isPending}
                  onClick={() => handleSubmit({})}
                >
                  发起运行
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
                  运行当前工作流
                </Button>
              </div>
            </Form>
          )}
        </div>
      ) : (
        <Alert
          type="info"
          showIcon
          title="当前节点暂不支持单独输入"
          description="7Flows 现在的真实执行入口仍是 workflow trigger。先从入口节点发起运行，再通过运行面板观察当前节点的 node run 和 trace。"
        />
      )}
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

    if (value === undefined || value === null || value === "") {
      return;
    }

    payload[field.name] = value;
  });

  return payload;
}
