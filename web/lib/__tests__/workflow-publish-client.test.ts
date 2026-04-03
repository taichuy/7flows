import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildPublishedEndpointInvocationExportUrl,
  getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  getWorkflowPublishedEndpoints
} from "@/lib/workflow-publish-client";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: (options?: { browserMode?: "backend-direct" | "same-origin" }) =>
    options?.browserMode === "same-origin" && typeof window !== "undefined"
      ? ""
      : "http://api.test"
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
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
  });

  it("keeps SSR published endpoint inventory on the direct backend base", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getWorkflowPublishedEndpoints("wf-1");

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://api.test/api/workflows/wf-1/published-endpoints?include_all_versions=true",
      {
        cache: "no-store"
      }
    );
  });

  it("uses the same-origin published endpoint inventory proxy in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getWorkflowPublishedEndpoints("wf-1");

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/workflows/wf-1/published-endpoints?include_all_versions=true",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
  });

  it("builds browser export URLs on the same-origin API gateway seam", () => {
    vi.stubGlobal("window", {});

    expect(
      buildPublishedEndpointInvocationExportUrl("wf-1", "binding-1", { status: "succeeded" }, "jsonl")
    ).toBe(
      "/api/workflows/wf-1/published-endpoints/binding-1/invocations/export?limit=200&status=succeeded&format=jsonl"
    );
  });
});
