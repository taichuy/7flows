import { describe, expect, it, vi } from "vitest";

import { submitWorkspaceMemberCreate } from "@/lib/workspace-member-admin";

const memberFixture = {
  id: "member-editor",
  role: "editor",
  user: {
    id: "user-editor",
    email: "editor-demo@taichuy.com",
    display_name: "Editor Demo",
    status: "active",
    last_login_at: null
  },
  invited_by_user_id: "user-admin",
  created_at: "2026-03-27T12:00:00Z",
  updated_at: "2026-03-27T12:00:00Z"
} as const;

describe("submitWorkspaceMemberCreate", () => {
  it("returns the created member when the proxy request succeeds", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => memberFixture
    })) as unknown as typeof fetch;

    const result = await submitWorkspaceMemberCreate(
      {
        email: "editor-demo@taichuy.com",
        display_name: "Editor Demo",
        password: "editor123",
        role: "editor"
      },
      fetchImpl
    );

    expect(fetchImpl).toHaveBeenCalledWith("/api/workspace/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: "editor-demo@taichuy.com",
        display_name: "Editor Demo",
        password: "editor123",
        role: "editor"
      })
    });
    expect(result).toEqual({
      status: "success",
      member: memberFixture
    });
  });

  it("returns api detail when the proxy rejects the request", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      json: async () => ({ detail: "该账号已经在当前工作空间中。" })
    })) as unknown as typeof fetch;

    const result = await submitWorkspaceMemberCreate(
      {
        email: "editor-demo@taichuy.com",
        display_name: "Editor Demo",
        password: "editor123",
        role: "editor"
      },
      fetchImpl
    );

    expect(result).toEqual({
      status: "error",
      message: "该账号已经在当前工作空间中。"
    });
  });

  it("returns a connectivity error when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await submitWorkspaceMemberCreate(
      {
        email: "editor-demo@taichuy.com",
        display_name: "Editor Demo",
        password: "editor123",
        role: "editor"
      },
      fetchImpl
    );

    expect(result).toEqual({
      status: "error",
      message: "创建成员失败，请确认工作空间代理接口已连接。"
    });
  });
});
