"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Node } from "@xyflow/react";
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Spin,
  Switch,
  Typography
} from "antd";

import { triggerWorkflowNodeTrialRun } from "@/app/actions/runs";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { getRunDetail, type RunDetail } from "@/lib/get-run-detail";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import {
  resolveWorkflowNodeInputSchema,
  type WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import { WorkflowNodeRuntimeTemplate } from "@/components/workflow-editor-inspector-panels/workflow-node-runtime-template";
import { WorkflowNodeIoSchemaForm } from "@/components/workflow-node-config-form/node-io-schema-form";
import {
  getSupportedToolSchemaFields,
  getUnsupportedToolFieldNames,
  toRecord
} from "@/components/workflow-node-config-form/shared";
import type { WorkflowEditorRuntimeRunSuccessPayload } from "@/components/workflow-editor-workbench/types";
import {
  doesWorkflowEditorRuntimeRequestTargetNode,
  type WorkflowEditorRuntimeRequest
} from "@/components/workflow-editor-workbench/runtime-request";

const { Text } = Typography;
const START_NODE_TRIAL_RUN_CACHE_KEY_PREFIX = "sevenflows.editor.start-node-trial-run";
const START_NODE_TRIAL_RUN_RESULT_CACHE_KEY_PREFIX = "sevenflows.editor.start-node-trial-run-result";

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
  runtimeRequest?: WorkflowEditorRuntimeRequest | null;
  onRunSuccess?: (payload?: WorkflowEditorRuntimeRunSuccessPayload) => void;
  onRunError?: (message: string) => void;
  onRuntimeRequestHandled?: () => void;
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
  runtimeRequest = null,
  onRunSuccess,
  onRunError,
  onRuntimeRequestHandled
}: WorkflowEditorNodeRuntimePanelProps) {
  const [form] = Form.useForm();
  const lastHandledRuntimeRequestIdRef = useRef(0);
  const hydratedCachedStartNodeRunIdRef = useRef<string | null>(null);
  const lastStartNodeRuntimeResetKeyRef = useRef<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [lastTriggeredRunId, setLastTriggeredRunId] = useState<string | null>(null);
  const [cachedStartNodePayload, setCachedStartNodePayload] = useState<Record<string, unknown> | null>(null);
  const [hydratedStartNodeRuntimeResetKey, setHydratedStartNodeRuntimeResetKey] = useState<string | null>(null);
  const [isTrialRunModalOpen, setIsTrialRunModalOpen] = useState(false);
  const [activeTrialRunId, setActiveTrialRunId] = useState<string | null>(null);
  const [trialRunDetail, setTrialRunDetail] = useState<RunDetail | null>(null);
  const [isStartNodeTrialRunSubmitting, setIsStartNodeTrialRunSubmitting] = useState(false);
  const [isTrialRunDetailLoading, setIsTrialRunDetailLoading] = useState(false);
  const [trialRunDetailMessage, setTrialRunDetailMessage] = useState<string | null>(null);
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
    () => getUnsupportedToolFieldNames(toRecord(resolvedInputSchema) ?? {}, supportedFields),
    [resolvedInputSchema, supportedFields]
  );
  const requiredFieldNames = useMemo(
    () => supportedFields.filter((field) => field.required).map((field) => field.name),
    [supportedFields]
  );
  const supportedFieldSignature = useMemo(
    () =>
      JSON.stringify(
        supportedFields.map((field) => ({
          name: field.name,
          label: field.label,
          description: field.description,
          type: field.type,
          required: field.required,
          options: field.options,
          inputType: field.inputType,
          defaultValue: field.defaultValue ?? null
        }))
      ),
    [supportedFields]
  );
  const currentNodeRun = useMemo(
    () => run?.node_runs.find((item) => item.node_id === node.id) ?? null,
    [node.id, run]
  );
  const isStartNode = node.data.nodeType === "startNode";
  const runtimeRequestTargetsCurrentNode = doesWorkflowEditorRuntimeRequestTargetNode(
    runtimeRequest,
    node.id
  );
  const selectedTrialRun = useMemo(() => {
    if (activeTrialRunId && run?.id === activeTrialRunId) {
      return run;
    }

    return trialRunDetail;
  }, [activeTrialRunId, run, trialRunDetail]);
  const selectedTrialNodeRun = useMemo(
    () => selectedTrialRun?.node_runs.find((item) => item.node_id === node.id) ?? null,
    [node.id, selectedTrialRun]
  );
  const startNodeRuntimeResultNodeRun = selectedTrialNodeRun ?? currentNodeRun;
  const startNodeRuntimeResultRunId = selectedTrialNodeRun
    ? selectedTrialRun?.id ?? activeTrialRunId ?? lastTriggeredRunId
    : currentNodeRun
      ? run?.id ?? lastTriggeredRunId
      : activeTrialRunId ?? lastTriggeredRunId;
  const startNodeRuntimeSummaryNodeRun = startNodeRuntimeResultNodeRun;
  const startNodeRuntimeSurface = useMemo(
    () =>
      resolveStartNodeRuntimeSurfaceState({
        status: startNodeRuntimeSummaryNodeRun?.status ?? node.data.runStatus,
        errorMessage: startNodeRuntimeSummaryNodeRun?.error_message ?? node.data.runErrorMessage,
        startedAt: startNodeRuntimeSummaryNodeRun?.started_at,
        finishedAt: startNodeRuntimeSummaryNodeRun?.finished_at,
        fallbackDurationMs: node.data.runDurationMs,
        fallbackLastEventType: node.data.runLastEventType,
        fallbackEventCount: node.data.runEventCount,
        isSubmitting: isStartNodeTrialRunSubmitting,
        isDetailLoading: isTrialRunDetailLoading
      }),
    [
      isStartNodeTrialRunSubmitting,
      isTrialRunDetailLoading,
      node.data.runDurationMs,
      node.data.runErrorMessage,
      node.data.runEventCount,
      node.data.runLastEventType,
      node.data.runStatus,
      startNodeRuntimeSummaryNodeRun?.error_message,
      startNodeRuntimeSummaryNodeRun?.finished_at,
      startNodeRuntimeSummaryNodeRun?.started_at,
      startNodeRuntimeSummaryNodeRun?.status
    ]
  );
  const startNodeRuntimeResetKey = `${workflowId}:${node.id}:${isStartNode ? "start" : "node"}:${supportedFieldSignature}`;

  useEffect(() => {
    if (lastStartNodeRuntimeResetKeyRef.current === startNodeRuntimeResetKey) {
      return;
    }

    lastStartNodeRuntimeResetKeyRef.current = startNodeRuntimeResetKey;
    setHydratedStartNodeRuntimeResetKey(null);

    const defaultValues = Object.fromEntries(
      supportedFields
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.name, field.defaultValue])
    );
    const nextCachedPayload = readStartNodeTrialRunCache(workflowId, node.id);
    const nextCachedRunId = readStartNodeTrialRunResultRunId(workflowId, node.id);

    form.resetFields();
    form.setFieldsValue(nextCachedPayload ? { ...defaultValues, ...nextCachedPayload } : defaultValues);
    hydratedCachedStartNodeRunIdRef.current = null;
    setCachedStartNodePayload(nextCachedPayload);
    setStatusMessage(null);
    setLastTriggeredRunId(nextCachedRunId);
    setIsTrialRunModalOpen(false);
    setActiveTrialRunId(nextCachedRunId);
    setTrialRunDetail(null);
    setIsStartNodeTrialRunSubmitting(false);
    setIsTrialRunDetailLoading(false);
    setTrialRunDetailMessage(null);
    setHydratedStartNodeRuntimeResetKey(startNodeRuntimeResetKey);
  }, [form, isStartNode, node.id, startNodeRuntimeResetKey, supportedFields, supportedFieldSignature, workflowId]);

  useEffect(() => {
    if (!activeTrialRunId || run?.id !== activeTrialRunId) {
      return;
    }

    setTrialRunDetail(run);
    setIsTrialRunDetailLoading(false);
    setTrialRunDetailMessage(null);
  }, [activeTrialRunId, run]);

  useEffect(() => {
    if (!activeTrialRunId) {
      return;
    }

    if (run?.id === activeTrialRunId || trialRunDetail?.id === activeTrialRunId) {
      return;
    }

    if (hydratedCachedStartNodeRunIdRef.current === activeTrialRunId) {
      return;
    }

    hydratedCachedStartNodeRunIdRef.current = activeTrialRunId;
    void loadTrialRunDetail({
      runId: activeTrialRunId,
      nodeId: node.id,
      onDetail: setTrialRunDetail,
      onLoadingChange: setIsTrialRunDetailLoading,
      onMessageChange: setTrialRunDetailMessage
    });
  }, [activeTrialRunId, node.id, run?.id, trialRunDetail?.id]);

  const submitTrialRun = useCallback((
    payload: Record<string, unknown>,
    options: { revealRunOverlay: boolean }
  ) => {
    startTransition(async () => {
      setActiveTrialRunId(null);
      setTrialRunDetail(null);
      setTrialRunDetailMessage(null);
      setIsStartNodeTrialRunSubmitting(true);
      setIsTrialRunDetailLoading(false);

      const result = await triggerWorkflowNodeTrialRun(workflowId, node.id, payload);

      if (result.status === "success") {
        setIsStartNodeTrialRunSubmitting(false);
        setIsTrialRunModalOpen(false);
        persistStartNodeTrialRunResultRunId(workflowId, node.id, result.runId ?? null);
        setLastTriggeredRunId(result.runId ?? null);
        setActiveTrialRunId(result.runId ?? null);
        setTrialRunDetail(null);
        setTrialRunDetailMessage(
          result.runId ? null : "试运行已提交，但这次结果暂时没有可回看的 run 标识。"
        );
        if (result.runId) {
          void loadTrialRunDetail({
            runId: result.runId,
            nodeId: node.id,
            onDetail: setTrialRunDetail,
            onLoadingChange: setIsTrialRunDetailLoading,
            onMessageChange: setTrialRunDetailMessage
          });
        }

        setStatusMessage({
          type: "success",
          text: result.runId
            ? `试运行已提交，run ${result.runId} 已写入运行缓存。`
            : "试运行已提交。"
        });
        onRunSuccess?.({
          runId: result.runId ?? null,
          revealRunOverlay: options.revealRunOverlay
        });
        return;
      }

      setIsStartNodeTrialRunSubmitting(false);
      setStatusMessage({
        type: "error",
        text: result.message
      });
      onRunError?.(result.message);
    });
  }, [node.id, onRunError, onRunSuccess, workflowId]);

  const handleStartNodeTrialRun = useCallback(async (
    payload: Record<string, unknown>
  ) => {
    persistStartNodeTrialRunCache(workflowId, node.id, payload);
    setCachedStartNodePayload(payload);
    form.setFieldsValue(payload);
    submitTrialRun(payload, { revealRunOverlay: false });
  }, [form, node.id, submitTrialRun, workflowId]);

  const handleFormSubmit = useCallback((values: Record<string, unknown>) => {
    const payload = buildRuntimePayload(values, supportedFields);

    void handleStartNodeTrialRun(payload);
  }, [handleStartNodeTrialRun, supportedFields]);

  useEffect(() => {
    if (!runtimeRequestTargetsCurrentNode || !runtimeRequest) {
      return;
    }

    if (hydratedStartNodeRuntimeResetKey !== startNodeRuntimeResetKey) {
      return;
    }

    if (runtimeRequest.requestId === lastHandledRuntimeRequestIdRef.current) {
      return;
    }

    lastHandledRuntimeRequestIdRef.current = runtimeRequest.requestId;
    onRuntimeRequestHandled?.();

    const launchMode = isStartNode
      ? resolveStartNodeTrialRunLaunchMode({
          cachedPayload: cachedStartNodePayload,
          requiredFieldNames,
          supportedFieldsCount: supportedFields.length
        })
      : "form";

    if (launchMode === "run") {
      const payload = cachedStartNodePayload ?? {};
      setIsTrialRunModalOpen(false);
      void handleStartNodeTrialRun(payload);
      return;
    }

    setStatusMessage(null);
    setIsTrialRunModalOpen(true);
  }, [
    cachedStartNodePayload,
    handleStartNodeTrialRun,
    hydratedStartNodeRuntimeResetKey,
    isStartNode,
    onRuntimeRequestHandled,
    requiredFieldNames,
    runtimeRequest,
    runtimeRequestTargetsCurrentNode,
    startNodeRuntimeResetKey,
    supportedFields.length
  ]);

  const renderTrialRunForm = ({ includeInlineActions }: { includeInlineActions: boolean }) => (
    <>
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
          <Text type="secondary">当前节点没有结构化输入字段，可以直接发起一次空输入试运行。</Text>
          {includeInlineActions ? (
            <div className="workflow-editor-trigger-fields-actions">
              <Button type="primary" loading={isPending} onClick={() => handleFormSubmit({})}>
                试运行当前节点
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFormSubmit}
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

          {includeInlineActions ? (
            <div className="workflow-editor-trigger-fields-actions">
              <Button onClick={() => form.resetFields()}>重置</Button>
              <Button type="primary" htmlType="submit" loading={isPending}>
                试运行当前节点
              </Button>
            </div>
          ) : null}
        </Form>
      )}
    </>
  );

  const modalFooter = [
    <Button
      key="cancel"
      onClick={() => {
        setIsTrialRunModalOpen(false);
        setIsStartNodeTrialRunSubmitting(false);
      }}
    >
      取消
    </Button>,
    <Button key="reset" onClick={() => form.resetFields()}>
      重置
    </Button>,
    <Button
      key="submit"
      type="primary"
      loading={isPending}
      onClick={() => {
        if (supportedFields.length === 0) {
          void handleStartNodeTrialRun({});
          return;
        }
        form.submit();
      }}
    >
      开始试运行
    </Button>
  ];

  const summarySection = (
    <div className="workflow-editor-runtime-summary-card workflow-editor-runtime-summary-card-compact">
      <div
        className={`workflow-editor-runtime-summary-strip workflow-editor-runtime-summary-strip-${startNodeRuntimeSurface.tone}`}
        data-component="workflow-editor-start-node-runtime-strip"
      >
        <div className="workflow-editor-runtime-summary-strip-main">
          <span className={`health-pill ${startNodeRuntimeSurface.tone}`}>
            {startNodeRuntimeSurface.statusLabel}
          </span>
          <div className="workflow-editor-runtime-summary-strip-meta">
            {startNodeRuntimeResultRunId ? (
              <span className="workflow-canvas-node-meta">
                {formatCompactRunId(startNodeRuntimeResultRunId)}
              </span>
            ) : null}
            {startNodeRuntimeSurface.lastEventType ? (
              <span className="workflow-canvas-node-meta">
                {startNodeRuntimeSurface.lastEventType}
              </span>
            ) : null}
            <span className="workflow-canvas-node-meta">
              运行时间 {formatCompactRuntimeDuration(startNodeRuntimeSurface.durationMs)}
            </span>
            <span className="workflow-canvas-node-meta">
              事件 {formatCompactRuntimeEventCount(startNodeRuntimeSurface.eventCount)}
            </span>
          </div>
        </div>
      </div>

      {startNodeRuntimeSurface.errorMessage ? (
        <Alert
          type="error"
          showIcon
          title="最近一次运行返回错误"
          description={startNodeRuntimeSurface.errorMessage}
        />
      ) : null}
    </div>
  );
  const inputSection = null;
  const trialRunSection = startNodeRuntimeSurface.showLoadingPanel ? (
    <div
      className="workflow-editor-runtime-form-card"
      data-component="workflow-editor-start-node-runtime-loading"
    >
      <div className="workflow-editor-runtime-modal-loading">
        <Spin size="small" />
        <Text type="secondary">{startNodeRuntimeSurface.loadingMessage}</Text>
      </div>
    </div>
  ) : null;
  const outputSection =
    statusMessage?.type === "error" || (trialRunDetailMessage && !startNodeRuntimeSurface.showLoadingPanel) ? (
      <>
        {statusMessage?.type === "error" ? (
          <Alert
            type="error"
            showIcon
            title="试运行失败"
            description={statusMessage.text}
          />
        ) : null}

        {trialRunDetailMessage && !startNodeRuntimeSurface.showLoadingPanel ? (
          <Alert type="info" showIcon description={trialRunDetailMessage} />
        ) : null}
      </>
    ) : null;
  const contractSection =
    onNodeInputSchemaChange && onNodeOutputSchemaChange ? (
      <div
        className="workflow-editor-runtime-form-card"
        data-component="workflow-editor-node-runtime-contract"
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
          presentation="collapsible"
        />
      </div>
    ) : null;

  return (
    <>
      <div data-component="workflow-editor-node-runtime-panel">
        <WorkflowNodeRuntimeTemplate
          summarySection={summarySection}
          inputSection={inputSection}
          trialRunSection={trialRunSection}
          outputSection={outputSection}
          contractSection={contractSection}
        />
      </div>

      <Modal
        open={isTrialRunModalOpen}
        title="试运行"
        forceRender={typeof window !== "undefined"}
        footer={modalFooter}
        onCancel={() => {
          setIsTrialRunModalOpen(false);
          setIsStartNodeTrialRunSubmitting(false);
        }}
        destroyOnHidden={false}
      >
        {!isStartNode ? (
          <div className="workflow-editor-inspector-section">
            <Text type="secondary">
              这里只提供当前节点的直接输入，不自动补齐真实上游 context。要看完整链路，请从整条 workflow
              的运行入口发起执行。
            </Text>
          </div>
        ) : null}
        {renderTrialRunForm({ includeInlineActions: false })}
      </Modal>
    </>
  );
}

