import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCanvasEdge } from "@/components/workflow-editor-workbench/workflow-canvas-edge";

Object.assign(globalThis, { React });

vi.mock("@xyflow/react", () => ({
  BaseEdge: ({
    path,
    label
  }: {
    path?: string;
    label?: string | number | null;
  }) =>
    createElement("div", {
      "data-component": "react-flow-base-edge",
      "data-path": path ?? "",
      "data-label": label ?? ""
    }),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-component": "react-flow-edge-label-renderer" }, children),
  getSmoothStepPath: () => ["M0,0", 160, 120]
}));

function buildEdgeProps(channel: "control" | "data") {
  return {
    id: "edge-1",
    source: "trigger",
    target: "output",
    type: "smoothstep",
    selected: false,
    sourceX: 120,
    sourceY: 120,
    targetX: 400,
    targetY: 120,
    sourcePosition: "right",
    targetPosition: "left",
    data: {
      channel
    }
  } as React.ComponentProps<typeof WorkflowCanvasEdge>;
}

describe("WorkflowCanvasEdge", () => {
  it("renders a quick-add trigger for control edges", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCanvasEdge, {
        ...buildEdgeProps("control"),
        quickAddOptions: [
          {
            type: "llm_agent",
            label: "LLM Agent",
            description: "让 agent 继续推理。",
            capabilityGroup: "agent"
          }
        ],
        onQuickAdd: () => undefined
      })
    );

    expect(html).toContain('data-component="react-flow-base-edge"');
    expect(html).toContain("在连线中间插入节点");
    expect(html).toContain("workflow-canvas-edge-quick-add-trigger nodrag nopan nowheel");
    expect(html).not.toContain("workflow-canvas-edge-quick-add-shell visible");
  });

  it("does not render a quick-add trigger for data edges", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowCanvasEdge, {
        ...buildEdgeProps("data"),
        onQuickAdd: () => undefined
      })
    );

    expect(html).not.toContain("在连线中间插入节点");
  });
});
