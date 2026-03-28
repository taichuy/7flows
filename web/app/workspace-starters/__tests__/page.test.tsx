import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceStarterPage from "@/app/workspace-starters/page";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getWorkflows } from "@/lib/get-workflows";
import { getWorkspaceStarterTemplatesWithFilters } from "@/lib/get-workspace-starters";
import type { WorkspaceContextResponse } from "@/lib/workspace-access";

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

vi.mock("@/components/workspace-starter-library", () => ({
  WorkspaceStarterLibrary: ({ initialTemplates }: { initialTemplates: Array<{ id: string }> }) =>
    createElement(
      "div",
      {
        "data-component": "workspace-starter-library",
        "data-count": initialTemplates.length
      },
      "starter-library"
    )
}));

vi.mock("@/components/workspace-starter-library/shared", () => ({
  resolveWorkspaceStarterLibraryViewState: vi.fn(() => ({
    activeTrack: "all",
    archiveFilter: "active",
    sourceGovernanceKind: "all",
    needsFollowUp: false,
    searchQuery: "",
    selectedTemplateId: null
  }))
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn()
}));

vi.mock("@/lib/get-workspace-starters", () => ({
  getWorkspaceStarterTemplatesWithFilters: vi.fn()
}));

vi.mock("@/lib/get-plugin-registry", () => ({
  getPluginRegistrySnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
  vi.mocked(getWorkspaceStarterTemplatesWithFilters).mockResolvedValue([
    { id: "starter-1" }
  ] as Awaited<ReturnType<typeof getWorkspaceStarterTemplatesWithFilters>>);
  vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
    tools: [],
    adapters: []
  } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>);
  vi.mocked(getWorkflows).mockResolvedValue([] as Awaited<ReturnType<typeof getWorkflows>>);
});

describe("WorkspaceStarterPage", () => {
  it("renders the starter library inside the workspace shell", async () => {
    const html = renderToStaticMarkup(
      await WorkspaceStarterPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-component="workspace-starter-library"');
    expect(html).toContain('data-count="1"');
  });

  it("redirects unauthenticated users back to login", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);

    await expect(
      WorkspaceStarterPage({
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/login?next=/workspace-starters");
  });
});
