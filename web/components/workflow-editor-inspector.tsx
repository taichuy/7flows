"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import { Typography, Tabs, Input, Button, Space, Tag, Empty } from "antd";

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
  buildWorkflowEditorAssistantReply,
  createWorkflowEditorAssistantGreeting,
  type WorkflowEditorAssistantContext
} from "@/lib/workflow-editor-assistant";
import type { WorkflowPersistBlocker } from "@/components/workflow-editor-workbench/persist-blockers";
import { WorkflowNodeConfigForm } from "@/components/workflow-node-config-form";
import { WorkflowNodeIoSchemaForm } from "@/components/workflow-node-config-form/node-io-schema-form";
import { WorkflowNodeRuntimePolicyForm } from "@/components/workflow-node-config-form/runtime-policy-form";
import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";
import { WorkflowEditorPublishForm } from "@/components/workflow-editor-publish-form";
import { WorkflowEditorVariableForm } from "@/components/workflow-editor-variable-form";

const { Title, Text } = Typography;
const { TextArea } = Input;

type WorkflowEditorInspectorTabKey =
  | "node-config"
  | "node-schema"
  | "node-runtime"
  | "node-assistant"
  | "node-json"
  | "edge-config"
  | "workflow-overview"
  | "workflow-variables"
  | "workflow-publish";

type WorkflowEditorAssistantMessage = {
  role: "assistant" | "user";
  content: string;
};

