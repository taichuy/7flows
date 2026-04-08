import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  WorkflowEditorInspector,
  resolveWorkflowEditorInspectorTabResetKey
} from "@/components/workflow-editor-inspector";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import type { Edge, Node } from "@xyflow/react";

Object.assign(globalThis, { React });

vi.mock("next/dynamic", async () => {
  const nodeConfigModule = await vi.importMock<
    typeof import("@/components/workflow-node-config-form")
  >("@/components/workflow-node-config-form");
  const nodeSchemaModule = await vi.importMock<
    typeof import("@/components/workflow-node-config-form/node-io-schema-form")
  >("@/components/workflow-node-config-form/node-io-schema-form");
  const nodeRuntimeModule = await vi.importMock<
    typeof import("@/components/workflow-node-config-form/runtime-policy-form")
  >("@/components/workflow-node-config-form/runtime-policy-form");
  const assistantPanelModule = await vi.importActual<
    typeof import("@/components/workflow-editor-inspector-panels/workflow-editor-assistant-panel")
  >("@/components/workflow-editor-inspector-panels/workflow-editor-assistant-panel");
  const jsonPanelModule = await vi.importActual<
    typeof import("@/components/workflow-editor-inspector-panels/workflow-editor-json-panel")
  >("@/components/workflow-editor-inspector-panels/workflow-editor-json-panel");
  const publishPanelModule = await vi.importActual<
    typeof import("@/components/workflow-editor-inspector-panels/workflow-editor-publish-panel")
  >("@/components/workflow-editor-inspector-panels/workflow-editor-publish-panel");

  return {
    default: (loader: { toString: () => string }) => {
      const source = loader.toString();

      if (source.includes("workflow-node-config-form/runtime-policy-form")) {
        return nodeRuntimeModule.WorkflowNodeRuntimePolicyForm;
      }

      if (source.includes("workflow-node-config-form/node-io-schema-form")) {
        return nodeSchemaModule.WorkflowNodeIoSchemaForm;
      }

      if (source.includes("workflow-node-config-form")) {
        return nodeConfigModule.WorkflowNodeConfigForm;
      }

      if (source.includes("workflow-editor-inspector-panels/workflow-editor-assistant-panel")) {
        return assistantPanelModule.WorkflowEditorAssistantPanel;
      }

      if (source.includes("workflow-editor-inspector-panels/workflow-editor-json-panel")) {
        return jsonPanelModule.WorkflowEditorJsonPanel;
      }

      if (source.includes("workflow-editor-inspector-panels/workflow-editor-publish-panel")) {
        return publishPanelModule.WorkflowEditorPublishPanel;
      }

      return () => null;
    }
  };
});

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
      nodeType: "llmAgentNode",
      config: {},
      inputSchema: {},
      outputSchema: {},
      runtimePolicy: {}
    },
    type: "workflow"
  } as Node<WorkflowCanvasNodeData>;
}

function buildTriggerNode(): Node<WorkflowCanvasNodeData> {
  return {
    id: "startNode",
    position: { x: 0, y: 0 },
    data: {
      label: "开始",
      nodeType: "startNode",
      typeLabel: "开始",
      config: {},
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            title: "Query"
          }
        },
        required: ["query"]
      },
      outputSchema: {}
    },
    type: "workflow"
  } as Node<WorkflowCanvasNodeData>;
}