export function resolveStartNodeRuntimeSurfaceState(options: {
  status?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  fallbackDurationMs?: number;
  fallbackLastEventType?: string;
  fallbackEventCount?: number;
  isSubmitting: boolean;
  isDetailLoading: boolean;
}) {
  const showLoadingPanel = options.isSubmitting || options.isDetailLoading;
  const loadingMessage = options.isSubmitting
    ? "正在提交这次试运行…"
    : "正在刷新这次试运行结果…";

  return {
    tone: resolveStartNodeRuntimeTone(showLoadingPanel ? "running" : options.status),
    statusLabel: showLoadingPanel ? "运行中" : formatStartNodeRuntimeStatus(options.status),
    durationMs: calculateNodeRunDurationMs({
      started_at: options.startedAt,
      finished_at: options.finishedAt
    }) ?? options.fallbackDurationMs,
    lastEventType: options.fallbackLastEventType,
    eventCount: options.fallbackEventCount,
    errorMessage: options.errorMessage,
    showLoadingPanel,
    loadingMessage
  };
}

function calculateNodeRunDurationMs(nodeRun?: { started_at?: string | null; finished_at?: string | null } | null) {
  if (!nodeRun?.started_at) {
    return undefined;
  }

  const startedAt = new Date(nodeRun.started_at).getTime();
  const finishedAt = nodeRun.finished_at ? new Date(nodeRun.finished_at).getTime() : Date.now();

  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) {
    return undefined;
  }

  return Math.max(0, finishedAt - startedAt);
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

