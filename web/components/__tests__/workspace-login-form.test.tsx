import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceLoginForm } from "@/components/workspace-login-form";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn()
  }),
  useSearchParams: () => ({
    get: () => null
  })
}));

describe("WorkspaceLoginForm", () => {
  it("renders the default admin credential card and login CTA", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceLoginForm));

    expect(html).toContain("本地默认管理员");
    expect(html).toContain("admin@taichuy.com");
    expect(html).toContain("admin123");
    expect(html).toContain("登录后将前往 应用工作台");
    expect(html).toContain("进入工作台");
  });
});
