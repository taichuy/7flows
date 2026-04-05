import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { StudioShell } from "@/components/studio-shell";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  WORKSPACE_TEAM_SETTINGS_HREF,
  WORKSPACE_TOOLS_HREF
} from "@/lib/workspace-console";

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
    expect(html).toContain('data-navigation-mode="all"');
    expect(html).toContain('class="workspace-nav-link active"');
    expect(html).not.toContain('class="workspace-nav-link "');
    expect(html).toContain("应用中心");
    expect(html).toContain("新建应用");
    expect(html).toContain(">工具<");
    expect(html).toContain(`href="${WORKSPACE_TOOLS_HREF}"`);
    expect(html).toContain("团队");
    expect(html).toContain(`href="${WORKSPACE_TEAM_SETTINGS_HREF}"`);
    expect(html).toContain("7Flows Admin");
    expect(html).toContain("所有者");
    expect(html).toContain('aria-current="page"');
  });

  it("uses focused layout to slim navigation on create surfaces by default", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="workspace"
        layout="focused"
        userName="7Flows Admin"
        userRole="owner"
        workspaceName="7Flows Workspace"
      >
        <div>create body</div>
      </WorkspaceShell>
    );

    expect(html).toContain('data-layout="focused"');
    expect(html).toContain('data-navigation-mode="core"');
    expect(html).toContain("创建应用");
    expect(html).toContain("工作台");
    expect(html).toContain("工具");
    expect(html).toContain("团队");
    expect(html).not.toContain(">模板<");
    expect(html).not.toContain(">运行<");
    expect(html).not.toContain("新建应用");
  });

  it("allows focused settings surfaces to keep full navigation when explicitly requested", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="team"
        layout="focused"
        navigationMode="all"
        userName="7Flows Admin"
        userRole="owner"
        workspaceName="7Flows Workspace"
      >
        <div>team body</div>
      </WorkspaceShell>
    );

    expect(html).toContain('data-navigation-mode="all"');
    expect(html).toContain("工作台设置");
    expect(html).toContain(">模板<");
    expect(html).toContain(">运行<");
    expect(html).toContain(">团队<");
  });

  it("keeps editor shell compact and hides manager-only navigation for editors", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="workspace"
        layout="editor"
        userName="7Flows Editor"
        userRole="editor"
        workspaceName="7Flows Workspace"
      >
        <div>editor body</div>
      </WorkspaceShell>
    );

    expect(html).toContain('data-layout="editor"');
    expect(html).toContain('data-navigation-mode="studio"');
    expect(html).toContain("xyflow Studio");
    expect(html).toContain("工作台");
    expect(html).toContain("工具");
    expect(html).toContain("运行");
    expect(html).not.toContain(">模板<");
    expect(html).not.toContain(">团队<");
    expect(html).not.toContain("新建应用");
  });

  it("escapes workspace and user labels instead of rendering raw html", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="workspace"
        userName={'<script>alert("user")</script>'}
        userRole="owner"
        workspaceName={'<img src=x onerror=alert(1) />'}
      >
        <div>safe body</div>
      </WorkspaceShell>
    );

    expect(html).toContain('&lt;script&gt;alert(&quot;user&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1) /&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x onerror');
  });

  it("allows the studio shell to override the tools href for return handoff", () => {
    const html = renderToStaticMarkup(
      <WorkspaceShell
        activeNav="workspace"
        layout="editor"
        navigationHrefOverrides={{
          tools:
            "/workspace/tools?return_href=%2Fworkflows%2Fworkflow-1%2Feditor&workflow_id=workflow-1&workflow_surface=editor"
        }}
        userName="7Flows Editor"
        userRole="editor"
        workspaceName="7Flows Workspace"
      >
        <div>editor body</div>
      </WorkspaceShell>
    );

    expect(html).toContain(
      'href="/workspace/tools?return_href=%2Fworkflows%2Fworkflow-1%2Feditor&amp;workflow_id=workflow-1&amp;workflow_surface=editor"'
    );
  });

  it("keeps the studio wrapper server-driven once active nav is passed by the route tree", () => {
    const html = renderToStaticMarkup(
      <StudioShell
        activeNav="runs"
        userName="7Flows Admin"
        userRole="owner"
        workspaceName="7Flows Workspace"
      >
        <div>runs body</div>
      </StudioShell>
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain("运行追踪");
    expect(html).toContain('href="/runs"');
    expect(html).toContain('aria-current="page"');
  });
});
