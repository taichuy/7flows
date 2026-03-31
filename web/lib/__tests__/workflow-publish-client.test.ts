import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-client";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

describe("workflow publish client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the same-origin legacy auth governance proxy in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0 })
    } as Response);

    await getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot();

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/workflows/published-endpoints/legacy-auth-governance",
      {
        cache: "no-store"
      }
    );
  });
});
