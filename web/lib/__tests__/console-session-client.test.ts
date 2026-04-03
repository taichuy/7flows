import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchConsoleApi,
  fetchConsoleApiPath
} from "@/lib/console-session-client";
import { CSRF_TOKEN_COOKIE_NAME, CSRF_TOKEN_HEADER_NAME } from "@/lib/workspace-access";

describe("fetchConsoleApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.SEVENFLOWS_API_URL;
  });

  it("refreshes once on 401 and retries with credentials and csrf", async () => {
    Object.defineProperty(globalThis, "document", {
      value: {
        cookie: `${CSRF_TOKEN_COOKIE_NAME}=csrf-demo-token`
      },
      configurable: true
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "expired" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await fetchConsoleApi(
      "/api/workspace/members",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role: "admin" })
      },
      {
        fetchImpl: fetchMock,
        redirectOnUnauthorized: false
      }
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/workspace/members");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/auth/refresh");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/workspace/members");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe("include");
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get(CSRF_TOKEN_HEADER_NAME)).toBe(
      "csrf-demo-token"
    );
  });

  it("uses the configured backend origin on the server when resolving console api paths", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await fetchConsoleApiPath("/api/workflows", { cache: "no-store" }, { fetchImpl: fetchMock });

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/workflows", {
      cache: "no-store"
    });
  });

  it("keeps browser calls on same-origin paths while preserving the refresh seam", async () => {
    vi.stubGlobal("window", {});
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await fetchConsoleApiPath(
      "/api/workflows",
      { cache: "no-store" },
      { fetchImpl: fetchMock, redirectOnUnauthorized: false }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workflows",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
  });
});
