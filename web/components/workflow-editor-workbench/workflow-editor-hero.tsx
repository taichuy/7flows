"use client";

import React, { useState } from "react";
import { Button, Space, Typography, Tag, Tooltip, Input } from "antd";
import { SaveOutlined, PlayCircleOutlined, WarningOutlined, EditOutlined } from "@ant-design/icons";
import type { OperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import type { UnsupportedWorkflowNodeSummary } from "@/lib/workflow-node-catalog";
import type { WorkflowPersistBlocker } from "./persist-blockers";

const { Text } = Typography;

type WorkflowEditorHeroProps = {
  currentHref?: string | null;
  workflowId: string;
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
  workflowsCount: number;
  selectedRunAttached: boolean;
  plannedNodeLabels: string[];
  unsupportedNodes: UnsupportedWorkflowNodeSummary[];
  contractValidationIssuesCount: number;
  toolReferenceValidationIssuesCount: number;
  nodeExecutionValidationIssuesCount: number;
  toolExecutionValidationIssuesCount: number;
  publishDraftValidationIssuesCount: number;
  persistBlockedMessage: string | null;
  persistBlockerSummary: string | null;
  persistBlockers: WorkflowPersistBlocker[];
  persistBlockerRecommendedNextStep?: OperatorRecommendedNextStep | null;
  isSaving: boolean;
  isSavingStarter: boolean;
  workflowLibraryHref?: string;
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
  hasScopedWorkspaceStarterFilters?: boolean;
  onSave: () => void;
  onSaveAsWorkspaceStarter: () => void;
};

export function WorkflowEditorHero({
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
  workflowsCount,
  selectedRunAttached,
  plannedNodeLabels,
  unsupportedNodes,
  contractValidationIssuesCount,
  toolReferenceValidationIssuesCount,
  nodeExecutionValidationIssuesCount,
  toolExecutionValidationIssuesCount,
  publishDraftValidationIssuesCount,
  persistBlockerSummary,
  isSaving,
  isSavingStarter,
  onSave,
  onSaveAsWorkspaceStarter
}: WorkflowEditorHeroProps) {
  const [isEditingName, setIsEditingName] = useState(false);

  const totalIssues =
    contractValidationIssuesCount +
    toolReferenceValidationIssuesCount +
    nodeExecutionValidationIssuesCount +
    toolExecutionValidationIssuesCount +
    publishDraftValidationIssuesCount;
  const focusSummary = selectedNodeLabel
    ? `当前聚焦节点：${selectedNodeLabel}`
    : selectedEdgeId
      ? `当前聚焦连线：${selectedEdgeId}`
      : selectedRunAttached
        ? "当前已挂载运行回放，可直接对照画布与运行事实。"
        : `当前应用库共 ${workflowsCount} 个应用；先完成保存，再继续运行或切去发布治理。`;
  const workflowSummary = `xyflow 画布 ${nodesCount} 个节点、${edgesCount} 条连线、${toolsCount} 个工具目录入口、${availableRunsCount} 条最近运行。`;

  return (
    <div className="workflow-editor-topbar">
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
          <span className="workflow-editor-meta-pill">{workflowSummary}</span>
          <span className="workflow-editor-meta-pill focus">{focusSummary}</span>
        </div>

        {persistBlockerSummary ? (
          <div className="workflow-editor-warning-inline">
            <WarningOutlined aria-hidden="true" />
            <Text type="danger">{persistBlockerSummary}</Text>
          </div>
        ) : null}
      </div>

      <Space size="middle" wrap className="workflow-editor-action-row">
        <Button icon={<SaveOutlined />} onClick={onSaveAsWorkspaceStarter} loading={isSavingStarter}>
          保存为模板
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
        >
          运行
        </Button>
      </Space>
    </div>
  );
}
