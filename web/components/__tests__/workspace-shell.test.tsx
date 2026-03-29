import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceShell } from "@/components/workspace-shell";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn()
  })
}));

describe("WorkspaceShell", () => {
  it("renders the default compact shell with create CTA and manager navigation", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="workspace"
        userName="7Flows Admin"
        userRole="owner"
        workspaceName="7Flows Workspace"
      >
        <div>workspace body</div>
      </WorkspaceShell>
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-layout="default"');
    expect(html).toContain("作者工作台");
    expect(html).toContain("新建应用");
    expect(html).toContain("团队");
    expect(html).toContain("7Flows Admin");
    expect(html).toContain("所有者");
    expect(html).toContain('aria-current="page"');
  });

  it("uses focused layout to slim navigation on create and settings surfaces", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="workflows"
        layout="focused"
        userName="7Flows Admin"
        userRole="owner"
        workspaceName="7Flows Workspace"
      >
        <div>create body</div>
      </WorkspaceShell>
    );

    expect(html).toContain('data-layout="focused"');
    expect(html).toContain("创建应用");
    expect(html).toContain("工作台");
    expect(html).toContain("编排");
    expect(html).toContain("团队");
    expect(html).not.toContain(">模板<");
    expect(html).not.toContain(">运行<");
    expect(html).not.toContain("新建应用");
  });

  it("keeps editor shell compact and hides manager-only navigation for editors", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="workflows"
        layout="editor"
        userName="7Flows Editor"
        userRole="editor"
        workspaceName="7Flows Workspace"
      >
        <div>editor body</div>
      </WorkspaceShell>
    );

    expect(html).toContain('data-layout="editor"');
    expect(html).toContain("xyflow Studio");
    expect(html).toContain("工作台");
    expect(html).toContain("编排");
    expect(html).toContain("运行");
    expect(html).not.toContain(">模板<");
    expect(html).not.toContain(">团队<");
    expect(html).not.toContain("新建应用");
  });
});