type WorkflowEditorInspectorProps = {
  currentHref?: string | null;
  selectedNode: Node<WorkflowCanvasNodeData> | null;
  selectedEdge: Edge<WorkflowCanvasEdgeData> | null;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  credentials: CredentialItem[];
  nodeConfigText: string;
  onNodeConfigTextChange: (value: string) => void;
  onApplyNodeConfigJson: () => void;
  onNodeNameChange: (value: string) => void;
  onNodeConfigChange: (nextConfig: Record<string, unknown>) => void;
  onNodeInputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeOutputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeRuntimePolicyUpdate: (nextRuntimePolicy: Record<string, unknown> | undefined) => void;
  onNodeRuntimePolicyChange: (value: string) => void;
  workflowVersion: string;
  availableWorkflowVersions: string[];
  workflowVariables: Array<Record<string, unknown>>;
  workflowPublish: Array<Record<string, unknown>>;
  onWorkflowVariablesChange: (
    nextVariables: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  onWorkflowPublishChange: (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  onDeleteSelectedNode: () => void;
  onUpdateSelectedEdge: (
    patch: Partial<WorkflowCanvasEdgeData> & { label?: string | undefined }
  ) => void;
  onDeleteSelectedEdge: () => void;
  highlightedNodeSection?: "config" | "contract" | "runtime" | null;
  highlightedNodeFieldPath?: string | null;
  highlightedPublishEndpointIndex?: number | null;
  highlightedPublishEndpointFieldPath?: string | null;
  highlightedVariableIndex?: number | null;
  highlightedVariableFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  persistBlockedMessage?: string | null;
  persistBlockerSummary?: string | null;
  persistBlockers: WorkflowPersistBlocker[];
  persistBlockerRecommendedNextStep?: OperatorRecommendedNextStep | null;
  assistantRequestSerial?: number;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function WorkflowEditorInspector({
  currentHref = null,
  selectedNode,
  selectedEdge,
  nodes,
  edges,
  tools,
  adapters,
  credentials,
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
  const [assistantDraft, setAssistantDraft] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<WorkflowEditorAssistantMessage[]>([]);
  const [assistantCopyState, setAssistantCopyState] = useState<"idle" | "done">("idle");

  useEffect(() => {
    setActiveTabKey(preferredTabKey);
  }, [preferredTabKey]);

  useEffect(() => {
    if (!assistantContext || assistantRequestSerial === 0) {
      return;
    }

    setActiveTabKey("node-assistant");
  }, [assistantContext, assistantRequestSerial]);

  useEffect(() => {
    if (!assistantContext) {
      setAssistantDraft("");
      setAssistantMessages([]);
      setAssistantCopyState("idle");
      return;
    }

    setAssistantDraft(assistantContext.promptSuggestions[0] ?? "");
    setAssistantMessages([
      {
        role: "assistant",
        content: createWorkflowEditorAssistantGreeting(assistantContext)
      }
    ]);
    setAssistantCopyState("idle");
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

  const assistantPanel = assistantContext ? (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      <div className="workflow-editor-assistant-hero">
        <div className="workflow-editor-assistant-hero-copy">
          <div className="workflow-editor-inspector-section-title">节点上下文</div>
          <Text type="secondary">
            先用当前节点、相邻连线和执行事实生成本地建议；后续再挂正式 assistant 接口。
          </Text>
        </div>
        <div className="workflow-editor-assistant-chip-list">
          <span className="workflow-editor-assistant-chip">{assistantContext.nodeType}</span>
          <span className="workflow-editor-assistant-chip">{assistantContext.executionClass}</span>
          <span className="workflow-editor-assistant-chip">
            schema {assistantContext.hasInputSchema || assistantContext.hasOutputSchema ? "ready" : "todo"}
          </span>
        </div>
      </div>

      <div className="workflow-editor-assistant-summary">
        <p>{assistantContext.summary}</p>
        <p>{assistantContext.topologyHint}</p>
        <p>{assistantContext.runtimeHint}</p>
      </div>

      <div className="workflow-editor-assistant-actions">
        {assistantContext.promptSuggestions.map((prompt) => (
          <Button key={prompt} size="small" onClick={() => setAssistantDraft(prompt)}>
            {prompt}
          </Button>
        ))}
        <Button
          size="small"
          type={assistantCopyState === "done" ? "primary" : "default"}
          onClick={async () => {
            if (typeof navigator === "undefined" || !navigator.clipboard) {
              return;
            }

            await navigator.clipboard.writeText(assistantContext.contextPack);
            setAssistantCopyState("done");
          }}
        >
          {assistantCopyState === "done" ? "已复制上下文" : "复制节点上下文"}
        </Button>
      </div>

      <div className="workflow-editor-assistant-thread">
        {assistantMessages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`workflow-editor-assistant-message workflow-editor-assistant-message-${message.role}`}
          >
            <span className="workflow-editor-assistant-message-role">
              {message.role === "assistant" ? "AI" : "你"}
            </span>
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      <div className="workflow-editor-assistant-composer">
        <TextArea
          rows={4}
          value={assistantDraft}
          onChange={(event) => setAssistantDraft(event.target.value)}
          placeholder="例如：帮我检查这个节点怎么配，或者下一步接什么节点。"
        />
        <div className="workflow-editor-assistant-composer-actions">
          <Button
            type="primary"
            onClick={() => {
              const trimmedDraft = assistantDraft.trim();
              if (!trimmedDraft) {
                return;
              }

              setAssistantMessages((currentMessages) => [
                ...currentMessages,
                { role: "user", content: trimmedDraft },
                {
                  role: "assistant",
                  content: buildWorkflowEditorAssistantReply(assistantContext, trimmedDraft)
                }
              ]);
              setAssistantDraft("");
            }}
          >
            生成建议
          </Button>
          <Text type="secondary">仍留在当前面板，不新增 AI 侧栏。</Text>
        </div>
      </div>
    </Space>
  ) : null;

  const workflowPublishPanel = (
    <Space orientation="vertical" size="large" style={{ width: "100%" }}>
      {persistBlockedMessage ? (
        <WorkflowPersistBlockerNotice
          title="Publish gate"
          summary={persistBlockerSummary ?? persistBlockedMessage}
          blockers={persistBlockers}
          sandboxReadiness={sandboxReadiness}
          currentHref={currentHref}
          hideRecommendedNextStep={Boolean(persistBlockerRecommendedNextStep)}
        />
      ) : null}

      <WorkflowEditorPublishForm
        currentHref={currentHref}
        workflowVersion={workflowVersion}
        availableWorkflowVersions={availableWorkflowVersions}
        publishEndpoints={workflowPublish}
        sandboxReadiness={sandboxReadiness}
        onChange={onWorkflowPublishChange}
        focusedValidationItem={
          focusedValidationItem?.target.scope === "publish" ? focusedValidationItem : null
        }
        persistBlockers={persistBlockers}
        highlightedEndpointIndex={highlightedPublishEndpointIndex}
        highlightedEndpointFieldPath={highlightedPublishEndpointFieldPath}
      />
    </Space>
  );

  const workflowVariablesPanel = (
    <WorkflowEditorVariableForm
      currentHref={currentHref}
      variables={workflowVariables}
      onChange={onWorkflowVariablesChange}
      highlightedVariableIndex={highlightedVariableIndex}
      highlightedVariableFieldPath={highlightedVariableFieldPath}
      focusedValidationItem={focusedValidationItem}
      sandboxReadiness={sandboxReadiness}
    />
  );

  const tabItems = selectedNode
    ? [
        {
          key: "node-config",
          label: "配置",
          children: (
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
              <div className="workflow-editor-inspector-section">
                <div className="workflow-editor-inspector-section-title">节点名称</div>
                <Input
                  value={selectedNode.data.label}
                  onChange={(event) => onNodeNameChange(event.target.value)}
                />
              </div>

                    <WorkflowNodeConfigForm
                      node={selectedNode}
                      nodes={nodes}
                      tools={tools}
                      adapters={adapters}
                      credentials={credentials}
                      currentHref={currentHref}
                      sandboxReadiness={sandboxReadiness}
                highlightedFieldPath={highlightedNodeSection === "config" ? highlightedNodeFieldPath : null}
                focusedValidationItem={
                  highlightedNodeSection === "config" ? focusedValidationItem : null
                }
                onChange={onNodeConfigChange}
              />
            </Space>
          )
        },
        {
          key: "node-schema",
          label: "I/O",
          children: (
            <WorkflowNodeIoSchemaForm
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
          )
        },
        {
          key: "node-runtime",
          label: "运行",
          children: (
            <WorkflowNodeRuntimePolicyForm
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
          children: (
            <Space orientation="vertical" size="large" style={{ width: "100%" }}>
              <div className="workflow-editor-inspector-section">
                <div className="workflow-editor-inspector-section-title">高级 config JSON</div>
                <Text type="secondary">
                  仅在需要精准调整字段时使用，默认仍优先走上面的结构化表单。
                </Text>
              </div>
              <TextArea
                rows={8}
                value={nodeConfigText}
                onChange={(event) => onNodeConfigTextChange(event.target.value)}
              />
              <div className="workflow-editor-inspector-json-actions">
                <Button type="default" onClick={onApplyNodeConfigJson}>
                  应用配置
                </Button>
                <Button danger onClick={onDeleteSelectedNode}>
                  删除节点
                </Button>
              </div>
            </Space>
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
