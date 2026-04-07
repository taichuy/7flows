import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorNodeRuntimePanel } from "@/components/workflow-editor-inspector-panels/workflow-editor-node-runtime-panel";
import type { RunDetail } from "@/lib/get-run-detail";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import type { Node } from "@xyflow/react";

Object.assign(globalThis, { React });

vi.mock("@/app/actions/runs", () => ({
  triggerWorkflowNodeTrialRun: vi.fn()
}));

function buildNode(
  overrides: Partial<WorkflowCanvasNodeData>
): Node<WorkflowCanvasNodeData> {
  return {
    id: "node-1",
    position: { x: 0, y: 0 },
    type: "workflow",
    data: {
      label: "startNode",
      nodeType: "startNode",
      config: {},
      inputSchema: undefined,
      outputSchema: {},
      ...overrides
    }
  } as Node<WorkflowCanvasNodeData>;
}

function buildRunDetail(): RunDetail {
  return {
    id: "run-demo-1",
    workflow_id: "workflow-demo",
    workflow_version: "0.1.0",
    status: "succeeded",
    input_payload: { query: "你好" },
    output_payload: { accepted: true },
    created_at: "2026-04-04T00:00:00Z",
    event_count: 2,
    event_type_counts: {},
    node_runs: [
      {
        id: "node-run-1",
        node_id: "node-1",
        node_name: "startNode",
        node_type: "startNode",
        status: "succeeded",
        input_payload: {
          query: "你好",
          files: ["file-1"]
        },
        output_payload: {
          query: "你好",
          files: ["file-1"]
        }
      }
    ],
    events: []
  };
}

describe("WorkflowEditorNodeRuntimePanel", () => {
  it("renders node trial inputs from the current node input schema", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorNodeRuntimePanel, {
        workflowId: "workflow-demo",
        node: buildNode({})
      })
    );

    expect(html).toContain("当前节点运行态");
    expect(html).toContain("试运行输入");
    expect(html).toContain("Query");
    expect(html).toContain("Files");
    expect(html).toContain("试运行当前节点");
  });

  it("renders runtime result json from the selected node run", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorNodeRuntimePanel, {
        workflowId: "workflow-demo",
        node: buildNode({}),
        run: buildRunDetail()
      })
    );

    expect(html).toContain("运行后结果");
    expect(html).toContain("当前 run：run-demo-1");
    expect(html).toContain("Input JSON");
    expect(html).toContain("Output JSON");
    expect(html).toContain("file-1");
  });

  it("renders start-node schema editors inside the runtime tab", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorNodeRuntimePanel, {
        workflowId: "workflow-demo",
        node: buildNode({}),
        onNodeInputSchemaChange: () => undefined,
        onNodeOutputSchemaChange: () => undefined
      })
    );

    expect(html).toContain("高级系统设置");
    expect(html).toContain("Input schema JSON");
    expect(html).toContain("Output schema JSON");
  });

  it("shows the honest single-node trial disclaimer for non-trigger nodes", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorNodeRuntimePanel, {
        workflowId: "workflow-demo",
        node: buildNode({
          label: "LLM Agent",
          nodeType: "llmAgentNode",
          inputSchema: {}
        })
      })
    );

    expect(html).toContain("试运行输入");
    expect(html).toContain("不自动补齐原工作流上游节点的真实 context");
    expect(html).toContain("当前节点没有结构化输入字段");
  });
});
