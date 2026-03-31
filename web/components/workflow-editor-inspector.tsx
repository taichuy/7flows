"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { Typography, Tabs, Input, Button, Space, Tag } from "antd";

import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type { CredentialItem } from "@/lib/get-credentials";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { OperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import {
  buildWorkflowEditorAssistantContext,
  type WorkflowEditorAssistantContext
} from "@/lib/workflow-editor-assistant";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import type { WorkflowNodeConfigFormProps } from "@/components/workflow-node-config-form/shared";
import type { WorkflowNodeIoSchemaFormProps } from "@/components/workflow-node-config-form/node-io-schema-form";
import type { WorkflowNodeRuntimePolicyFormProps } from "@/components/workflow-node-config-form/runtime-policy-form";
import type { WorkflowEditorAssistantPanelProps } from "@/components/workflow-editor-inspector-panels/workflow-editor-assistant-panel";
import type { WorkflowEditorJsonPanelProps } from "@/components/workflow-editor-inspector-panels/workflow-editor-json-panel";
import type { WorkflowEditorPublishPanelProps } from "@/components/workflow-editor-inspector-panels/workflow-editor-publish-panel";
import type {
  WorkflowEditorInspectorProps,
  WorkflowEditorInspectorTabKey
} from "@/components/workflow-editor-workbench/types";
import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";
import { WorkflowEditorVariableForm } from "@/components/workflow-editor-variable-form";

const { Title, Text } = Typography;

const LazyWorkflowNodeConfigForm = dynamic<WorkflowNodeConfigFormProps>(
  () =>
    import("@/components/workflow-node-config-form").then(
      (module) => module.WorkflowNodeConfigForm
    ),
  {
    ssr: false,
    loading: () =>
      renderLoadingTabPanel(
        "workflow-editor-node-config-panel-loading",
        "节点配置",
        "正在按需加载节点结构化配置面板。"
      )
  }
);

const LazyWorkflowNodeIoSchemaForm = dynamic<WorkflowNodeIoSchemaFormProps>(
  () =>
    import("@/components/workflow-node-config-form/node-io-schema-form").then(
      (module) => module.WorkflowNodeIoSchemaForm
    ),
  {
    ssr: false,
    loading: () =>
      renderLoadingTabPanel(
        "workflow-editor-node-schema-panel-loading",
        "I/O contract",
        "正在按需加载节点 input / output schema 配置。"
      )
  }
);

const LazyWorkflowNodeRuntimePolicyForm = dynamic<WorkflowNodeRuntimePolicyFormProps>(
  () =>
    import("@/components/workflow-node-config-form/runtime-policy-form").then(
      (module) => module.WorkflowNodeRuntimePolicyForm
    ),
  {
    ssr: false,
    loading: () =>
      renderLoadingTabPanel(
        "workflow-editor-node-runtime-panel-loading",
        "运行策略",
        "正在按需加载节点 runtime / retry / join 配置。"
      )
  }
);

const LazyWorkflowEditorAssistantPanel = dynamic<WorkflowEditorAssistantPanelProps>(
  () =>
    import("@/components/workflow-editor-inspector-panels/workflow-editor-assistant-panel").then(
      (module) => module.WorkflowEditorAssistantPanel
    ),
  {
    ssr: false,
    loading: () =>
      renderLoadingTabPanel(
        "workflow-editor-assistant-panel-loading",
        "AI 辅助",
        "正在按需加载节点上下文建议与本地对话线程。"
      )
  }
);

const LazyWorkflowEditorJsonPanel = dynamic<WorkflowEditorJsonPanelProps>(
  () =>
    import("@/components/workflow-editor-inspector-panels/workflow-editor-json-panel").then(
      (module) => module.WorkflowEditorJsonPanel
    ),
  {
    ssr: false,
    loading: () =>
      renderLoadingTabPanel(
        "workflow-editor-node-json-panel-loading",
        "高级 JSON",
        "正在按需加载原始 config JSON 编辑器。"
      )
  }
);

const LazyWorkflowEditorPublishPanel = dynamic<WorkflowEditorPublishPanelProps>(
  () =>
    import("@/components/workflow-editor-inspector-panels/workflow-editor-publish-panel").then(
      (module) => module.WorkflowEditorPublishPanel
    ),
  {
    ssr: false,
    loading: () =>
      renderLoadingTabPanel(
        "workflow-editor-publish-panel-loading",
        "发布配置",
        "正在按需加载发布定义、校验与 remediation 入口。"
      )
  }
);

function renderLoadingTabPanel(dataComponent: string, title: string, description: string) {
  return (
    <div className="workflow-editor-inspector-section" data-component={dataComponent}>
      <div className="workflow-editor-inspector-section-title">{title}</div>
      <Text type="secondary">{description}</Text>
    </div>
  );
}

export function WorkflowEditorInspector({
  currentHref = null,
  selectedNode,
  selectedEdge,
  nodes,
  edges,
  tools,
  adapters,
  credentials,
  modelProviderConfigs = [],
  modelProviderRegistryStatus = "idle",
  nodeConfigText,
  onNodeConfigTextChange,
  onApplyNodeConfigJson,
  onNodeNameChange,
  onNodeConfigChange,
  onNodeInputSchemaChange,
  onNodeOutputSchemaChange,
  onNodeRuntimePolicyUpdate,
  onNodeRuntimePolicyChange,
  workflowVersion,
  availableWorkflowVersions,
  workflowVariables,
  workflowPublish,
  onWorkflowVariablesChange,
  onWorkflowPublishChange,
  onDeleteSelectedNode,
  onUpdateSelectedEdge,
  onDeleteSelectedEdge,
  highlightedNodeSection = null,
  highlightedNodeFieldPath = null,
  highlightedPublishEndpointIndex = null,
  highlightedPublishEndpointFieldPath = null,
  highlightedVariableIndex = null,
  highlightedVariableFieldPath = null,
  focusedValidationItem = null,
  persistBlockedMessage = null,
  persistBlockerSummary = null,
  persistBlockers,
  persistBlockerRecommendedNextStep = null,
  assistantRequestSerial = 0,
  sandboxReadiness
}: WorkflowEditorInspectorProps) {
  const preferredTabKey = useMemo<WorkflowEditorInspectorTabKey>(() => {
    if (selectedNode) {
      if (highlightedNodeSection === "contract") {
        return "node-schema";
      }

      if (highlightedNodeSection === "runtime") {
        return "node-runtime";
      }

      return "node-config";
    }

    if (selectedEdge) {
      return "edge-config";
    }

    if (focusedValidationItem?.target.scope === "variables") {
      return "workflow-variables";
    }

    if (focusedValidationItem?.target.scope === "publish") {
      return "workflow-publish";
    }

    return "workflow-overview";
  }, [focusedValidationItem, highlightedNodeSection, selectedEdge, selectedNode]);
  const [activeTabKey, setActiveTabKey] = useState<WorkflowEditorInspectorTabKey>(preferredTabKey);
  const [activatedTabKeys, setActivatedTabKeys] = useState<WorkflowEditorInspectorTabKey[]>([
    preferredTabKey
  ]);
  const assistantContext = useMemo<WorkflowEditorAssistantContext | null>(() => {
    if (!selectedNode) {
      return null;
    }

    return buildWorkflowEditorAssistantContext({
      selectedNode,
      nodes,
      edges,
      sandboxReadiness
    });
  }, [edges, nodes, sandboxReadiness, selectedNode]);

  useEffect(() => {
    setActiveTabKey(preferredTabKey);
  }, [preferredTabKey]);

  useEffect(() => {
    setActivatedTabKeys((currentKeys) =>
      currentKeys.includes(activeTabKey)
        ? currentKeys
        : [...currentKeys, activeTabKey]
    );
  }, [activeTabKey]);

  useEffect(() => {
    if (!assistantContext || assistantRequestSerial === 0) {
      return;
    }

    setActiveTabKey("node-assistant");
  }, [assistantContext, assistantRequestSerial]);

  useEffect(() => {
    if (!assistantContext) {
      return;
    }
  }, [assistantContext]);

  const inspectorHeader = useMemo(() => {
    if (selectedNode) {
      return {
        eyebrow: "NODE CONFIG",
        title: selectedNode.data.label,
        description: "右侧只跟随当前节点，把配置和 AI 收在同一面板。",
        chips: assistantContext
          ? [
              selectedNode.data.nodeType,
              `${assistantContext.upstreamLabels.length} 个上游`,
              `${assistantContext.downstreamLabels.length} 个下游`
            ]
          : [selectedNode.data.nodeType, selectedNode.id]
      };
    }

    if (selectedEdge) {
      return {
        eyebrow: "EDGE CONFIG",
        title: "连线规则",
        description: "当前聚焦连线条件；应用变量与发布配置仍保留在相邻标签里。",
        chips: ["Condition", selectedEdge.id]
      };
    }

    return {
      eyebrow: "WORKFLOW CONFIG",
      title: "应用配置",
      description: "未选中节点时，右侧只保留应用级配置。",
      chips: [
        `v${workflowVersion}`,
        `${workflowVariables.length} 个变量`,
        `${workflowPublish.length} 个发布端点`
      ]
    };
  }, [assistantContext, selectedEdge, selectedNode, workflowPublish.length, workflowVariables.length, workflowVersion]);
  const inspectorHeaderModeKey = selectedNode
    ? `node:${selectedNode.id}`
    : selectedEdge
      ? `edge:${selectedEdge.id}`
      : "workflow";
  const hasActivatedTab = (tabKey: WorkflowEditorInspectorTabKey) =>
    activatedTabKeys.includes(tabKey);
  const renderDeferredTabPanel = (
    dataComponent: string,
    title: string,
    description: string
  ) => (
    <div className="workflow-editor-inspector-section" data-component={dataComponent}>
      <div className="workflow-editor-inspector-section-title">{title}</div>
      <Text type="secondary">{description}</Text>
    </div>
  );

  const assistantPanel = hasActivatedTab("node-assistant") && assistantContext ? (
    <LazyWorkflowEditorAssistantPanel assistantContext={assistantContext} />
  ) : assistantContext ? (
    renderDeferredTabPanel(
      "workflow-editor-assistant-panel-deferred",
      "AI 辅助",
      "只有从顶栏或 AI 标签进入时，才挂载节点上下文建议与本地对话线程。"
    )
  ) : null;

  const workflowPublishPanel = hasActivatedTab("workflow-publish") ? (
    <LazyWorkflowEditorPublishPanel
        currentHref={currentHref}
        workflowVersion={workflowVersion}
        availableWorkflowVersions={availableWorkflowVersions}
        publishEndpoints={workflowPublish}
        sandboxReadiness={sandboxReadiness}
        onChange={onWorkflowPublishChange}
        focusedValidationItem={
          focusedValidationItem?.target.scope === "publish" ? focusedValidationItem : null
        }
        persistBlockedMessage={persistBlockedMessage}
        persistBlockerSummary={persistBlockerSummary}
        persistBlockers={persistBlockers}
        persistBlockerRecommendedNextStep={persistBlockerRecommendedNextStep}
        highlightedEndpointIndex={highlightedPublishEndpointIndex}
        highlightedEndpointFieldPath={highlightedPublishEndpointFieldPath}
      />
  ) : (
    renderDeferredTabPanel(
      "workflow-editor-publish-panel-deferred",
      "发布配置",
      "只有切到发布标签或命中 publish 校验项时，才挂载发布表单。"
    )
  );

  const workflowVariablesPanel = hasActivatedTab("workflow-variables") ? (
    <div data-component="workflow-editor-variable-panel">
      <WorkflowEditorVariableForm
        currentHref={currentHref}
        variables={workflowVariables}
        onChange={onWorkflowVariablesChange}
        highlightedVariableIndex={highlightedVariableIndex}
        highlightedVariableFieldPath={highlightedVariableFieldPath}
        focusedValidationItem={focusedValidationItem}
        sandboxReadiness={sandboxReadiness}
      />
    </div>
  ) : (
    renderDeferredTabPanel(
      "workflow-editor-variable-panel-deferred",
      "变量配置",
      "只有切到变量标签时，才挂载变量编辑表单。"
    )
  );

  const tabItems = selectedNode
    ? [
        {
          key: "node-config",
          label: "配置",
          children: hasActivatedTab("node-config") ? (
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
              <div className="workflow-editor-inspector-section">
                <div className="workflow-editor-inspector-section-title">节点名称</div>
                <Input
                  value={selectedNode.data.label}
                  onChange={(event) => onNodeNameChange(event.target.value)}
                />
              </div>

              <LazyWorkflowNodeConfigForm
                node={selectedNode}
                nodes={nodes}
                tools={tools}
                adapters={adapters}
                credentials={credentials}
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
            </Space>
          ) : (
            renderDeferredTabPanel(
              "workflow-editor-node-config-panel-deferred",
              "节点配置",
              "只有切到配置标签时，才挂载节点配置表单。"
            )
          )
        },
        {
          key: "node-schema",
          label: "I/O",
          children: hasActivatedTab("node-schema") ? (
            <LazyWorkflowNodeIoSchemaForm
              node={selectedNode}
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
          ) : (
            renderDeferredTabPanel(
              "workflow-editor-node-schema-panel-deferred",
              "I/O contract",
              "只有切到 I/O 标签或命中 contract 校验项时，才挂载 schema 表单。"
            )
          )
        },
        {
          key: "node-runtime",
          label: "运行",
          children: hasActivatedTab("node-runtime") ? (
            <LazyWorkflowNodeRuntimePolicyForm
              node={selectedNode}
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
          ) : (
            renderDeferredTabPanel(
              "workflow-editor-node-runtime-panel-deferred",
              "运行策略",
              "只有切到运行标签或命中 runtime 校验项时，才挂载 runtime policy 表单。"
            )
          )
        },
        {
          key: "node-assistant",
          label: "AI",
          children: assistantPanel
        },
        {
          key: "node-json",
          label: "JSON",
          children: hasActivatedTab("node-json") ? (
            <LazyWorkflowEditorJsonPanel
              nodeConfigText={nodeConfigText}
              onNodeConfigTextChange={onNodeConfigTextChange}
              onApplyNodeConfigJson={onApplyNodeConfigJson}
              onDeleteSelectedNode={onDeleteSelectedNode}
            />
          ) : (
            renderDeferredTabPanel(
              "workflow-editor-node-json-panel-deferred",
              "高级 JSON",
              "只有切到 JSON 标签时，才挂载原始 config 编辑器。"
            )
          )
        }
      ]
    : selectedEdge
      ? [
          {
            key: "edge-config",
            label: "连线",
            children: (
              <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                <div className="workflow-editor-inspector-section">
                  <div className="workflow-editor-inspector-section-title">分支标签 (Condition)</div>
                  <Input
                    value={selectedEdge.data?.condition ?? ""}
                    onChange={(event) =>
                      onUpdateSelectedEdge({
                        condition: event.target.value,
                        label: event.target.value.trim() || undefined
                      })
                    }
                    placeholder="可选的分支说明"
                  />
                </div>

                <Button danger onClick={onDeleteSelectedEdge}>
                  删除连线
                </Button>
              </Space>
            )
          },
          {
            key: "workflow-variables",
            label: "变量",
            children: workflowVariablesPanel
          },
          {
            key: "workflow-publish",
            label: "发布",
            children: workflowPublishPanel
          }
        ]
      : [
          {
            key: "workflow-overview",
            label: "当前焦点",
            children: (
              <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                {persistBlockedMessage ? (
                  <div className="workflow-editor-inspector-section">
                    <div className="workflow-editor-inspector-section-title">Inspector remediation</div>
                    <WorkflowPersistBlockerNotice
                      title="Save gate"
                      summary={persistBlockerSummary ?? persistBlockedMessage}
                      blockers={persistBlockers}
                      sandboxReadiness={sandboxReadiness}
                      currentHref={currentHref}
                      hideRecommendedNextStep={false}
                    />
                  </div>
                ) : null}
                <div className="workflow-editor-inspector-empty-state" style={{ padding: "40px 16px", textAlign: "center", color: "var(--ant-color-text-description)" }}>
                  <p style={{ marginBottom: 8 }}>选中节点后，右侧面板只跟随当前节点。</p>
                  <p style={{ fontSize: "12px", opacity: 0.8 }}>未选中时只保留变量与发布；从顶栏打开 AI 辅助后，仍在这里展开。</p>
                </div>
              </Space>
            )
          },
          {
            key: "workflow-variables",
            label: "变量",
            children: workflowVariablesPanel
          },
          {
            key: "workflow-publish",
            label: "发布",
            children: workflowPublishPanel
          }
        ];

  return (
    <div className="workflow-editor-inspector-shell">
      <div className="workflow-editor-inspector-header">
        <div className="workflow-editor-inspector-heading">
          <span className="workflow-editor-inspector-eyebrow">{inspectorHeader.eyebrow}</span>
          <Title level={5} style={{ margin: 0 }}>
            {inspectorHeader.title}
          </Title>
          <Text type="secondary">{inspectorHeader.description}</Text>
        </div>

        <div className="workflow-editor-inspector-chip-row" key={inspectorHeaderModeKey}>
          {inspectorHeader.chips.map((chip) => (
            <Tag key={chip} className="workflow-editor-inspector-chip">
              {chip}
            </Tag>
          ))}
        </div>
      </div>

      <div className="workflow-editor-inspector-body">
        <Tabs
          activeKey={activeTabKey}
          onChange={(key) => setActiveTabKey(key as WorkflowEditorInspectorTabKey)}
          className="workflow-editor-inspector-tabs"
          items={tabItems}
        />
      </div>
    </div>
  );
}
