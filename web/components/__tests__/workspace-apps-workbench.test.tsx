import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceAppsWorkbench } from "@/components/workspace-apps-workbench";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceAppsWorkbench", () => {
  it("renders a dify-style directory toolbar with compact studio rows", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceAppsWorkbench, {
        workspaceName: "7Flows Workspace",
        currentRoleLabel: "所有者",
        currentUserDisplayName: "7Flows Admin",
        requestedKeyword: "",
        activeModeLabel: null,
        activeModeDescription: "先筛选，再进入 xyflow。",
        visibleAppSummary: "全部 2 个应用",
        modeTabs: [
          { key: "all", label: "全部", count: 2, href: "/workspace", active: true },
          { key: "chatflow", label: "ChatFlow", count: 1, href: "/workspace?mode=chatflow", active: false }
        ],
        scopePills: [],
        statusFilters: [{ key: "draft", label: "草稿 2", href: "/workspace?filter=draft", active: true }],
        workspaceSignals: [
          { label: "应用", value: "2" },
          { label: "草稿", value: "2" }
        ],
        quickCreateEntries: [
          {
            title: "创建空白应用",
            detail: "直接生成最小 workflow 草稿，创建后进入 Studio。",
            href: "/workflows/new",
            badge: "Blank"
          },
          {
            title: "从 Starter 模板创建",
            detail: "先选团队模板，再把草稿送进 Studio。",
            href: "/workspace-starters",
            badge: "Starter"
          }
        ],
        workspaceUtilityEntry: {
          title: "管理成员与权限",
          detail: "管理员可直接开通成员账号，并在工作空间里完成角色配置。",
          href: "/admin/members",
          badge: "4 种角色"
        },
        starterHighlights: [
          {
            id: "starter-blank",
            name: "Blank Flow",
            description: "最小 trigger -> output 骨架。",
            href: "/workflows/new?starter=blank",
            track: "应用新建编排",
            priority: "P0",
            modeShortLabel: "ChatFlow"
          }
        ],
        starterCount: 5,
        filteredApps: [
          {
            id: "workflow-1",
            name: "ChatFlow Alpha",
            href: "/workflows/workflow-1",
            status: "draft",
            healthLabel: "可继续编排",
            recommendedNextStep: "继续进入 xyflow",
            updatedAt: "2026-03-28T12:00:00Z",
            nodeCount: 4,
            publishCount: 0,
            missingToolCount: 0,
            followUpCount: 0,
            mode: { label: "ChatFlow", shortLabel: "ChatFlow" },
            track: {
              id: "应用新建编排",
              priority: "P0",
              focus: "最小起步",
              summary: "先完成工作台到画布的闭环。"
            }
          }
        ],
        searchState: {
          filter: "draft",
          mode: null,
          track: null,
          clearHref: null
        }
      })
    );

    expect(html).toContain("workspace-apps-dify-shell");
    expect(html).toContain("workspace-filter-rail-inline");
    expect(html).toContain("workspace-create-strip");
    expect(html).toContain("创建空白应用");
    expect(html).toContain("workspace-app-row");
    expect(html).toContain("workspace-app-list-columns");
    expect(html).toContain("管理成员与权限");
    expect(html).toContain("应用目录");
    expect(html).toContain("重点");
    expect(html).toContain("进入 Studio");
    expect(html).toContain("查看下一步");
  });
});
