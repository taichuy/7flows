import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewWorkflowPage from "@/app/workflows/new/page";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import { getWorkflows } from "@/lib/get-workflows";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  }
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "workspace-shell" }, children)
}));

vi.mock("@/components/workflow-create-wizard", () => ({
  WorkflowCreateWizard: ({ starters, workflows }: { starters: Array<{ id: string }>; workflows: Array<{ id: string }> }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-create-wizard",
        "data-starter-count": starters.length,
        "data-workflow-count": workflows.length
      },
      "wizard"
    )
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-workflow-publish", () => ({
  getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot: vi.fn()
}));

vi.mock("@/lib/workspace-starter-governance-query", () => ({
  hasScopedWorkspaceStarterGovernanceFilters: vi.fn(() => false),
  pickWorkspaceStarterGovernanceQueryScope: vi.fn(() => ({ kind: "all" })),
  readWorkspaceStarterLibraryViewState: vi.fn(() => ({
    activeTrack: "all",
    archiveFilter: "active",
    searchQuery: "",
    sourceGovernanceKind: "all",
    needsFollowUp: false,
    selectedTemplateId: null
  }))
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("NewWorkflowPage", () => {
  it("renders the create wizard inside the workspace shell", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue({
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
    });
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
      nodes: [],
      starters: [{ id: "starter-blank" }],
      starterSourceLanes: [],
      nodeSourceLanes: [],
      toolSourceLanes: [],
      tools: []
    } as unknown as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>);
    vi.mocked(getWorkflows).mockResolvedValue([{ id: "workflow-1" }] as Awaited<ReturnType<typeof getWorkflows>>);
    vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue({
      bindings: [],
      follow_up_count: 0,
      legacy_token_binding_count: 0,
      summary: []
    } as unknown as Awaited<ReturnType<typeof getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot>>);

    const html = renderToStaticMarkup(
      await NewWorkflowPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(vi.mocked(getWorkflowLibrarySnapshot)).toHaveBeenCalledWith(
      expect.objectContaining({ includeStarterDefinitions: true })
    );
    expect(
      vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot)
    ).not.toHaveBeenCalled();

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-component="workflow-create-wizard"');
    expect(html).toContain('data-starter-count="1"');
    expect(html).toContain('data-workflow-count="1"');
  });

  it("loads legacy auth governance only when a scoped starter is requested", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue({
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
    });
    const { readWorkspaceStarterLibraryViewState } = await import(
      "@/lib/workspace-starter-governance-query"
    );

    vi.mocked(readWorkspaceStarterLibraryViewState).mockReturnValue({
      activeTrack: "all",
      archiveFilter: "active",
      searchQuery: "",
      sourceGovernanceKind: "all",
      needsFollowUp: false,
      selectedTemplateId: "starter-workspace-1"
    });
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
      nodes: [],
      starters: [{ id: "starter-blank" }],
      starterSourceLanes: [],
      nodeSourceLanes: [],
      toolSourceLanes: [],
      tools: []
    } as unknown as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>);
    vi.mocked(getWorkflows).mockResolvedValue([] as Awaited<ReturnType<typeof getWorkflows>>);
    vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue({
      bindings: [],
      follow_up_count: 0,
      legacy_token_binding_count: 0,
      summary: []
    } as unknown as Awaited<ReturnType<typeof getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot>>);

    await NewWorkflowPage({
      searchParams: Promise.resolve({ starter: "starter-workspace-1" })
    });

    expect(
      vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot)
    ).toHaveBeenCalledTimes(1);
  });

  it("redirects unauthenticated users back to login", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);

    await expect(
      NewWorkflowPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/login?next=/workflows/new");
  });
});