async function loadTrialRunDetail({
  runId,
  nodeId,
  onDetail,
  onLoadingChange,
  onMessageChange
}: {
  runId: string;
  nodeId: string;
  onDetail: (detail: RunDetail | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onMessageChange: (message: string | null) => void;
}) {
  onLoadingChange(true);
  onMessageChange(null);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const detail = await getRunDetail(runId);
    if (detail) {
      onDetail(detail);
      if (detail.node_runs.some((item) => item.node_id === nodeId)) {
        onLoadingChange(false);
        return;
      }
    }

    await wait(600);
  }

  onLoadingChange(false);
  onMessageChange("这次试运行已提交，结果仍在刷新。可稍后重试，或打开运行面板继续查看。");
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

export function resolveStartNodeTrialRunLaunchMode({
  cachedPayload,
  requiredFieldNames,
  supportedFieldsCount
}: {
  cachedPayload: Record<string, unknown> | null;
  requiredFieldNames: string[];
  supportedFieldsCount: number;
}) {
  if (supportedFieldsCount === 0) {
    return "run" as const;
  }

  if (requiredFieldNames.every((fieldName) => hasSatisfiedRuntimeField(cachedPayload, fieldName))) {
    return "run" as const;
  }

  return "form" as const;
}

function hasSatisfiedRuntimeField(
  payload: Record<string, unknown> | null,
  fieldName: string
) {
  const value = payload?.[fieldName];

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null;
}

function buildStartNodeTrialRunCacheKey(workflowId: string, nodeId: string) {
  return `${START_NODE_TRIAL_RUN_CACHE_KEY_PREFIX}:${workflowId}:${nodeId}`;
}

function buildStartNodeTrialRunResultCacheKey(workflowId: string, nodeId: string) {
  return `${START_NODE_TRIAL_RUN_RESULT_CACHE_KEY_PREFIX}:${workflowId}:${nodeId}`;
}

function readStartNodeTrialRunCache(workflowId: string, nodeId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(buildStartNodeTrialRunCacheKey(workflowId, nodeId));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return toRecord(parsed);
  } catch {
    window.localStorage.removeItem(buildStartNodeTrialRunCacheKey(workflowId, nodeId));
    return null;
  }
}

