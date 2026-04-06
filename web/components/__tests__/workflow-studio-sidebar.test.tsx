import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowStudioSidebar } from "@/components/workflow-studio-sidebar";

Object.assign(globalThis, { React });

const refresh = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh
  })
}));

describe("WorkflowStudioSidebar", () => {
  it("renders shared workflow studio links and respects provided surface hrefs", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowStudioSidebar, {
        workflowId: "workflow-1",
        workflowName: "Blank Workflow",
        activeStudioSurface: "publish",
        workspaceStarterLibraryHref: "/workspace-starters?workflow=workflow-1",
        surfaceHrefs: {
          editor: "/workflows/workflow-1/editor?handoff=1",
          publish: "/workflows/workflow-1/publish?handoff=1",
          api: "/workflows/workflow-1/api?handoff=1",
          logs: "/workflows/workflow-1/logs?handoff=1",
          monitor: "/workflows/workflow-1/monitor?handoff=1"
        }
      })
    );

    expect(html).toContain('data-component="workflow-studio-sidebar"');
    expect(html).toContain("Blank Workflow");
    expect(html).toContain("当前应用的编排、发布与运行入口。");
    expect(html).toContain('href="/workflows/workflow-1/editor?handoff=1"');
    expect(html).toContain('href="/workflows/workflow-1/api?handoff=1"');
    expect(html).toContain('href="/workflows/workflow-1/logs?handoff=1"');
    expect(html).toContain('href="/workflows/workflow-1/monitor?handoff=1"');
    expect(html).toContain('href="/workflows/workflow-1/publish?handoff=1"');
    expect(html).toContain("workflow-studio-sidebar-menu");
    expect(html).toContain("workflow-studio-sidebar-link-trigger");
    expect(html).not.toContain("draft only");
    expect(html).not.toContain("0.1.0");
  });

  it("renders only the app title and description in the shared sidebar header", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowStudioSidebar, {
        workflowId: "workflow-1",
        workflowName: "Blank Workflow",
        workflowSummary: "这是一个用于画布编排与发布治理的应用。",
        activeStudioSurface: "editor",
        workspaceStarterLibraryHref: "/workspace-starters",
        dataComponent: "workflow-editor-sidebar-studio-rail"
      })
    );

    expect(html).toContain('data-component="workflow-editor-sidebar-studio-rail"');
    expect(html).toContain("Blank Workflow");
    expect(html).toContain("这是一个用于画布编排与发布治理的应用。");
    expect(html).toContain("workflow-studio-sidebar-menu");
  });
});
