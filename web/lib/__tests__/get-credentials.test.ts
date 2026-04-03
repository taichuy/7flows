import { afterEach, describe, expect, it, vi } from "vitest";

import { getCredentials } from "@/lib/get-credentials";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

describe("getCredentials", () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.SEVENFLOWS_API_URL;
  });

  it("uses the same-origin credentials proxy in loopback browsers", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
    vi.stubGlobal("window", {
      location: {
        origin: "http://127.0.0.1:3100"
      }
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getCredentials(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/credentials?include_revoked=true",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
  });

  it("keeps the configured backend origin on the server", async () => {
    process.env.NEXT_PUBLIC_API_URL = "http://api.test";
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getCredentials();

    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/credentials", {
      cache: "no-store"
    });
  });
});
