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
  it("renders a create rail beside a compact app list", () => {
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
            title: "Blank Flow",
            detail: "新建空白 ChatFlow，创建后继续进入 xyflow。",
            href: "/workflows/new",
            badge: "Blank"
          },
          {
            title: "从模板创建",
            detail: "先挑 starter，再进入画布。",
            href: "/workspace-starters",
            badge: "Starter"
          }
        ],
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

    expect(html).toContain("workspace-catalog-layout");
    expect(html).toContain("workspace-create-rail");
    expect(html).toContain("workspace-app-row");
    expect(html).toContain("Blank Flow");
    expect(html).toContain("继续进入 xyflow");
  });
});
