import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkflows } from "@/lib/get-workflows";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

describe("getWorkflows", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests the unfiltered workflow inventory by default", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getWorkflows();

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://api.test/api/workflows",
      { cache: "no-store" }
    );
  });

  it("passes the workflow definition issue filter through to the API", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getWorkflows({
      definitionIssue: "legacy_publish_auth"
    });

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://api.test/api/workflows?definition_issue=legacy_publish_auth",
      { cache: "no-store" }
    );
  });

  it("supports the missing tool workflow definition issue filter", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getWorkflows({
      definitionIssue: "missing_tool"
    });

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://api.test/api/workflows?definition_issue=missing_tool",
      { cache: "no-store" }
    );
  });
});
