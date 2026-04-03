import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTHORING_SNAPSHOT_TAGS,
  getWorkflowDetailFetchOptions,
  getWorkflowInventoryFetchOptions
} from "@/lib/authoring-snapshot-cache";
import {
  createWorkflow,
  getWorkflowDetail,
  getWorkflows,
  updateWorkflow,
  validateWorkflowDefinition
} from "@/lib/get-workflows";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: (options?: { browserMode?: "backend-direct" | "same-origin" }) =>
    options?.browserMode === "same-origin" && typeof window !== "undefined"
      ? ""
      : "http://api.test"
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
      getWorkflowInventoryFetchOptions()
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
      getWorkflowInventoryFetchOptions()
    );
  });

  it("uses the same-origin workflow proxy when loading inventory in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => []
    } as Response);

    await getWorkflows({
      definitionIssue: "legacy_publish_auth"
    });

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/workflows?definition_issue=legacy_publish_auth",
      expect.objectContaining({
        ...getWorkflowInventoryFetchOptions(),
        credentials: "include",
        headers: expect.any(Headers)
      })
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
      getWorkflowInventoryFetchOptions()
    );
  });

  it("loads workflow detail from the explicit detail endpoint", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "wf-1", definition: { nodes: [], edges: [] } })
    } as Response);

    await getWorkflowDetail("wf-1");

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://api.test/api/workflows/wf-1/detail",
      getWorkflowDetailFetchOptions("wf-1")
    );
  });

  it("uses the same-origin workflow proxy when loading detail in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "wf-1", definition: { nodes: [], edges: [] } })
    } as Response);

    await getWorkflowDetail("wf-1");

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/workflows/wf-1/detail",
      expect.objectContaining({
        ...getWorkflowDetailFetchOptions("wf-1"),
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
  });

  it("adds a per-workflow detail tag for repeat editor/publish navigation", () => {
    expect(getWorkflowDetailFetchOptions("wf-1")).toEqual({
      next: {
        revalidate: 5,
        tags: [
          AUTHORING_SNAPSHOT_TAGS.workflowInventory,
          `${AUTHORING_SNAPSHOT_TAGS.workflowDetail}:wf-1`
        ]
      }
    });
  });

  it("uses the same-origin workflow proxy when creating in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "wf-1" })
    } as Response);

    await createWorkflow({
      name: "Blank Workflow",
      definition: { nodes: [], edges: [] }
    });

    const requestInit = vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit;

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/workflows",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Blank Workflow",
          definition: { nodes: [], edges: [] }
        }),
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
    expect((requestInit.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("uses the same-origin workflow proxy when saving in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "wf-1" })
    } as Response);

    await updateWorkflow("wf-1", {
      name: "Blank Workflow",
      definition: { nodes: [], edges: [] }
    });

    const requestInit = vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit;

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/workflows/wf-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          name: "Blank Workflow",
          definition: { nodes: [], edges: [] }
        }),
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
    expect((requestInit.headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("uses the same-origin workflow proxy when validating in the browser", async () => {
    vi.stubGlobal("window", {});
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ definition: { nodes: [], edges: [] }, next_version: "v2", issues: [] })
    } as Response);

    await validateWorkflowDefinition("wf-1", { nodes: [], edges: [] });

    const requestInit = vi.mocked(global.fetch).mock.calls[0]?.[1] as RequestInit;

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "/api/workflows/wf-1/validate-definition",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          definition: { nodes: [], edges: [] }
        }),
        credentials: "include",
        headers: expect.any(Headers)
      })
    );
    expect((requestInit.headers as Headers).get("Content-Type")).toBe("application/json");
  });
});
