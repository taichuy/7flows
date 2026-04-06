import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCanvasNode } from "@/components/workflow-editor-workbench/workflow-canvas-node";

Object.assign(globalThis, { React });

type WorkflowCanvasNodeProps = React.ComponentProps<typeof WorkflowCanvasNode>;

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) =>
    createElement("div", {
      "data-component": "react-flow-handle",
      "data-type": type,
      "data-position": position
    }),
  Position: {
    Left: "left",
    Right: "right"
  }
}));

function buildNodeProps(selected: boolean): WorkflowCanvasNodeProps {
  return {
    id: "node-1",
    type: "workflowNode",
    selected,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    zIndex: 1,
    isConnectable: true,
    xPos: 120,
    yPos: 80,
    data: {
      label: "Agent",
      nodeType: "llm_agent",
      typeLabel: "LLM Agent",
      typeDescription: "让 agent 继续推理。",
      capabilityGroup: "agent",
      config: {}
    }
  } as unknown as WorkflowCanvasNodeProps;
}

describe("WorkflowCanvasNode", () => {
  it("renders the type description before selection so node size stays stable", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCanvasNode, buildNodeProps(false))
    );

    expect(html).toContain("让 agent 继续推理。");
    expect(html).not.toContain("后添加节点");
    expect(html).not.toContain("workflow-canvas-node selected");
  });

  it("keeps selection affordances without changing the description footprint", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCanvasNode, {
        ...buildNodeProps(true),
        onQuickAdd: () => undefined,
        quickAddOptions: [
          {
            type: "output",
            label: "结果输出",
            description: "输出处理结果",
            capabilityGroup: "output"
          }
        ]
      })
    );

    expect(html).toContain("workflow-canvas-node selected");
    expect(html).toContain("让 agent 继续推理。");
    expect(html).toContain("Agent 后添加节点");
    expect(html).toContain("workflow-canvas-node-quick-add-trigger nodrag nopan nowheel");
    expect(html).not.toContain("下一节点");
    expect(html).not.toContain("节点操作");
  });
});