function buildProps() {
  return {
    workflowId: "workflow-demo",
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
    onNodeDescriptionChange: () => undefined,
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
  it("routes selected nodes through the shared node panel entry", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: buildSelectedNode()
      })
    );

    expect(html).toContain('data-component="workflow-editor-node-panel"');
    expect(html).toContain("设置");
    expect(html).toContain("运行时");
  });

  it("keeps start nodes on the same shared node panel entry", () => {
    const triggerNode = buildTriggerNode();
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: triggerNode,
        nodes: [triggerNode]
      })
    );

    expect(html).toContain('data-component="workflow-editor-node-panel"');
    expect(html).toContain("设置");
    expect(html).toContain("运行时");
  });

  it("renders node-focused tabs when a node is selected", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: buildSelectedNode()
      })
    );

    expect(html).toContain("LLM Agent");
    expect(html).toContain("添加描述...");
    expect(html).toContain("llmAgentNode");
    expect(html).toContain("设置");
    expect(html).toContain("运行时");
    expect(html).toContain("AI");
    expect(html).toContain('data-component="node-config-form"');
    expect(html).toContain('高级设置');
    expect(html).toContain('原始 JSON');
    expect(html).not.toContain('workflow-editor-inspector-section-title">节点名称');
    expect(html).not.toContain('data-component="workflow-editor-assistant-panel"');
    expect(html).not.toContain('data-component="workflow-editor-node-runtime-panel"');
  });

  it("uses a dify-like settings/runtime structure for start nodes", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: buildTriggerNode(),
        nodes: [buildTriggerNode()]
      })
    );

    expect(html).toContain("开始");
    expect(html).toContain("设置");
    expect(html).toContain("运行时");
    expect(html).toContain("输入字段");
    expect(html).toContain("新增参数");
    expect(html).toContain("query");
    expect(html).toContain("files");
    expect(html).toContain("String");
    expect(html).toContain("Array");
    expect(html).not.toContain("编辑参数 query");
    expect(html).not.toContain("删除参数 query");
    expect(html).not.toContain("编辑参数 files");
    expect(html).not.toContain("删除参数 files");
    expect(html).toContain("下一步");
    expect(html).not.toContain("高级设置");
    expect(html).not.toContain("原始 JSON");
    expect(html).not.toContain("个上游");
    expect(html).not.toContain("Trigger settings");
    expect(html).not.toContain("这些字段会作为 workflow run");
    expect(html).not.toContain("当前入口节点还没有显式输入字段");
    expect(html).not.toContain("workflow-editor-assistant-panel");
  });

  it("switches start-node contract focus to the runtime tab", () => {
    const triggerNode = buildTriggerNode();
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: triggerNode,
        nodes: [triggerNode],
        highlightedNodeSection: "contract",
        highlightedNodeFieldPath: "inputSchema"
      })
    );

    expect(html).toContain('data-component="workflow-editor-node-runtime-panel"');
    expect(html).toContain('data-component="workflow-editor-node-runtime-contract"');
    expect(html).toContain('data-component="node-io-schema-form"');
    expect(html).not.toContain("高级系统设置");
    expect(html).not.toContain("原始 JSON");
  });

  it("hides the duplicate node title input when the floating panel owns the title", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        nodeTitlePlacement: "floating-panel",
        selectedNode: buildSelectedNode()
      })
    );

    expect(html).not.toContain("workflow-editor-inspector-node-title-input");
    expect(html).toContain("workflow-editor-inspector-node-description-input");
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
    expect(html).not.toContain('data-component="workflow-editor-variable-form"');
    expect(html).not.toContain('data-component="workflow-editor-publish-form"');
  });

  it("mounts the publish form only when publish becomes the active focus", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        focusedValidationItem: {
          key: "publish:endpoint:0:slug",
          message: "publish slug missing",
          target: {
            scope: "publish",
            label: "Publish endpoint",
            endpointIndex: 0,
            fieldPath: "slug"
          }
        } as never
      })
    );

    expect(html).toContain('data-component="workflow-editor-publish-panel"');
    expect(html).toContain('data-component="workflow-editor-publish-form"');
  });

  it("keeps the same tab reset key for the same selected node id", () => {
    expect(
      resolveWorkflowEditorInspectorTabResetKey({
        selectedNodeId: "node-agent-1",
        selectedEdgeId: null,
        focusedScope: null
      })
    ).toBe(
      resolveWorkflowEditorInspectorTabResetKey({
        selectedNodeId: "node-agent-1",
        selectedEdgeId: null,
        focusedScope: null
      })
    );
  });

  it("mounts schema and runtime panels when validation focus switches the preferred tab", () => {
    const schemaHtml = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: buildSelectedNode(),
        highlightedNodeSection: "contract",
        highlightedNodeFieldPath: "inputSchema"
      })
    );
    const runtimeHtml = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        ...buildProps(),
        selectedNode: buildSelectedNode(),
        highlightedNodeSection: "runtime",
        highlightedNodeFieldPath: "retry.maxAttempts"
      })
    );

    expect(schemaHtml).toContain('data-component="node-io-schema-form"');
    expect(schemaHtml).toContain('data-component="node-runtime-policy-form"');
    expect(runtimeHtml).toContain('data-component="node-runtime-policy-form"');
    expect(runtimeHtml).toContain('data-component="node-io-schema-form"');
  });
});
