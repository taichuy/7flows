import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorInspector } from "@/components/workflow-editor-inspector";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import type { Edge, Node } from "@xyflow/react";

Object.assign(globalThis, { React });

vi.mock("@/components/workflow-node-config-form", () => ({
  WorkflowNodeConfigForm: () => createElement("div", { "data-component": "node-config-form" }, "node-config-form")
}));

vi.mock("@/components/workflow-node-config-form/node-io-schema-form", () => ({
  WorkflowNodeIoSchemaForm: () =>
    createElement("div", { "data-component": "node-io-schema-form" }, "node-io-schema-form")
}));

vi.mock("@/components/workflow-node-config-form/runtime-policy-form", () => ({
  WorkflowNodeRuntimePolicyForm: () =>
    createElement("div", { "data-component": "node-runtime-policy-form" }, "node-runtime-policy-form")
}));

vi.mock("@/components/workflow-persist-blocker-notice", () => ({
  WorkflowPersistBlockerNotice: () =>
    createElement("div", { "data-component": "persist-blocker-notice" }, "persist-blocker-notice")
}));

vi.mock("@/components/workflow-editor-publish-form", () => ({
  WorkflowEditorPublishForm: () =>
    createElement("div", { "data-component": "workflow-editor-publish-form" }, "workflow-editor-publish-form")
}));

vi.mock("@/components/workflow-editor-variable-form", () => ({
  WorkflowEditorVariableForm: () =>
    createElement("div", { "data-component": "workflow-editor-variable-form" }, "workflow-editor-variable-form")
}));

function buildSelectedNode(): Node<WorkflowCanvasNodeData> {
  return {
    id: "node-agent-1",
    position: { x: 0, y: 0 },
    data: {
      label: "LLM Agent",
      nodeType: "llm_agent",
      config: {},
      inputSchema: {},
      outputSchema: {},
      runtimePolicy: {}
    },
    type: "workflow"
  } as Node<WorkflowCanvasNodeData>;
}

function buildProps() {
  return {
    currentHref: "/workflows/demo",
    selectedNode: null,
    selectedEdge: null,
    nodes: [],
    edges: [] as Array<Edge>,
    tools: [],
    adapters: [],
    credentials: [],
    nodeConfigText: "{}",
    onNodeConfigTextChange: () => undefined,
    onApplyNodeConfigJson: () => undefined,
    onNodeNameChange: () => undefined,
    onNodeConfigChange: () => undefined,
    onNodeInputSchemaChange: () => undefined,
    onNodeOutputSchemaChange: () => undefined,
    onNodeRuntimePolicyUpdate: () => undefined,
    onNodeRuntimePolicyChange: () => undefined,
    workflowVersion: "0.1.0",
    availableWorkflowVersions: ["0.1.0"],
    workflowVariables: [],
    workflowPublish: [],
    onWorkflowVariablesChange: () => undefined,
    onWorkflowPublishChange: () => undefined,
    onDeleteSelectedNode: () => undefined,
    onUpdateSelectedEdge: () => undefined,
    onDeleteSelectedEdge: () => undefined,
    focusedValidationItem: null,
    persistBlockedMessage: null,
    persistBlockerSummary: null,
    persistBlockers: [],
    persistBlockerRecommendedNextStep: null,
    sandboxReadiness: null
  };
}

describe("WorkflowEditorInspector", () => {
  it("renders node-focused tabs when a node is selected", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: buildSelectedNode()
      })
    );

    expect(html).toContain("NODE CONFIG");
    expect(html).toContain("LLM Agent");
    expect(html).toContain("llm_agent");
    expect(html).toContain("配置");
    expect(html).toContain("I/O");
    expect(html).toContain("运行");
    expect(html).toContain("AI");
    expect(html).toContain("JSON");
    expect(html).toContain('data-component="node-config-form"');
  });

  it("falls back to workflow-level tabs when nothing is selected", () => {
    const html = renderToStaticMarkup(createElement(WorkflowEditorInspector, buildProps()));

    expect(html).toContain("WORKFLOW CONFIG");
    expect(html).toContain("应用配置");
    expect(html).toContain("当前焦点");
    expect(html).toContain("变量");
    expect(html).toContain("发布");
    expect(html).toContain("选中节点后，右侧面板只跟随当前节点。");
    expect(html).toContain("从顶栏打开 AI 辅助后，仍在这里展开。");
  });
});