function readStartNodeTrialRunResultRunId(workflowId: string, nodeId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(buildStartNodeTrialRunResultCacheKey(workflowId, nodeId));
  return value?.trim() ? value : null;
}

function persistStartNodeTrialRunCache(
  workflowId: string,
  nodeId: string,
  payload: Record<string, unknown>
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    buildStartNodeTrialRunCacheKey(workflowId, nodeId),
    JSON.stringify(payload)
  );
}

function persistStartNodeTrialRunResultRunId(
  workflowId: string,
  nodeId: string,
  runId: string | null
) {
  if (typeof window === "undefined") {
    return;
  }

  const cacheKey = buildStartNodeTrialRunResultCacheKey(workflowId, nodeId);
  if (!runId?.trim()) {
    window.localStorage.removeItem(cacheKey);
    return;
  }

  window.localStorage.setItem(cacheKey, runId);
}

function resolveStartNodeRuntimeTone(status?: string | null) {
  const normalizedStatus = status?.trim().toLowerCase();

  if (!normalizedStatus) {
    return "disabled";
  }

  if (["up", "succeeded", "success"].includes(normalizedStatus)) {
    return "success";
  }

  if (["down", "failed", "error"].includes(normalizedStatus)) {
    return "error";
  }

  if (["running", "waiting", "degraded", "warning", "partial", "rejected"].includes(normalizedStatus)) {
    return "warning";
  }

  return "disabled";
}

function formatStartNodeRuntimeStatus(status?: string | null) {
  const normalizedStatus = status?.trim().toLowerCase();

  if (!normalizedStatus) {
    return "未运行";
  }

  if (["up", "succeeded", "success"].includes(normalizedStatus)) {
    return "success";
  }

  if (["down", "failed", "error"].includes(normalizedStatus)) {
    return "failed";
  }

  return normalizedStatus;
}

function formatCompactRuntimeDuration(durationMs?: number | null) {
  const durationLabel = formatRuntimeDurationMs(durationMs);
  return durationLabel === "N/A" ? "—" : durationLabel;
}

function formatCompactRunId(runId?: string | null) {
  if (!runId) {
    return null;
  }

  return runId.length <= 18 ? `run ${runId}` : `run ${runId.slice(0, 8)}…${runId.slice(-4)}`;
}

function formatCompactRuntimeEventCount(eventCount?: number | null) {
  return typeof eventCount === "number" ? String(eventCount) : "—";
}

function formatRuntimeDurationMs(durationMs?: number | null) {
  if (durationMs == null || Number.isNaN(durationMs)) {
    return "N/A";
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  if (durationMs < 60_000) {
    const seconds = durationMs / 1000;
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  }

  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
