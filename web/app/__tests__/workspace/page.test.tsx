import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspacePage from "@/app/workspace/page";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflows } from "@/lib/get-workflows";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { buildSystemOverviewFixture } from "@/lib/workbench-page-test-fixtures";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-client";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "workspace-shell" }, children)
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/workflow-publish-client", () => ({
  getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue(null);
});

function buildWorkspaceContext() {
  return {
    workspace: {
      id: "default",
      name: "7Flows Workspace",
      slug: "sevenflows"
    },
    current_user: {
      id: "user-admin",
      email: "admin@taichuy.com",
      display_name: "7Flows Admin",
      status: "active",
      last_login_at: "2026-03-28T09:00:00Z"
    },
    current_member: {
      id: "member-admin",
      role: "owner",
      user: {
        id: "user-admin",
        email: "admin@taichuy.com",
        display_name: "7Flows Admin",
        status: "active",
        last_login_at: "2026-03-28T09:00:00Z"
      },
      invited_by_user_id: null,
      created_at: "2026-03-27T12:00:00Z",
      updated_at: "2026-03-27T12:00:00Z"
    },
    available_roles: ["owner", "admin", "editor", "viewer"],
    can_manage_members: true
  } as Awaited<ReturnType<typeof getServerWorkspaceContext>>;
}

function buildEditorWorkspaceContext() {
  return {
    workspace: {
      id: "default",
      name: "7Flows Workspace",
      slug: "sevenflows"
    },
    current_user: {
      id: "user-editor",
      email: "editor@taichuy.com",
      display_name: "7Flows Editor",
      status: "active",
      last_login_at: "2026-03-28T09:00:00Z"
    },
    current_member: {
      id: "member-editor",
      role: "editor",
      user: {
        id: "user-editor",
        email: "editor@taichuy.com",
        display_name: "7Flows Editor",
        status: "active",
        last_login_at: "2026-03-28T09:00:00Z"
      },
      invited_by_user_id: null,
      created_at: "2026-03-27T12:00:00Z",
      updated_at: "2026-03-27T12:00:00Z"
    },
    available_roles: ["owner", "admin", "editor", "viewer"],
    can_manage_members: false
  } as Awaited<ReturnType<typeof getServerWorkspaceContext>>;
}

function buildWorkflowLibrarySnapshotFixture(
  overrides: Partial<Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>> = {}
) {
  return {
    nodes: [],
    starters: [],
    starterSourceLanes: [],
    nodeSourceLanes: [],
    toolSourceLanes: [],
    tools: [],
    ...overrides
  } as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>;
}

