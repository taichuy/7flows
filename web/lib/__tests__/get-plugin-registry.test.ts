import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPluginRegistryFetchOptions } from "@/lib/authoring-snapshot-cache";
import { getPluginRegistrySnapshot } from "../get-plugin-registry";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

describe("getPluginRegistrySnapshot", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reuses the shared snapshot cache policy for adapter and tool inventory", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);

    await getPluginRegistrySnapshot();

    expect(vi.mocked(global.fetch)).toHaveBeenNthCalledWith(
      1,
      "http://api.test/api/plugins/adapters",
      getPluginRegistryFetchOptions()
    );
    expect(vi.mocked(global.fetch)).toHaveBeenNthCalledWith(
      2,
      "http://api.test/api/plugins/tools",
      getPluginRegistryFetchOptions()
    );
  });

  it("uses the same-origin plugin registry proxies in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response);

    await getPluginRegistrySnapshot();

    expect(vi.mocked(global.fetch)).toHaveBeenNthCalledWith(
      1,
      "/api/plugins/adapters",
      getPluginRegistryFetchOptions()
    );
    expect(vi.mocked(global.fetch)).toHaveBeenNthCalledWith(
      2,
      "/api/plugins/tools",
      getPluginRegistryFetchOptions()
    );
  });
});
