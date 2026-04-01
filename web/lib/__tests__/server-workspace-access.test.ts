import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn()
}));

import { cookies } from "next/headers";
import {
  getServerAuthSession,
  getServerWorkflowDetail,
  getServerWorkflowRuns,
} from "@/lib/server-workspace-access";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  CSRF_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME
} from "@/lib/workspace-access";

function buildCookieStore() {
  const items = [
    { name: ACCESS_TOKEN_COOKIE_NAME, value: "expired-access-token" },
    { name: REFRESH_TOKEN_COOKIE_NAME, value: "refresh-token" },
    { name: CSRF_TOKEN_COOKIE_NAME, value: "csrf-token" }
  ];

  return {
    get: (name: string) => items.find((item) => item.name === name),
    getAll: () => items
  };
}

describe("server workspace access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(cookies).mockResolvedValue(buildCookieStore() as Awaited<ReturnType<typeof cookies>>);
  });

  it("falls back to refresh when auth session fetch returns 401", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "expired" }), { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            csrf_token: "new-csrf-token",
            expires_at: "2026-04-01T00:00:00Z",
            access_expires_at: "2026-03-31T12:00:00Z",
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
              last_login_at: "2026-03-31T11:00:00Z"
            },
            current_member: {
              id: "member-owner",
              role: "owner",
              user: {
                id: "user-admin",
                email: "admin@taichuy.com",
                display_name: "7Flows Admin",
                status: "active",
                last_login_at: "2026-03-31T11:00:00Z"
              },
              created_at: "2026-03-31T11:00:00Z",
              updated_at: "2026-03-31T11:00:00Z"
            },
            available_roles: ["owner", "admin", "editor", "viewer"],
            cookie_contract: {
              access_token_cookie_name: ACCESS_TOKEN_COOKIE_NAME,
              refresh_token_cookie_name: REFRESH_TOKEN_COOKIE_NAME,
              csrf_token_cookie_name: CSRF_TOKEN_COOKIE_NAME,
              csrf_header_name: "X-CSRF-Token",
              same_site: "lax",
              secure: false,
              use_host_prefix: false,
              access_token_http_only: true,
              refresh_token_http_only: true,
              csrf_token_http_only: false
            },
            route_permissions: []
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            token_type: "bearer",
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
              last_login_at: "2026-03-31T11:00:00Z"
            },
            current_member: {
              id: "member-owner",
              role: "owner",
              user: {
                id: "user-admin",
                email: "admin@taichuy.com",
                display_name: "7Flows Admin",
                status: "active",
                last_login_at: "2026-03-31T11:00:00Z"
              },
              created_at: "2026-03-31T11:00:00Z",
              updated_at: "2026-03-31T11:00:00Z"
            },
            available_roles: ["owner", "admin", "editor", "viewer"],
            expires_at: "2026-04-01T00:00:00Z",
            cookie_contract: {
              access_token_cookie_name: ACCESS_TOKEN_COOKIE_NAME,
              refresh_token_cookie_name: REFRESH_TOKEN_COOKIE_NAME,
              csrf_token_cookie_name: CSRF_TOKEN_COOKIE_NAME,
              csrf_header_name: "X-CSRF-Token",
              same_site: "lax",
              secure: false,
              use_host_prefix: false,
              access_token_http_only: true,
              refresh_token_http_only: true,
              csrf_token_http_only: false
            },
            route_permissions: []
          }),
          { status: 200 }
        )
      );

    const session = await getServerAuthSession();

    expect(session?.current_user.email).toBe("admin@taichuy.com");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/auth/refresh");
  });

  it("forwards auth cookies and bearer token when loading workflow detail on the server", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "workflow-1",
          name: "Workflow 1",
          version: "0.1.0",
          status: "draft",
          created_at: "2026-03-31T10:00:00Z",
          updated_at: "2026-03-31T10:00:00Z",
          node_count: 1,
          tool_governance: {
            referenced_tool_ids: [],
            missing_tool_ids: [],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          },
          versions: [],
          definition: {}
        }),
        { status: 200 }
      )
    );

    const workflow = await getServerWorkflowDetail("workflow-1");

    expect(workflow?.id).toBe("workflow-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/workflows/workflow-1/detail");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer expired-access-token");
    expect(headers.get("Cookie")).toContain(
      `${ACCESS_TOKEN_COOKIE_NAME}=expired-access-token`
    );
    expect(headers.get("Cookie")).toContain(`${CSRF_TOKEN_COOKIE_NAME}=csrf-token`);
  });

  it("forwards auth cookies and bearer token when loading workflow runs on the server", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "run-1",
            workflow_id: "workflow-1",
            workflow_version: "0.1.0",
            status: "succeeded",
            created_at: "2026-03-31T10:00:00Z",
            node_run_count: 3,
            event_count: 12,
          },
        ]),
        { status: 200 }
      )
    );

    const runs = await getServerWorkflowRuns("workflow-1", 6);

    expect(runs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/workflows/workflow-1/runs?limit=6");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer expired-access-token");
    expect(headers.get("Cookie")).toContain(
      `${ACCESS_TOKEN_COOKIE_NAME}=expired-access-token`
    );
    expect(headers.get("Cookie")).toContain(`${CSRF_TOKEN_COOKIE_NAME}=csrf-token`);
  });
});
