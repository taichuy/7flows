"use client";

import React, { memo, useState } from "react";
import { Button, Space, Typography, Tag, Tooltip, Input } from "antd";
import {
  SaveOutlined,
  PlayCircleOutlined,
  WarningOutlined,
  EditOutlined,
  RobotOutlined
} from "@ant-design/icons";

const { Text } = Typography;

type WorkflowEditorHeroProps = {
  workflowName: string;
  onWorkflowNameChange: (name: string) => void;
  workflowVersion: string;
  nodesCount: number;
  edgesCount: number;
  toolsCount: number;
  availableRunsCount: number;
  isDirty: boolean;
  selectedNodeLabel: string | null;
  selectedEdgeId: string | null;
  selectedRunAttached: boolean;
  contractValidationIssuesCount: number;
  toolReferenceValidationIssuesCount: number;
  nodeExecutionValidationIssuesCount: number;
  toolExecutionValidationIssuesCount: number;
  publishDraftValidationIssuesCount: number;
  persistBlockerSummary: string | null;
  isSaving: boolean;
  isSavingStarter: boolean;
  isSidebarCollapsed?: boolean;
  isInspectorCollapsed?: boolean;
  hasNodeAssistant?: boolean;
  canToggleInspector?: boolean;
  onToggleSidebar?: () => void;
  onToggleInspector?: () => void;
  onOpenAssistant?: () => void;
  onSave: () => void;
  onSaveAsWorkspaceStarter: () => void;
  onOpenRunLauncher?: () => void;
};

function WorkflowEditorHeroComponent({
  workflowName,
  onWorkflowNameChange,
  workflowVersion,
  nodesCount,
  edgesCount,
  toolsCount,
  availableRunsCount,
  isDirty,
  selectedNodeLabel,
  selectedEdgeId,
  selectedRunAttached,
  contractValidationIssuesCount,
  toolReferenceValidationIssuesCount,
  nodeExecutionValidationIssuesCount,
  toolExecutionValidationIssuesCount,
  publishDraftValidationIssuesCount,
  persistBlockerSummary,
  isSaving,
  isSavingStarter,
  isSidebarCollapsed = false,
  isInspectorCollapsed = false,
  hasNodeAssistant = false,
  canToggleInspector = true,
  onToggleSidebar,
  onToggleInspector,
  onOpenAssistant,
  onSave,
  onSaveAsWorkspaceStarter,
  onOpenRunLauncher
}: WorkflowEditorHeroProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const isCanvasFocused = isSidebarCollapsed && isInspectorCollapsed;

  const totalIssues =
    contractValidationIssuesCount +
    toolReferenceValidationIssuesCount +
    nodeExecutionValidationIssuesCount +
    toolExecutionValidationIssuesCount +
    publishDraftValidationIssuesCount;
  const surfaceSummary = isCanvasFocused
    ? "画布优先"
    : isSidebarCollapsed
      ? "仅属性栏展开"
      : isInspectorCollapsed
        ? "仅节点栏展开"
        : null;
  const focusSummary = selectedNodeLabel
    ? `已选中：${selectedNodeLabel}`
    : selectedEdgeId
      ? `已选中连线：${selectedEdgeId}`
      : selectedRunAttached
        ? "挂载运行回放"
        : "画布已就绪，可继续编排";
  const workflowSignals = [
    `${nodesCount} 节点`,
    `${edgesCount} 连线`,
    `${toolsCount} 工具`,
    `${availableRunsCount} 运行`
  ];
  const visibleWorkflowSignals = isCanvasFocused ? workflowSignals.slice(0, 2) : workflowSignals;
  const topbarClassName = [
    "workflow-editor-topbar",
    isCanvasFocused ? "canvas-focused" : null
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={topbarClassName}>
      <div className="workflow-editor-topbar-copy">
        <div className="workflow-editor-title-row">
          {isEditingName ? (
            <Input
              className="workflow-editor-title-input"
              autoFocus
              defaultValue={workflowName}
              onBlur={(e) => {
                onWorkflowNameChange(e.target.value);
                setIsEditingName(false);
              }}
              onPressEnter={(e) => {
                onWorkflowNameChange(e.currentTarget.value);
                setIsEditingName(false);
              }}
            />
          ) : (
            <button
              className="workflow-editor-title-button"
              type="button"
              onClick={() => setIsEditingName(true)}
            >
              <Text strong>{workflowName}</Text>
              <EditOutlined aria-hidden="true" />
            </button>
          )}
          <Tag color="blue">v{workflowVersion}</Tag>
          {isDirty ? <Tag color="warning">未保存修改</Tag> : <Tag color="success">可继续编排</Tag>}
          {totalIssues > 0 ? (
            <Tooltip title={`发现 ${totalIssues} 个验证问题`}>
              <Tag icon={<WarningOutlined />} color="error">
                {totalIssues} 个问题
              </Tag>
            </Tooltip>
          ) : null}
        </div>

        <div className="workflow-editor-meta-row" aria-label="Workflow editor summary">
          {surfaceSummary ? (
            <span className="workflow-editor-meta-pill surface">{surfaceSummary}</span>
          ) : null}
          {visibleWorkflowSignals.map((signal) => (
            <span className="workflow-editor-meta-pill" key={signal}>
              {signal}
            </span>
          ))}
          <span className="workflow-editor-meta-pill focus">{focusSummary}</span>
        </div>

        {persistBlockerSummary ? (
          <div className="workflow-editor-warning-inline">
            <WarningOutlined aria-hidden="true" />
            <Text type="danger">{persistBlockerSummary}</Text>
          </div>
        ) : null}
      </div>

      <Space size="small" wrap className="workflow-editor-action-row">
        <Button
          className="workflow-editor-toggle-button"
          type={isSidebarCollapsed ? "default" : "text"}
          onClick={onToggleSidebar}
        >
          节点栏
        </Button>
        <Button
          className="workflow-editor-toggle-button"
          type={isInspectorCollapsed ? "default" : "text"}
          disabled={!canToggleInspector}
          onClick={onToggleInspector}
        >
          属性栏
        </Button>
        {hasNodeAssistant ? (
          <Button
            className="workflow-editor-toggle-button"
            type="default"
            icon={<RobotOutlined />}
            onClick={onOpenAssistant}
          >
            AI 辅助
          </Button>
        ) : null}
        <Button
          icon={<SaveOutlined />}
          onClick={onSaveAsWorkspaceStarter}
          loading={isSavingStarter}
        >
          存为模板
        </Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={onSave}
          loading={isSaving}
          disabled={!!persistBlockerSummary}
        >
          保存
        </Button>
        <Button
          type="primary"
          className="workflow-editor-run-button"
          icon={<PlayCircleOutlined />}
          onClick={onOpenRunLauncher}
        >
          运行
        </Button>
      </Space>
    </div>
  );
}

export const WorkflowEditorHero = memo(WorkflowEditorHeroComponent);
