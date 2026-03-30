import * as React from "react";
import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowsPage from "@/app/workflows/page";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getWorkflows } from "@/lib/get-workflows";
import type { WorkspaceContextResponse } from "@/lib/workspace-access";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  }
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "workspace-shell" }, children)
}));

vi.mock("@/components/workflow-chip-link", () => ({
  WorkflowChipLink: ({ workflow, href }: { workflow: { id: string; name: string }; href: string }) =>
    createElement(
      "a",
      {
        href,
        "data-component": "workflow-chip-link",
        "data-workflow-id": workflow.id
      },
      workflow.name
    )
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

vi.mock("@/lib/get-workflow-publish", () => ({
  getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot: vi.fn()
}));

function buildWorkspaceContext(): WorkspaceContextResponse {
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
      id: "member-owner",
      role: "owner",
      user: {
        id: "user-admin",
        email: "admin@taichuy.com",
        display_name: "7Flows Admin",
        status: "active",
        last_login_at: "2026-03-28T09:00:00Z"
      },
      created_at: "2026-03-27T12:00:00Z",
      updated_at: "2026-03-27T12:00:00Z"
    },
    available_roles: ["owner", "admin", "editor", "viewer"],
    can_manage_members: true
  };
}

function buildWorkflowLibrarySnapshot(
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

function buildWorkflow(
  overrides: Partial<NonNullable<Awaited<ReturnType<typeof getWorkflows>>>[number]> = {}
) {
  return {
    id: "workflow-1",
    name: "Alpha workflow",
    version: "1.0.0",
    status: "draft",
    node_count: 4,
    legacy_auth_governance: {
      binding_count: 0,
      draft_candidate_count: 0,
      published_blocker_count: 0,
      offline_inventory_count: 0
    },
    tool_governance: {
      referenced_tool_ids: [],
      missing_tool_ids: [],
      governed_tool_count: 0,
      strong_isolation_tool_count: 0
    },
    ...overrides
  } as NonNullable<Awaited<ReturnType<typeof getWorkflows>>>[number];
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
  vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
  vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue({
    bindings: [],
    workflows: [],
    follow_up_count: 0,
    legacy_token_binding_count: 0,
    summary: []
  } as unknown as Awaited<
    ReturnType<typeof getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot>
  >);
});

describe("WorkflowsPage", () => {
  it("renders current workflow list counts and governance-scoped links", async () => {
    vi.mocked(getWorkflows).mockResolvedValue([
      buildWorkflow({
        tool_governance: {
          referenced_tool_ids: ["tool-1"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      }),
      buildWorkflow({
        id: "workflow-2",
        name: "Legacy workflow",
        status: "published",
        legacy_auth_governance: {
          binding_count: 2,
          draft_candidate_count: 1,
          published_blocker_count: 1,
          offline_inventory_count: 0
        }
      })
    ]);

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain("应用工作台");
    expect(html).toContain("全部应用 (2)");
    expect(html).toContain("Legacy auth (1)");
    expect(html).toContain("Catalog gap (1)");
    expect(html).toContain('href="/workflows/new"');
    expect(html).toContain('href="/workspace-starters"');
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
    expect(html).toContain(
      'href="/workflows/workflow-2?definition_issue=legacy_publish_auth"'
    );
  });

  it("requests filtered workflows when a definition issue filter is active", async () => {
    vi.mocked(getWorkflows)
      .mockResolvedValueOnce([
        buildWorkflow({
          tool_governance: {
            referenced_tool_ids: ["tool-1"],
            missing_tool_ids: ["tool-missing"],
            governed_tool_count: 1,
            strong_isolation_tool_count: 0
          }
        }),
        buildWorkflow({ id: "workflow-clean", name: "Clean workflow" })
      ])
      .mockResolvedValueOnce([
        buildWorkflow({
          tool_governance: {
            referenced_tool_ids: ["tool-1"],
            missing_tool_ids: ["tool-missing"],
            governed_tool_count: 1,
            strong_isolation_tool_count: 0
          }
        })
      ]);

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({ definition_issue: "missing_tool" })
      })
    );

    expect(getWorkflows).toHaveBeenNthCalledWith(1);
    expect(getWorkflows).toHaveBeenNthCalledWith(2, {
      definitionIssue: "missing_tool"
    });
    expect(html).toContain("Catalog gap (1)");
    expect(html).toContain('href="/workflows?definition_issue=missing_tool"');
    expect(html).toContain("Alpha workflow");
    expect(html).not.toContain("Clean workflow");
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
  });

  it("preserves starter scope across action, filter and detail links", async () => {
    vi.mocked(getWorkflows).mockResolvedValue([
      buildWorkflow({
        tool_governance: {
          referenced_tool_ids: ["tool-1"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      })
    ]);

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({
          starter: "starter-openclaw",
          track: "应用新建编排"
        })
      })
    );

    expect(html).toContain(
      'href="/workflows/new?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"'
    );
    expect(html).toContain(
      'href="/workspace-starters?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"'
    );
    expect(html).toContain(
      'href="/workflows?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool"'
    );
    expect(html).toContain(
      'href="/workflows/workflow-1?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool"'
    );
  });

  it("renders the current empty state and keeps scoped create links", async () => {
    vi.mocked(getWorkflows).mockResolvedValue([]);

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({
          starter: "starter-openclaw",
          track: "应用新建编排"
        })
      })
    );

    expect(html).toContain("当前还没有可编辑的 workflow。");
    expect(html).toContain(
      'href="/workflows/new?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"'
    );
    expect(html).toContain("创建应用");
    expect(html).toContain("全部应用 (0)");
    expect(html).toContain("Legacy auth (0)");
    expect(html).toContain("Catalog gap (0)");
  });
});
