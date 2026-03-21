import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowEditorInspector } from "@/components/workflow-editor-inspector";

describe("WorkflowEditorInspector", () => {
  it("shows the shared save gate remediation summary inside inspector", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        selectedNode: null,
        selectedEdge: null,
        nodes: [],
        edges: [],
        tools: [],
        nodeConfigText: "{}",
        onNodeConfigTextChange: () => undefined,
        onApplyNodeConfigJson: () => undefined,
        onNodeNameChange: () => undefined,
        onNodeConfigChange: () => undefined,
        onNodeInputSchemaChange: () => undefined,
        onNodeOutputSchemaChange: () => undefined,
        onNodeRuntimePolicyUpdate: () => undefined,
        onNodeRuntimePolicyChange: () => undefined,
        workflowVersion: "1.0.0",
        availableWorkflowVersions: ["1.0.0"],
        workflowVariables: [],
        workflowPublish: [],
        onWorkflowVariablesChange: () => undefined,
        onWorkflowPublishChange: () => undefined,
        onDeleteSelectedNode: () => undefined,
        onUpdateSelectedEdge: () => undefined,
        onDeleteSelectedEdge: () => undefined,
        persistBlockedMessage: "blocked",
        persistBlockerSummary:
          "当前保存会被 2 类问题阻断：Execution capability / Publish draft。",
        persistBlockers: [
          {
            id: "tool_execution",
            label: "Execution capability",
            detail: "当前 workflow definition 还有 execution capability 待修正问题。",
            nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
          },
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "当前 workflow definition 还有 publish draft 待修正问题。",
            nextStep: "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
          }
        ],
        sandboxReadiness: null
      })
    );

    expect(html).toContain("Save gate");
    expect(html).toContain("Inspector remediation");
    expect(html).toContain("当前保存会被 2 类问题阻断");
    expect(html).toContain("Execution capability");
    expect(html).toContain("Publish draft");
    expect(html).toContain("adapter 绑定、execution class 与 sandbox readiness");
  });
});
