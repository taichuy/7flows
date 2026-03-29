import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceMemberAdminPanel } from "@/components/workspace-member-admin-panel";

Object.assign(globalThis, { React });

vi.mock("@/lib/workspace-member-admin", () => ({
  submitWorkspaceMemberCreate: vi.fn()
}));

describe("WorkspaceMemberAdminPanel", () => {
  it("renders the compact workspace member settings shell", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceMemberAdminPanel, {
        availableRoles: ["owner", "admin", "editor", "viewer"],
        canManageMembers: true,
        initialMembers: [
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
        ],
        workspaceName: "7Flows Workspace"
      })
    );

    expect(html).toContain("成员与角色");
    expect(html).toContain("7Flows Workspace");
    expect(html).toContain("成员列表");
    expect(html).toContain("新增成员");
    expect(html).toContain("添加成员");
  });
});
