import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCanvasNode } from "@/components/workflow-editor-workbench/workflow-canvas-node";

Object.assign(globalThis, { React });

vi.mock("@xyflow/react", () => ({
  Handle: ({ type, position }: { type: string; position: string }) =>
    createElement("div", { "data-component": "handle", "data-type": type, "data-position": position }),
  Position: {
    Left: "left",
    Right: "right"
  }
}));

vi.mock("@/components/workflow-editor-workbench/workflow-canvas-quick-add", () => ({
  WorkflowCanvasQuickAddTrigger: () => createElement("div", { "data-component": "quick-add" })
}));

describe("WorkflowCanvasNode", () => {
  it("shows a trial-run entry on selected nodes", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCanvasNode, {
        id: "node-1",
        selected: true,
        data: {
          label: "用户输入",
          nodeType: "startNode",
          typeLabel: "开始",
          capabilityGroup: "trigger",
          config: {}
        },
        dragging: false,
        zIndex: 1,
        selectable: true,
        deletable: true,
        draggable: true,
        isConnectable: true,
        sourcePosition: "right",
        targetPosition: "left",
        xPos: 0,
        yPos: 0,
        onOpenRuntime: () => undefined
      } as never)
    );

    expect(html).toContain('data-action="open-node-runtime-from-node"');
    expect(html).toContain("试运行 用户输入");
  });

  it("keeps runtime values out of the canvas node body", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCanvasNode, {
        id: "node-1",
        selected: true,
        data: {
          label: "用户输入",
          nodeType: "startNode",
          typeLabel: "开始",
          capabilityGroup: "trigger",
          config: {},
          runStatus: "succeeded",
          runLastEventType: "node.output.completed",
          runDurationMs: 6,
          runEventCount: 3,
          runErrorMessage: "boom"
        },
        dragging: false,
        zIndex: 1,
        selectable: true,
        deletable: true,
        draggable: true,
        isConnectable: true,
        sourcePosition: "right",
        targetPosition: "left",
        xPos: 0,
        yPos: 0,
        onOpenRuntime: () => undefined
      } as never)
    );

    expect(html).not.toContain("workflow-canvas-node-runtime");
    expect(html).not.toContain("node.output.completed");
    expect(html).not.toContain("3 events");
    expect(html).not.toContain("boom");
  });

  it("shows direct-reply preview text for end nodes", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCanvasNode, {
        id: "node-2",
        selected: false,
        data: {
          label: "结束",
          nodeType: "endNode",
          typeLabel: "结束",
          capabilityGroup: "output",
          config: {
            replyTemplate: "你好，{{ accumulated.agent.answer }}"
          }
        },
        dragging: false,
        zIndex: 1,
        selectable: true,
        deletable: true,
        draggable: true,
        isConnectable: true,
        sourcePosition: "right",
        targetPosition: "left",
        xPos: 0,
        yPos: 0
      } as never)
    );

    expect(html).toContain("你好，{{ accumulated.agent.answer }}");
  });

});
