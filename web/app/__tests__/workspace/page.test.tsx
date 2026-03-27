import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspacePage from "@/app/workspace/page";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { buildSystemOverviewFixture } from "@/lib/workbench-page-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
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
  getWorkflowDetail: vi.fn(),
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
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

function buildWorkflowDetailFixture(overrides: Partial<NonNullable<Awaited<ReturnType<typeof getWorkflowDetail>>>> = {}) {
  return {
    id: "workflow-chatflow",
    name: "ChatFlow Alpha",
    version: "0.1.0",
    status: "draft",
    node_count: 4,
    tool_governance: {
      referenced_tool_ids: ["tool.alpha"],
      missing_tool_ids: ["tool.alpha"],
      governed_tool_count: 1,
      strong_isolation_tool_count: 0
    },
    definition_issues: [],
    definition: {
      nodes: [],
      edges: [],
      publish: []
    },
    created_at: "2026-03-27T09:00:00Z",
    updated_at: "2026-03-28T09:30:00Z",
    versions: [],
    ...overrides
  } as NonNullable<Awaited<ReturnType<typeof getWorkflowDetail>>>;
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
  it("renders a Dify-like workspace shell with real create and search entrypoints", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-chatflow",
        name: "ChatFlow Alpha",
        version: "0.1.0",
        status: "draft",
        node_count: 4,
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
        node_count: 3,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      }
    ]);
    vi.mocked(getWorkflowDetail)
      .mockResolvedValueOnce(buildWorkflowDetailFixture())
      .mockResolvedValueOnce(
        buildWorkflowDetailFixture({
          id: "workflow-api",
          name: "API Publish Beta",
          status: "published",
          tool_governance: {
            referenced_tool_ids: [],
            missing_tool_ids: [],
            governed_tool_count: 1,
            strong_isolation_tool_count: 0
          },
          definition: {
            nodes: [],
            edges: [],
            publish: [{ id: "publish-1" }]
          }
        })
      );
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

    expect(html).toContain("7Flows Workspace 应用工作台");
    expect(html).toContain("Workspace / Apps");
    expect(html).toContain("ChatFlow");
    expect(html).toContain("Agent");
    expect(html).toContain("Tool Agent");
    expect(html).toContain("全部类型");
    expect(html).toContain("搜索应用、Agent、工具链或治理焦点");
    expect(html).toContain("新建空白 ChatFlow");
    expect(html).toContain("从应用模板创建");
    expect(html).toContain("推荐 Starter");
    expect(html).toContain("应用目录 · 全部 2 个应用");
    expect(html).toContain("继续进入 xyflow");
    expect(html).toContain("推荐下一步：先补齐 1 个工具缺口，再进入 xyflow 继续编排。");
    expect(html).toContain('href="/workflows/new"');
    expect(html).toContain('href="/workspace-starters"');
    expect(html).toContain('href="/admin/members"');
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
        node_count: 4,
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
        node_count: 4,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      }
    ]);
    vi.mocked(getWorkflowDetail)
      .mockResolvedValueOnce(
        buildWorkflowDetailFixture({
          id: "workflow-chatflow",
          name: "ChatFlow Alpha"
        })
      )
      .mockResolvedValueOnce(
        buildWorkflowDetailFixture({
          id: "workflow-plugin",
          name: "Plugin Bridge",
          definition: {
            nodes: [
              {
                id: "node-plugin",
                type: "tool",
                name: "Plugin tool"
              }
            ],
            edges: [],
            publish: []
          }
        })
      );
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
  });

  it("filters workspace apps by application mode before rendering cards", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-chatflow",
        name: "ChatFlow Alpha",
        version: "0.1.0",
        status: "draft",
        node_count: 3,
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
        node_count: 4,
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        definition_issues: []
      }
    ]);
    vi.mocked(getWorkflowDetail)
      .mockResolvedValueOnce(
        buildWorkflowDetailFixture({
          id: "workflow-chatflow",
          name: "ChatFlow Alpha",
          definition: {
            nodes: [
              {
                id: "trigger",
                type: "trigger",
                name: "Trigger"
              },
              {
                id: "output",
                type: "output",
                name: "Output"
              }
            ],
            edges: [],
            publish: []
          }
        })
      )
      .mockResolvedValueOnce(
        buildWorkflowDetailFixture({
          id: "workflow-agent",
          name: "Agent Ops",
          definition: {
            nodes: [
              {
                id: "agent",
                type: "llm_agent",
                name: "Agent"
              }
            ],
            edges: [],
            publish: []
          }
        })
      );
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
    expect(html).toContain("新建 Agent 草稿");
  });

  it("shows starter showcase cards when the workspace has no apps yet", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
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
    expect(html).toContain("Blank Flow");
    expect(html).toContain("推荐 Starter");
    expect(html).toContain("打开 Starter 模板库");
  });

  it("hides member-admin entrypoints for editors without member permissions", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildEditorWorkspaceContext());
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowDetail).mockResolvedValue(null);
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

    expect(html).not.toContain('href="/admin/members"');
    expect(html).toContain("查看运行诊断");
    expect(html).toContain('href="/runs"');
  });
});