describe("WorkspacePage", () => {
  it("renders a compact author workspace shell with real create and search entrypoints", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-chatflow",
        name: "ChatFlow Alpha",
        version: "0.1.0",
        status: "draft",
        updated_at: "2026-03-28T09:30:00Z",
        node_count: 4,
        node_types: ["trigger", "output"],
        publish_count: 0,
        tool_governance: {
          referenced_tool_ids: ["tool.alpha"],
          missing_tool_ids: ["tool.alpha"],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      },
      {
        id: "workflow-api",
        name: "API Publish Beta",
        version: "0.2.0",
        status: "published",
        updated_at: "2026-03-28T10:30:00Z",
        node_count: 3,
        node_types: ["trigger", "output"],
        publish_count: 1,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      }
    ]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshotFixture({
      starters: [
        {
          id: "starter-chatflow",
          origin: "workspace",
          workspaceId: "default",
          name: "Starter ChatFlow",
          description: "Create from starter.",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Starter ChatFlow",
          workflowFocus: "Workspace author entry",
          recommendedNextStep: "Create from starter",
          tags: ["starter"],
          definition: {
            nodes: [],
            edges: []
          },
          source: {
            kind: "starter",
            scope: "workspace",
            status: "available",
            governance: "workspace",
            ecosystem: "7flows",
            label: "Workspace starter",
            shortLabel: "workspace",
            summary: "Workspace maintained starter"
          },
          archived: false,
          createdAt: "2026-03-27T09:00:00Z",
          updatedAt: "2026-03-28T09:00:00Z"
        }
      ]
    }));
    vi.mocked(getSystemOverview).mockResolvedValue(
      buildSystemOverviewFixture({
        runtime_activity: {
          summary: {
            recent_run_count: 0,
            recent_event_count: 2,
            run_statuses: {},
            event_types: {}
          },
          recent_runs: [],
          recent_events: []
        },
        sandbox_readiness: {
          enabled_backend_count: 1,
          healthy_backend_count: 1,
          degraded_backend_count: 0,
          offline_backend_count: 0,
          execution_classes: [],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: true,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          primary_blocker_kind: null
        }
      })
    );

    const html = renderToStaticMarkup(
      await WorkspacePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("应用工作台");
    expect(html).toContain("Workspace");
    expect(html).toContain("ChatFlow");
    expect(html).toContain("Agent");
    expect(html).toContain("Tool Agent");
    expect(html).toContain("全部 2");
    expect(html).toContain("搜索应用或治理焦点");
    expect(html).toContain('data-component="workspace-catalog-header"');
    expect(html).toContain('data-component="workspace-browse-rail"');
    expect(html).toContain('data-component="workspace-board-overview"');
    expect(html).toContain('data-component="workspace-app-list-stage"');
    expect(html).toContain('data-component="workspace-app-card-directory"');
    expect(html).toContain("应用目录");
    expect(html).toContain("创建应用");
    expect(html).toContain("全屏创建页");
    expect(html).toContain("创建、筛选后直接进入 Studio。");
    expect(html).toContain("管理成员与权限");
    expect(html).toContain("全部 2 个应用");
    expect(html).toContain("卡片目录支持分页；创建与基础编辑都收口进工作台 modal。");
    expect(html).toContain("进入 Studio");
    expect(html).toContain("编辑基础信息");
    expect(html).toContain("当前仅提供进入 Studio 与编辑基础信息；删除与复制待后端契约。");
    expect(html).toContain("治理优先");
    expect(html).not.toContain("workspace-app-row");
    expect(html).not.toContain("查看运行");
    expect(html.indexOf("创建应用")).toBeLessThan(html.indexOf("ChatFlow Alpha"));
    expect(html).toContain('href="/workflows/new"');
    expect(html).toContain('href="/workspace/settings/team"');
    expect(html).toContain('href="/workflows/workflow-chatflow"');
  });

  it("combines status, track and keyword filtering in workspace app cards", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-chatflow",
        name: "ChatFlow Alpha",
        version: "0.1.0",
        status: "draft",
        updated_at: "2026-03-28T09:30:00Z",
        node_count: 4,
        node_types: ["trigger", "output"],
        publish_count: 0,
        tool_governance: {
          referenced_tool_ids: ["tool.alpha"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      },
      {
        id: "workflow-plugin",
        name: "Plugin Bridge",
        version: "0.1.0",
        status: "draft",
        updated_at: "2026-03-28T10:00:00Z",
        node_count: 4,
        node_types: ["trigger", "tool", "output"],
        publish_count: 0,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      }
    ]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshotFixture());
    vi.mocked(getSystemOverview).mockResolvedValue(
      buildSystemOverviewFixture({
        sandbox_readiness: {
          enabled_backend_count: 1,
          healthy_backend_count: 1,
          degraded_backend_count: 0,
          offline_backend_count: 0,
          execution_classes: [],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: true,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          primary_blocker_kind: null
        }
      })
    );

    const html = renderToStaticMarkup(
      await WorkspacePage({
        searchParams: Promise.resolve({
          filter: "draft",
          track: "应用新建编排",
          keyword: "Alpha"
        })
      })
    );

    expect(html).toContain("ChatFlow Alpha");
    expect(html).not.toContain("Plugin Bridge");
    expect(html).toContain('href="/workspace?filter=draft&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"');
    expect(html).toContain(
      'href="/workflows/new?q=Alpha&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"'
    );
  });

  it("filters workspace apps by application mode before rendering cards", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-chatflow",
        name: "ChatFlow Alpha",
        version: "0.1.0",
        status: "draft",
        updated_at: "2026-03-28T09:30:00Z",
        node_count: 3,
        node_types: ["trigger", "output"],
        publish_count: 0,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      },
      {
        id: "workflow-agent",
        name: "Agent Ops",
        version: "0.2.0",
        status: "draft",
        updated_at: "2026-03-28T10:30:00Z",
        node_count: 4,
        node_types: ["llm_agent", "output"],
        publish_count: 0,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      }
    ]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshotFixture());
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverviewFixture());

    const html = renderToStaticMarkup(
      await WorkspacePage({
        searchParams: Promise.resolve({
          mode: "agent"
        })
      })
    );

    expect(html).toContain("Agent 1 个");
    expect(html).toContain("Agent Ops");
    expect(html).not.toContain("ChatFlow Alpha");
    expect(html).toContain('href="/workspace?mode=agent"');
    expect(html).toContain("当前筛选：Agent");
    expect(html).toContain('href="/workflows/new?starter=agent"');
  });

  it("orders workspace apps by latest update before rendering the directory rows", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-older",
        name: "Older Flow",
        version: "0.1.0",
        status: "draft",
        updated_at: "2026-03-28T09:30:00Z",
        node_count: 3,
        node_types: ["trigger", "output"],
        publish_count: 0,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      },
      {
        id: "workflow-newer",
        name: "Newer Flow",
        version: "0.2.0",
        status: "draft",
        updated_at: "2026-03-28T10:30:00Z",
        node_count: 3,
        node_types: ["trigger", "output"],
        publish_count: 0,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      }
    ]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshotFixture());
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverviewFixture());

    const html = renderToStaticMarkup(
      await WorkspacePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html.indexOf("Newer Flow")).toBeLessThan(html.indexOf("Older Flow"));
  });

  it("shows starter showcase cards when the workspace has no apps yet", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshotFixture({
      starters: [
        {
          id: "starter-chatflow",
          origin: "workspace",
          workspaceId: "default",
          name: "Blank Flow",
          description: "保留最小 trigger -> output 骨架，适合作为第一个应用入口。",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Blank Workflow",
          workflowFocus: "Workspace author entry",
          recommendedNextStep: "Create from starter",
          tags: ["starter"],
          definition: {
            nodes: [],
            edges: []
          },
          source: {
            kind: "starter",
            scope: "workspace",
            status: "available",
            governance: "workspace",
            ecosystem: "7flows",
            label: "Workspace starter",
            shortLabel: "workspace",
            summary: "Workspace maintained starter"
          },
          archived: false,
          createdAt: "2026-03-27T09:00:00Z",
          updatedAt: "2026-03-28T09:00:00Z"
        }
      ]
    }));
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverviewFixture());

    const html = renderToStaticMarkup(
      await WorkspacePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("当前筛选范围内还没有应用");
    expect(html).toContain("立即创建");
    expect(html).toContain("查看 Starter");
    expect(html).toContain('href="/workflows/new"');
    expect(html).toContain('href="/workspace-starters"');
  });

  it("hides member-admin entrypoints for editors without member permissions", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildEditorWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshotFixture());
    vi.mocked(getSystemOverview).mockResolvedValue(
      buildSystemOverviewFixture({
        runtime_activity: {
          summary: {
            recent_run_count: 3,
            recent_event_count: 5,
            run_statuses: {},
            event_types: {}
          },
          recent_runs: [],
          recent_events: []
        }
      })
    );

    const html = renderToStaticMarkup(
      await WorkspacePage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).not.toContain('href="/workspace/settings/team"');
    expect(html).toContain("查看运行诊断");
    expect(html).toContain('href="/runs"');
  });
});
