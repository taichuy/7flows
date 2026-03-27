import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";
import { getServerAuthSession } from "@/lib/server-workspace-access";

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

vi.mock("@/components/workspace-login-form", () => ({
  WorkspaceLoginForm: () => createElement("div", { "data-component": "workspace-login-form" }, "form")
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerAuthSession: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("LoginPage", () => {
  it("renders the workspace login shell when no session exists", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    const html = renderToStaticMarkup(await LoginPage());

    expect(html).toContain("像 Dify 一样先进工作空间");
    expect(html).toContain("登录 7Flows Workspace");
    expect(html).toContain('data-component="workspace-login-form"');
  });

  it("redirects to workspace when an auth session already exists", async () => {
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

    await expect(LoginPage()).rejects.toThrowError("redirect:/workspace");
  });
});
