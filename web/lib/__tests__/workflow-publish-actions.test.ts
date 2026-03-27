import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupLegacyPublishedEndpointBindings,
  updatePublishedEndpointLifecycle,
} from "@/app/actions/publish";

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function buildLifecycleFormData(nextStatus: "published" | "offline") {
  const formData = new FormData();
  formData.set("workflowId", "wf-1");
  formData.set("bindingId", "binding-1");
  formData.set("nextStatus", nextStatus);
  return formData;
}

function buildLegacyCleanupFormData(bindingIds: string[]) {
  const formData = new FormData();
  formData.set("workflowId", "wf-1");
  for (const bindingId of bindingIds) {
    formData.append("bindingId", bindingId);
  }
  return formData;
}

describe("workflow publish actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses shared lifecycle success feedback for publish transitions", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        endpoint_name: "Public Search",
        lifecycle_status: "published"
      })
    );

    const result = await updatePublishedEndpointLifecycle(
      {
        status: "idle",
        message: "",
        workflowId: "wf-1",
        bindingId: "binding-1",
        nextStatus: "published"
      },
      buildLifecycleFormData("published")
    );

    expect(result).toEqual({
      status: "success",
      message: "Public Search 已发布。",
      workflowId: "wf-1",
      bindingId: "binding-1",
      nextStatus: "published"
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/workflows/wf-1/published-endpoints/binding-1/lifecycle",
      expect.objectContaining({
        method: "PATCH",
        cache: "no-store"
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workflows/wf-1");
  });

  it("uses shared lifecycle fallback error feedback for offline transitions", async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse({}, 500));

    const result = await updatePublishedEndpointLifecycle(
      {
        status: "idle",
        message: "",
        workflowId: "wf-1",
        bindingId: "binding-1",
        nextStatus: "offline"
      },
      buildLifecycleFormData("offline")
    );

    expect(result).toEqual({
      status: "error",
      message: "下线 endpoint 失败。",
      workflowId: "wf-1",
      bindingId: "binding-1",
      nextStatus: "offline"
    });
  });

  it("uses shared lifecycle network feedback when the backend is unreachable", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("network down"));

    const result = await updatePublishedEndpointLifecycle(
      {
        status: "idle",
        message: "",
        workflowId: "wf-1",
        bindingId: "binding-1",
        nextStatus: "offline"
      },
      buildLifecycleFormData("offline")
    );

    expect(result).toEqual({
      status: "error",
      message: "无法连接后端下线 endpoint，请确认 API 已启动。",
      workflowId: "wf-1",
      bindingId: "binding-1",
      nextStatus: "offline"
    });
  });

  it("uses shared lifecycle validation feedback when binding fields are missing", async () => {
    const formData = new FormData();
    formData.set("workflowId", "wf-1");

    const result = await updatePublishedEndpointLifecycle(
      {
        status: "idle",
        message: "",
        workflowId: "",
        bindingId: "",
        nextStatus: "published"
      },
      formData
    );

    expect(result).toEqual({
      status: "error",
      message: "缺少发布 binding 信息，无法更新发布状态。",
      workflowId: "wf-1",
      bindingId: "",
      nextStatus: "published"
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses shared legacy cleanup success feedback and revalidates the workflow detail", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        requested_count: 2,
        updated_count: 1,
        skipped_count: 1,
        updated_binding_ids: ["binding-1"],
        skipped_items: [],
      })
    );

    const result = await cleanupLegacyPublishedEndpointBindings(
      {
        status: "idle",
        message: "",
        workflowId: "wf-1",
        bindingIds: ["binding-1", "binding-2"],
      },
      buildLegacyCleanupFormData(["binding-1", "binding-2"])
    );

    expect(result).toEqual({
      status: "success",
      message: "已批量下线 1 条 legacy auth draft binding；另外 1 条仍需逐项处理。",
      workflowId: "wf-1",
      bindingIds: ["binding-1", "binding-2"],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://api.test/api/workflows/wf-1/published-endpoints/legacy-auth-cleanup",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/workflows/wf-1");
  });

  it("uses shared legacy cleanup validation feedback when candidates are missing", async () => {
    const formData = new FormData();
    formData.set("workflowId", "wf-1");

    const result = await cleanupLegacyPublishedEndpointBindings(
      {
        status: "idle",
        message: "",
        workflowId: "wf-1",
        bindingIds: [],
      },
      formData
    );

    expect(result).toEqual({
      status: "error",
      message: "缺少可批量下线的 legacy auth draft binding。",
      workflowId: "wf-1",
      bindingIds: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
