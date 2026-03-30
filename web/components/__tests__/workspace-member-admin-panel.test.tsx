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
  it("renders the split member admin surfaces", () => {
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

    expect(html).toContain('data-component="workspace-member-admin-panel"');
    expect(html).toContain('data-component="workspace-member-admin-sidebar"');
    expect(html).toContain('data-component="workspace-member-admin-overview"');
    expect(html).toContain('data-component="workspace-member-roster"');
    expect(html).toContain('data-component="workspace-member-create-section"');
    expect(html).toContain('data-component="workspace-member-role-guide"');
    expect(html).toContain("返回工作台");
    expect(html).toContain("角色说明");
  });

  it("shows viewer-only create guidance when member management is disabled", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceMemberAdminPanel, {
        availableRoles: ["owner", "admin", "editor", "viewer"],
        canManageMembers: false,
        initialMembers: [
          {
            id: "member-viewer",
            role: "viewer",
            user: {
              id: "user-viewer",
              email: "viewer@taichuy.com",
              display_name: "Viewer",
              status: "active",
              last_login_at: null
            },
            created_at: "2026-03-27T12:00:00Z",
            updated_at: "2026-03-27T12:00:00Z"
          }
        ],
        workspaceName: "7Flows Workspace"
      })
    );

    expect(html).toContain("当前账号只有查看权限，无法新增成员。");
    expect(html).toContain("仅查看");
  });
});
