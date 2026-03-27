import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminMembersPage from "@/app/admin/members/page";
import {
  getServerWorkspaceContext,
  getServerWorkspaceMembers
} from "@/lib/server-workspace-access";

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

vi.mock("@/components/workspace-member-admin-panel", () => ({
  WorkspaceMemberAdminPanel: ({ workspaceName, initialMembers }: { workspaceName: string; initialMembers: Array<{ id: string }> }) =>
    createElement(
      "div",
      {
        "data-component": "workspace-member-admin-panel",
        "data-workspace": workspaceName,
        "data-count": initialMembers.length
      },
      workspaceName
    )
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn(),
  getServerWorkspaceMembers: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("AdminMembersPage", () => {
  it("renders the members admin shell for admins", async () => {
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
        last_login_at: "2026-03-27T12:00:00Z"
      },
      current_member: {
        id: "member-owner",
        role: "owner",
        user: {
          id: "user-admin",
          email: "admin@taichuy.com",
          display_name: "7Flows Admin",
          status: "active",
          last_login_at: "2026-03-27T12:00:00Z"
        },
        created_at: "2026-03-27T12:00:00Z",
        updated_at: "2026-03-27T12:00:00Z"
      },
      available_roles: ["owner", "admin", "editor", "viewer"],
      can_manage_members: true
    });
    vi.mocked(getServerWorkspaceMembers).mockResolvedValue([
      {
        id: "member-owner",
        role: "owner",
        user: {
          id: "user-admin",
          email: "admin@taichuy.com",
          display_name: "7Flows Admin",
          status: "active",
          last_login_at: "2026-03-27T12:00:00Z"
        },
        created_at: "2026-03-27T12:00:00Z",
        updated_at: "2026-03-27T12:00:00Z"
      }
    ]);

    const html = renderToStaticMarkup(await AdminMembersPage());

    expect(html).toContain('data-component="workspace-member-admin-panel"');
    expect(html).toContain('data-workspace="7Flows Workspace"');
    expect(html).toContain('data-count="1"');
  });

  it("redirects to login when session is missing", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);
    vi.mocked(getServerWorkspaceMembers).mockResolvedValue([]);

    await expect(AdminMembersPage()).rejects.toThrowError(
      "redirect:/login?next=/admin/members"
    );
  });
});
