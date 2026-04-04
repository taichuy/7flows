import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "@/app/login/page";
import { getServerAuthSession, getServerPublicAuthOptions } from "@/lib/server-workspace-access";

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
  WorkspaceLoginForm: ({ authOptions }: { authOptions: { recommended_method: string } }) =>
    createElement(
      "div",
      {
        "data-component": "workspace-login-form",
        "data-recommended-method": authOptions.recommended_method
      },
      "form"
    )
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerAuthSession: vi.fn(),
  getServerPublicAuthOptions: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerPublicAuthOptions).mockResolvedValue({
    provider: "builtin",
    recommended_method: "password",
    password: {
      enabled: true,
      reason: null
    },
    oidc_redirect: {
      enabled: false,
      reason: "当前认证 provider 不支持 OIDC 跳转登录。"
    }
  });
});

describe("LoginPage", () => {
  it("renders the builtin password shell when public auth options recommend password login", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    const html = renderToStaticMarkup(await LoginPage());
    const textContent = html.replace(/<[^>]+>/g, " ");
    const normalizedTextContent = textContent.replace(/\s+/g, " ").trim();
    const compactTextContent = normalizedTextContent.replace(/\s/g, "");

    expect(compactTextContent).toContain("7Flows");
    expect(normalizedTextContent).toContain("Workspace Sign In");
    expect(html).toContain('data-component="workspace-login-form"');
    expect(html).toContain('data-recommended-method="password"');
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
