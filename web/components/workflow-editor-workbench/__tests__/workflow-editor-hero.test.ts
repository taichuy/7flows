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
        workflowId: "workflow-1",
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
        workflowsCount: 6,
        selectedRunAttached: false,
        plannedNodeLabels: [],
        unsupportedNodes: [],
        contractValidationIssuesCount: 1,
        toolReferenceValidationIssuesCount: 0,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 1,
        publishDraftValidationIssuesCount: 1,
        persistBlockedMessage: "blocked",
        persistBlockerSummary: "当前保存仍被 Publish draft 阻断。",
        persistBlockers: [],
        isSaving: false,
        isSavingStarter: false,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain("Demo Workflow");
    expect(html).toContain("未保存修改");
    expect(html).toContain("3 个问题");
    expect(html).toContain("xyflow 画布 4 个节点、3 条连线、2 个工具目录入口、1 条最近运行。");
    expect(html).toContain("当前聚焦节点：LLM Agent");
    expect(html).toContain("当前保存仍被 Publish draft 阻断。");
    expect(html).toContain("保存为模板");
    expect(html).toContain("保存");
    expect(html).toContain("运行");
    expect(html).toContain("workflow-editor-topbar");
  });

  it("shows the steady-state summary when a run overlay is attached", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorHero, {
        workflowId: "workflow-2",
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
        workflowsCount: 8,
        selectedRunAttached: true,
        plannedNodeLabels: [],
        unsupportedNodes: [],
        contractValidationIssuesCount: 0,
        toolReferenceValidationIssuesCount: 0,
        nodeExecutionValidationIssuesCount: 0,
        toolExecutionValidationIssuesCount: 0,
        publishDraftValidationIssuesCount: 0,
        persistBlockedMessage: null,
        persistBlockerSummary: null,
        persistBlockers: [],
        isSaving: false,
        isSavingStarter: false,
        onSave: () => undefined,
        onSaveAsWorkspaceStarter: () => undefined
      })
    );

    expect(html).toContain("Replay Workflow");
    expect(html).toContain("可继续编排");
    expect(html).toContain("当前已挂载运行回放，可直接对照画布与运行事实。");
    expect(html).not.toContain("个问题");
    expect(html).not.toContain("workflow-editor-warning-inline");
  });
});
