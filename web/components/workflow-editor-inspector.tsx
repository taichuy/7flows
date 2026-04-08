"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Typography, Tabs, Input, Button, Space, Tag } from "antd";

import {
  buildWorkflowEditorAssistantContext,
  type WorkflowEditorAssistantContext
} from "@/lib/workflow-editor-assistant";
import { getWorkflowNodeTypeDisplayLabel } from "@/lib/workflow-node-display";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type { WorkflowEditorAssistantPanelProps } from "@/components/workflow-editor-inspector-panels/workflow-editor-assistant-panel";
import { WorkflowEditorNodePanel } from "@/components/workflow-editor-inspector-panels/workflow-editor-node-panel";
import type { WorkflowEditorPublishPanelProps } from "@/components/workflow-editor-inspector-panels/workflow-editor-publish-panel";
import { doesWorkflowEditorRuntimeRequestTargetNode } from "@/components/workflow-editor-workbench/runtime-request";
import type {
  WorkflowEditorInspectorProps,
  WorkflowEditorInspectorTabKey
} from "@/components/workflow-editor-workbench/types";
import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";
import { WorkflowEditorVariableForm } from "@/components/workflow-editor-variable-form";

const { Title, Text } = Typography;

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
  workflowId,
  currentHref = null,
  nodeTitlePlacement = "inspector",
  selectedNode,
  run = null,
  selectedEdge,
  nodes,
  edges,
  tools,
  adapters,
  credentials,
  modelProviderCatalog = [],
  modelProviderConfigs = [],
  modelProviderRegistryStatus = "idle",
  nodeConfigText,
  onNodeConfigTextChange,
  onApplyNodeConfigJson,
  onNodeNameChange,
  onNodeDescriptionChange,
  onNodeConfigChange,
  onNodeInputSchemaChange,
  onNodeOutputSchemaChange,
  onNodeRuntimePolicyUpdate,
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
  runtimeRequest = null,
  sandboxReadiness = null,
  onRuntimeRunSuccess,
  onRuntimeRunError,
  onRuntimeRequestHandled,
  onOpenRunOverlay
}: WorkflowEditorInspectorProps) {
  const selectedNodeDescription = useMemo(() => {
    if (!selectedNode) {
      return "";
    }

    const ui = toRecord(selectedNode.data.config.ui);
    return typeof ui?.description === "string" ? ui.description : "";
  }, [selectedNode]);

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

  const supportsAssistantTab = Boolean(
    selectedNode && selectedNode.data.nodeType !== "startNode" && assistantContext
  );
  const selectedNodeId = selectedNode?.id ?? null;
  const selectedEdgeId = selectedEdge?.id ?? null;
  const focusedScope = focusedValidationItem?.target.scope ?? null;

  const preferredTabKey = useMemo<WorkflowEditorInspectorTabKey>(() => {
    if (selectedNode?.data.nodeType === "startNode" && highlightedNodeSection === "contract") {
      return "node-runtime";
    }

    return resolveWorkflowEditorInspectorPreferredTabKey({
      selectedNodeId,
      selectedEdgeId,
      focusedScope
    });
  }, [focusedScope, highlightedNodeSection, selectedEdgeId, selectedNode, selectedNodeId]);
  const tabResetKey = useMemo(
    () =>
      resolveWorkflowEditorInspectorTabResetKey({
        selectedNodeId,
        selectedEdgeId,
        focusedScope
      }),
    [focusedScope, selectedEdgeId, selectedNodeId]
  );

  const [activeTabKey, setActiveTabKey] = useState<WorkflowEditorInspectorTabKey>(preferredTabKey);
  const [activatedTabKeys, setActivatedTabKeys] = useState<WorkflowEditorInspectorTabKey[]>([
    preferredTabKey
  ]);

  useEffect(() => {
    setActiveTabKey(preferredTabKey);
    setActivatedTabKeys([preferredTabKey]);
  }, [preferredTabKey, tabResetKey]);

  useEffect(() => {
    setActivatedTabKeys((currentKeys) =>
      currentKeys.includes(activeTabKey)
        ? currentKeys
        : [...currentKeys, activeTabKey]
    );
  }, [activeTabKey]);

  useEffect(() => {
    if (!supportsAssistantTab || assistantRequestSerial === 0) {
      return;
    }

    setActiveTabKey("node-assistant");
  }, [assistantRequestSerial, supportsAssistantTab]);

  useEffect(() => {
    if (activeTabKey === "node-assistant" && !supportsAssistantTab) {
      setActiveTabKey("node-config");
    }
  }, [activeTabKey, supportsAssistantTab]);

  useEffect(() => {
    if (!doesWorkflowEditorRuntimeRequestTargetNode(runtimeRequest, selectedNodeId)) {
      return;
    }

    setActiveTabKey("node-runtime");
  }, [runtimeRequest, selectedNodeId]);

  const inspectorHeader = useMemo(() => {
    if (selectedNode) {
      return {
        eyebrow: "NODE CONFIG",
        title: selectedNode.data.label,
        description: "右侧只跟随当前节点，把设置和运行时收在同一面板。",
        chips: assistantContext
          ? buildSelectedNodeHeaderChips(selectedNode, assistantContext)
          : [
              getWorkflowNodeTypeDisplayLabel(
                selectedNode.data.nodeType,
                selectedNode.data.typeLabel
              ),
              selectedNode.id
            ]
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
    ? []
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
        {selectedNode ? (
          <div
            className="workflow-editor-inspector-node-heading"
            data-title-placement={nodeTitlePlacement}
          >
            {nodeTitlePlacement === "inspector" ? (
              <Input
                aria-label="节点名称"
                className="workflow-editor-inspector-node-title-input"
                placeholder="节点名称"
                variant="borderless"
                value={selectedNode.data.label}
                onChange={(event) => onNodeNameChange(event.target.value)}
              />
            ) : null}
            <Input.TextArea
              aria-label="节点描述"
              autoSize={{ minRows: 1, maxRows: 3 }}
              className="workflow-editor-inspector-node-description-input"
              placeholder="添加描述..."
              variant="borderless"
              value={selectedNodeDescription}
              onChange={(event) => onNodeDescriptionChange(event.target.value)}
            />
          </div>
        ) : (
          <div className="workflow-editor-inspector-heading">
            <span className="workflow-editor-inspector-eyebrow">{inspectorHeader.eyebrow}</span>
            <Title level={5} style={{ margin: 0 }}>
              {inspectorHeader.title}
            </Title>
            <Text type="secondary">{inspectorHeader.description}</Text>
          </div>
        )}

        <div className="workflow-editor-inspector-chip-row" key={inspectorHeaderModeKey}>
          {inspectorHeader.chips.map((chip) => (
            <Tag key={chip} className="workflow-editor-inspector-chip">
              {chip}
            </Tag>
          ))}
        </div>
      </div>

      <div className="workflow-editor-inspector-body">
        {selectedNode ? (
          <WorkflowEditorNodePanel
            activeTabKey={activeTabKey as "node-config" | "node-runtime" | "node-assistant"}
            activatedTabKeys={activatedTabKeys.filter(
              (key): key is "node-config" | "node-runtime" | "node-assistant" =>
                key === "node-config" || key === "node-runtime" || key === "node-assistant"
            )}
            settingsProps={{
              node: selectedNode,
              nodes,
              edges,
              tools,
              adapters,
              credentials,
              modelProviderCatalog,
              modelProviderConfigs,
              modelProviderRegistryStatus,
              currentHref,
              sandboxReadiness,
              highlightedNodeSection,
              highlightedNodeFieldPath,
              focusedValidationItem,
              nodeConfigText,
              onNodeConfigTextChange,
              onApplyNodeConfigJson,
              onNodeConfigChange,
              onNodeInputSchemaChange,
              onNodeOutputSchemaChange,
              onNodeRuntimePolicyUpdate,
              onDeleteSelectedNode
            }}
            runtimeProps={{
              workflowId,
              node: selectedNode,
              run,
              currentHref,
              onNodeInputSchemaChange,
              onNodeOutputSchemaChange,
              highlightedNodeSection,
              highlightedNodeFieldPath,
              focusedValidationItem,
              sandboxReadiness,
              runtimeRequest,
              onRunSuccess: onRuntimeRunSuccess,
              onRunError: onRuntimeRunError,
              onRuntimeRequestHandled,
              onOpenRunOverlay
            }}
            assistantPanel={assistantPanel}
            supportsAssistantTab={supportsAssistantTab}
            onActiveTabChange={(key) => setActiveTabKey(key)}
          />
        ) : (
          <Tabs
            activeKey={activeTabKey}
            animated={{ inkBar: true, tabPane: false }}
            onChange={(key) => setActiveTabKey(key as WorkflowEditorInspectorTabKey)}
            className="workflow-editor-inspector-tabs"
            items={tabItems}
          />
        )}
      </div>
    </div>
  );
}

export function resolveWorkflowEditorInspectorPreferredTabKey({
  selectedNodeId,
  selectedEdgeId,
  focusedScope
}: {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusedScope: WorkflowValidationNavigatorItem["target"]["scope"] | null;
}): WorkflowEditorInspectorTabKey {
  if (selectedNodeId) {
    return "node-config";
  }

  if (selectedEdgeId) {
    return "edge-config";
  }

  if (focusedScope === "variables") {
    return "workflow-variables";
  }

  if (focusedScope === "publish") {
    return "workflow-publish";
  }

  return "workflow-overview";
}

export function resolveWorkflowEditorInspectorTabResetKey({
  selectedNodeId,
  selectedEdgeId,
  focusedScope
}: {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  focusedScope: WorkflowValidationNavigatorItem["target"]["scope"] | null;
}) {
  if (selectedNodeId) {
    return `node:${selectedNodeId}`;
  }

  if (selectedEdgeId) {
    return `edge:${selectedEdgeId}`;
  }

  if (focusedScope) {
    return `workflow:${focusedScope}`;
  }

  return "workflow:overview";
}

function buildSelectedNodeHeaderChips(
  selectedNode: NonNullable<WorkflowEditorInspectorProps["selectedNode"]>,
  assistantContext: WorkflowEditorAssistantContext
) {
  const chips = [
    getWorkflowNodeTypeDisplayLabel(selectedNode.data.nodeType, selectedNode.data.typeLabel)
  ];

  if (selectedNode.data.nodeType !== "startNode") {
    chips.push(`${assistantContext.upstreamLabels.length} 个上游`);
  }

  if (selectedNode.data.nodeType !== "endNode") {
    chips.push(`${assistantContext.downstreamLabels.length} 个下游`);
  }

  return chips;
}

function toRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
