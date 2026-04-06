import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorNodeRuntimePanel } from "@/components/workflow-editor-inspector-panels/workflow-editor-node-runtime-panel";
import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import type { Node } from "@xyflow/react";

Object.assign(globalThis, { React });

vi.mock("@/app/actions/runs", () => ({
  triggerWorkflowRun: vi.fn()
}));

function buildNode(
  overrides: Partial<WorkflowCanvasNodeData>
): Node<WorkflowCanvasNodeData> {
  return {
    id: "node-1",
    position: { x: 0, y: 0 },
    type: "workflow",
    data: {
      label: "Trigger",
      nodeType: "trigger",
      config: {},
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            title: "Query",
            description: "用户输入"
          }
        },
        required: ["query"]
      },
      outputSchema: {},
      ...overrides
    }
  } as Node<WorkflowCanvasNodeData>;
}

describe("WorkflowEditorNodeRuntimePanel", () => {
  it("renders trigger runtime inputs from the trigger input schema", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorNodeRuntimePanel, {
        workflowId: "workflow-demo",
        node: buildNode({})
      })
    );

    expect(html).toContain("当前节点运行态");
    expect(html).toContain("运行时输入");
    expect(html).toContain("Query");
    expect(html).toContain("运行当前工作流");
  });

  it("shows the honest non-trigger runtime handoff when single input is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorNodeRuntimePanel, {
        workflowId: "workflow-demo",
        node: buildNode({
          label: "LLM Agent",
          nodeType: "llm_agent",
          inputSchema: {}
        })
      })
    );

    expect(html).toContain("当前节点暂不支持单独输入");
    expect(html).toContain("真实执行入口仍是 workflow trigger");
  });
});
