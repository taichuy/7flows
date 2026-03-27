import { describe, expect, it } from "vitest";

import { canManageWorkspaceMembers, formatWorkspaceRole } from "@/lib/workspace-access";

describe("workspace-access helpers", () => {
  it("maps member roles to localized labels", () => {
    expect(formatWorkspaceRole("owner")).toBe("所有者");
    expect(formatWorkspaceRole("admin")).toBe("管理员");
    expect(formatWorkspaceRole("editor")).toBe("编辑者");
    expect(formatWorkspaceRole("viewer")).toBe("观察者");
  });

  it("only allows owner and admin to manage members", () => {
    expect(canManageWorkspaceMembers("owner")).toBe(true);
    expect(canManageWorkspaceMembers("admin")).toBe(true);
    expect(canManageWorkspaceMembers("editor")).toBe(false);
    expect(canManageWorkspaceMembers("viewer")).toBe(false);
  });
});
