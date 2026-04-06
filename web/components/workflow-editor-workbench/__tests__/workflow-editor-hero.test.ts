import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowEditorHero } from "@/components/workflow-editor-workbench/workflow-editor-hero";

Object.assign(globalThis, { React });

describe("WorkflowEditorHero", () => {
  it("renders the compact studio header with save actions and focus summary", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowName: "Demo Workflow",
        onWorkflowNameChange: () => undefined,
        workflowVersion: "1.0.0",
        nodesCount: 4,
        edgesCount: 3,
        toolsCount: 2,
        availableRunsCount: 1,
        isDirty: true,
        selectedNodeLabel: "LLM Agent",
        selectedEdgeId: null,
        selectedRunAttached: false,
        contractValidationIssuesCount: 1,
        toolReferenceValidationIssuesCount: 0,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 1,
        publishDraftValidationIssuesCount: 1,
        persistBlockerSummary: "当前保存仍被 Publish draft 阻断。",
        isSaving: false,
        isSavingStarter: false,
        isSidebarCollapsed: true,
        hasNodeAssistant: true,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined,
        onOpenAssistant: () => undefined
      })
    );

    expect(html).toContain("Demo Workflow");
    expect(html).toContain("未保存修改");
    expect(html).toContain("3 个问题");
    expect(html).toContain("4 节点");
    expect(html).toContain("3 连线");
    expect(html).toContain("2 工具");
    expect(html).toContain("1 运行");
    expect(html).toContain("已选中：LLM Agent");
    expect(html).toContain("当前保存仍被 Publish draft 阻断。");
    expect(html).toContain("AI 辅助");
    expect(html).toContain("存为模板");
    expect(html).toContain("保存");
    expect(html).toContain("运行");
    expect(html).toContain("workflow-editor-topbar");
  });

  it("shows the steady-state summary when a run overlay is attached", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowName: "Replay Workflow",
        onWorkflowNameChange: () => undefined,
        workflowVersion: "2.1.0",
        nodesCount: 2,
        edgesCount: 1,
        toolsCount: 0,
        availableRunsCount: 3,
        isDirty: false,
        selectedNodeLabel: null,
        selectedEdgeId: null,
        selectedRunAttached: true,
        contractValidationIssuesCount: 0,
        toolReferenceValidationIssuesCount: 0,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 0,
        publishDraftValidationIssuesCount: 0,
        persistBlockerSummary: null,
        isSaving: false,
        isSavingStarter: false,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain("Replay Workflow");
    expect(html).toContain("可继续编排");
    expect(html).toContain("挂载运行回放");
    expect(html).not.toContain("个问题");
    expect(html).not.toContain("workflow-editor-warning-inline");
  });

  it("switches to canvas-focused compact mode when both side rails are collapsed", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowName: "Canvas Focus Workflow",
        onWorkflowNameChange: () => undefined,
        workflowVersion: "0.3.0",
        nodesCount: 3,
        edgesCount: 2,
        toolsCount: 1,
        availableRunsCount: 4,
        isDirty: false,
        selectedNodeLabel: null,
        selectedEdgeId: null,
        selectedRunAttached: false,
        contractValidationIssuesCount: 0,
        toolReferenceValidationIssuesCount: 0,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 0,
        publishDraftValidationIssuesCount: 0,
        persistBlockerSummary: null,
        isSaving: false,
        isSavingStarter: false,
        isSidebarCollapsed: true,
        isInspectorCollapsed: true,
        onToggleSidebar: () => undefined,
        onToggleInspector: () => undefined,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain("workflow-editor-topbar canvas-focused");
    expect(html).toContain("画布优先");
    expect(html).toContain("节点栏");
    expect(html).toContain("属性栏");
    expect(html).toContain("3 节点");
    expect(html).toContain("2 连线");
    expect(html).not.toContain("1 工具");
    expect(html).not.toContain("4 运行");
  });
});
