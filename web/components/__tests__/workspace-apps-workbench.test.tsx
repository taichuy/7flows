import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceAppsWorkbench } from "@/components/workspace-apps-workbench";
import { WORKSPACE_TEAM_SETTINGS_HREF } from "@/lib/workspace-console";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

describe("WorkspaceAppsWorkbench", () => {
  it("renders a two-level workspace shell with a compact board toolbar", () => {
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
        focusedCreateHref: "/workflows/new",
        workspaceUtilityEntry: {
          title: "管理成员与权限",
          detail: "管理员可直接开通成员账号，并在工作空间里完成角色配置。",
          href: WORKSPACE_TEAM_SETTINGS_HREF,
          badge: "4 种角色"
        },
        starterCount: 5,
        workflowCreateWizardProps: {
          catalogToolCount: 0,
          governanceQueryScope: {
            activeTrack: "应用新建编排",
            sourceGovernanceKind: "all",
            needsFollowUp: false,
            searchQuery: "",
            selectedTemplateId: null
          },
          workflows: [],
          starterSourceLanes: [],
          nodeCatalog: [
            {
              type: "trigger",
              label: "Trigger",
              description: "Trigger node",
              ecosystem: "native",
              source: {
                kind: "node",
                scope: "builtin",
                status: "available",
                governance: "repo",
                ecosystem: "native",
                label: "Native node catalog",
                shortLabel: "native nodes",
                summary: "Native nodes"
              },
              capabilityGroup: "entry",
              businessTrack: "应用新建编排",
              tags: [],
              supportStatus: "available",
              supportSummary: "",
              bindingRequired: false,
              bindingSourceLanes: [],
              palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
              defaults: { name: "Trigger", config: {} }
            }
          ],
          tools: [],
          starters: [
            {
              id: "workspace-starter-1",
              origin: "workspace",
              workspaceId: "default",
              name: "Workspace starter",
              description: "Starter description",
              businessTrack: "应用新建编排",
              defaultWorkflowName: "Blank Workflow",
              workflowFocus: "Create from starter",
              recommendedNextStep: "Create workflow",
              tags: [],
              definition: {
                nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
                edges: [],
                variables: [],
                publish: []
              },
              source: {
                kind: "starter",
                scope: "workspace",
                status: "available",
                governance: "workspace",
                ecosystem: "native",
                label: "Workspace starters",
                shortLabel: "workspace ready",
                summary: "Workspace starter library"
              },
              archived: false,
              sourceGovernance: null
            }
          ]
        },
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
    expect(html).toContain('data-component="workspace-catalog-header"');
    expect(html).toContain('data-component="workspace-board-overview"');
    expect(html).toContain('data-component="workspace-browse-rail"');
    expect(html).toContain('data-component="workspace-app-list-stage"');
    expect(html).toContain("workspace-filter-rail-inline");
    expect(html).toContain("workspace-catalog-stage");
    expect(html).not.toContain('data-component="workspace-create-strip"');
    expect(html).not.toContain('data-component="workflow-create-launcher-panel"');
    expect(html).not.toContain('data-component="workflow-create-preview-panel"');
    expect(html).toContain("创建应用");
    expect(html).toContain("搜索、筛选与主操作已收口到同一工具栏");
    expect(html).toContain("workspace-app-row");
    expect(html).toContain("workspace-app-list-columns");
    expect(html).toContain("管理成员与权限");
    expect(html).toContain("应用目录");
    expect(html).toContain("进入 Studio");
    expect(html).toContain("7Flows Workspace");
    expect(html).not.toContain("查看下一步");
    expect(html.indexOf("创建应用")).toBeLessThan(html.indexOf("ChatFlow Alpha"));
    expect(html).not.toContain("最小起步");
  });
});
