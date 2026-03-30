import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/(studio)/page";
import { getServerAuthSession } from "@/lib/server-workspace-access";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  }
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerAuthSession: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("HomePage", () => {
  it("redirects to login when no session exists", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    await expect(HomePage()).rejects.toThrowError("redirect:/login");
  });

  it("redirects to workspace when an auth session exists", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      token: "session-token",
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
      expires_at: "2026-04-01T00:00:00Z"
    });

    await expect(HomePage()).rejects.toThrowError("redirect:/workspace");
  });
});