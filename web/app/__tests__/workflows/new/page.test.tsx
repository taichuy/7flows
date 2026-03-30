import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewWorkflowPage from "@/app/workflows/new/page";
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

vi.mock("@/components/workflow-create-wizard-entry", () => ({
  WorkflowCreateWizardEntry: ({
    bootstrapRequest
  }: {
    bootstrapRequest: {
      governanceQueryScope: { kind?: string };
      includeLegacyAuthGovernanceSnapshot: boolean;
      libraryQuery: {
        includeStarterDefinitions: boolean;
        includeBuiltinStarters: boolean;
      };
    };
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-create-wizard-entry",
        "data-governance-kind": bootstrapRequest.governanceQueryScope.kind ?? "unknown",
        "data-loads-legacy-auth": String(
          bootstrapRequest.includeLegacyAuthGovernanceSnapshot
        ),
        "data-include-starter-definitions": String(
          bootstrapRequest.libraryQuery.includeStarterDefinitions
        ),
        "data-include-builtin-starters": String(
          bootstrapRequest.libraryQuery.includeBuiltinStarters
        )
      },
      "wizard-entry"
    )
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn()
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
  it("renders the create bootstrap entry inside the workspace shell", async () => {
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

    const html = renderToStaticMarkup(
      await NewWorkflowPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-component="workflow-create-wizard-entry"');
    expect(html).toContain('data-loads-legacy-auth="false"');
    expect(html).toContain('data-include-starter-definitions="true"');
    expect(html).toContain('data-include-builtin-starters="true"');
  });

  it("marks legacy auth bootstrap only when a scoped starter is requested", async () => {
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

    const html = renderToStaticMarkup(
      await NewWorkflowPage({
      searchParams: Promise.resolve({ starter: "starter-workspace-1" })
      })
    );

    expect(html).toContain('data-loads-legacy-auth="true"');
    expect(html).toContain('data-include-builtin-starters="true"');
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
