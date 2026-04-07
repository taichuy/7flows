import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorCanvas } from "@/components/workflow-editor-workbench/workflow-editor-canvas";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: React.ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@xyflow/react", () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    createElement("div", { "data-component": "react-flow-provider" }, children),
  ReactFlow: ({
    children,
    className,
    fitView,
    fitViewOptions,
    onNodeClick,
    minZoom,
    maxZoom
  }: {
    children: React.ReactNode;
    className?: string;
    fitView?: boolean;
    fitViewOptions?: { padding?: number; duration?: number };
    onNodeClick?: unknown;
    minZoom?: number;
    maxZoom?: number;
  }) =>
    createElement(
      "div",
      {
        className,
        "data-component": "react-flow",
        "data-fit-view": String(Boolean(fitView)),
        "data-fit-view-padding": String(fitViewOptions?.padding ?? ""),
        "data-fit-view-duration": String(fitViewOptions?.duration ?? ""),
        "data-has-node-click": String(typeof onNodeClick === "function"),
        "data-min-zoom": String(minZoom ?? ""),
        "data-max-zoom": String(maxZoom ?? "")
      },
      children
    ),
  Panel: ({ children, className, position }: { children: React.ReactNode; className?: string; position?: string }) =>
    createElement(
      "div",
      { className, "data-component": "react-flow-panel", "data-position": position ?? "unknown" },
      children
    ),
  Background: () => createElement("div", { "data-component": "react-flow-background" }),
  MiniMap: () => createElement("div", { "data-component": "react-flow-minimap" }),
  Controls: () => createElement("div", { "data-component": "react-flow-controls" })
}));

describe("WorkflowEditorCanvas", () => {
  it("slightly zooms the fit-view out so the larger nodes keep breathing room", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorCanvas, {
        nodes: [],
        edges: [],
        nodeTypes: {},
        onNodesChange: () => undefined,
        onEdgesChange: () => undefined,
        onConnect: () => undefined,
        onSelectionChange: () => undefined,
        isSidebarOpen: true,
        isInspectorOpen: true,
        hasNodeAssistant: false,
        canOpenInspector: false,
        canUndo: false,
        canRedo: false,
        onNodeClick: () => undefined,
        onToggleSidebar: () => undefined,
        onToggleInspector: () => undefined,
        onOpenAssistant: () => undefined,
        onUndo: () => undefined,
        onRedo: () => undefined
      })
    );

    expect(html).toContain('data-fit-view="true"');
    expect(html).toContain('data-fit-view-padding="0.2"');
    expect(html).toContain('data-fit-view-duration="240"');
    expect(html).toContain('data-has-node-click="true"');
    expect(html).toContain('data-inspector-open="true"');
    expect(html).toContain('data-action="inspector"');
    expect(html).not.toContain("workflow-editor-nav-strip");
    expect(html).not.toContain("xyflow Studio");
  });
});
