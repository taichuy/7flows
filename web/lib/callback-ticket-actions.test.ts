import { beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupRunCallbackTickets } from "@/app/actions/callback-tickets";
import {
  buildActionCallbackBlockerDeltaSummary,
  fetchScopedCallbackBlockerSnapshot
} from "@/app/actions/callback-blocker-action-summary";
import { revalidateOperatorFollowUpPaths } from "@/app/actions/operator-follow-up-revalidation";
import { fetchRunSnapshot } from "@/app/actions/run-snapshot";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

vi.mock("@/app/actions/operator-follow-up-revalidation", () => ({
  revalidateOperatorFollowUpPaths: vi.fn()
}));

vi.mock("@/app/actions/callback-blocker-action-summary", () => ({
  fetchScopedCallbackBlockerSnapshot: vi.fn(),
  buildActionCallbackBlockerDeltaSummary: vi.fn(
    ({ backendSummary }: { backendSummary?: string | null }) =>
      [backendSummary, "Automation 摘要：scheduler 已重新接管该 waiting run。"]
        .filter((item): item is string => Boolean(item && item.trim()))
        .join(" ")
  )
}));

vi.mock("@/app/actions/run-snapshot", () => ({
  fetchRunSnapshot: vi.fn(),
  normalizeOperatorRunSnapshot: vi.fn((snapshot?: {
    workflow_id?: string | null;
    status?: string | null;
    current_node_id?: string | null;
    waiting_reason?: string | null;
  } | null) =>
    snapshot
      ? {
          workflowId: snapshot.workflow_id ?? null,
          status: snapshot.status ?? null,
          currentNodeId: snapshot.current_node_id ?? null,
          waitingReason: snapshot.waiting_reason ?? null
        }
      : null)
}));

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("callback ticket actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("callback cleanup 优先消费后端 run_snapshot", async () => {
    vi.mocked(fetchRunSnapshot).mockResolvedValue({
      workflowId: "wf-cleanup",
      status: "waiting",
      currentNodeId: "approval_gate",
      waitingReason: "waiting callback"
    });
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        matched_count: 1,
        expired_count: 1,
        scheduled_resume_count: 1,
        terminated_count: 0,
        run_ids: ["run-cleanup"],
        callback_blocker_delta: {
          summary: "阻塞变化：已解除 waiting external callback。 建议动作已切换为“Handle approval here first”。"
        },
        run_snapshot: {
          workflow_id: "wf-cleanup",
          status: "running",
          current_node_id: "approval_gate",
          waiting_reason: null
        },
        outcome_explanation: {
          primary_signal: "本次 cleanup 已处理 1 条过期 callback ticket，并为 1 个 run 重新安排恢复。",
          follow_up: "下一步：继续观察 run 是否真正离开 waiting。"
        },
        run_follow_up: {
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
            follow_up: "样本 run 已离开 callback waiting。"
          }
        }
      })
    );

    const formData = new FormData();
    formData.set("runId", "run-cleanup");
    formData.set("nodeRunId", "node-run-cleanup");

    const result = await cleanupRunCallbackTickets(
      { status: "idle", message: "", scopeKey: "run-cleanup:node-run-cleanup" },
      formData
    );

    expect(result).toMatchObject({
      status: "success",
      scopeKey: "run-cleanup:node-run-cleanup"
    });
    expect(result.message).toContain("本次 cleanup 已处理 1 条过期 callback ticket");
    expect(result.message).toContain("下一步：继续观察 run 是否真正离开 waiting。");
    expect(result.message).toContain("本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。");
    expect(result.message).toContain("样本 run 已离开 callback waiting。");
    expect(result.message).toContain(
      "阻塞变化：已解除 waiting external callback。 建议动作已切换为“Handle approval here first”。 Automation 摘要：scheduler 已重新接管该 waiting run。"
    );
    expect(result.blockerDeltaSummary).toBe(
      "阻塞变化：已解除 waiting external callback。 建议动作已切换为“Handle approval here first”。 Automation 摘要：scheduler 已重新接管该 waiting run。"
    );
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(fetchScopedCallbackBlockerSnapshot).toHaveBeenNthCalledWith(1, {
      runId: "run-cleanup",
      nodeRunId: "node-run-cleanup"
    });
    expect(fetchScopedCallbackBlockerSnapshot).toHaveBeenNthCalledWith(2, {
      runId: "run-cleanup",
      nodeRunId: "node-run-cleanup"
    });
    expect(buildActionCallbackBlockerDeltaSummary).toHaveBeenCalledWith({
      backendSummary: "阻塞变化：已解除 waiting external callback。 建议动作已切换为“Handle approval here first”。",
      before: undefined,
      after: undefined
    });
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-cleanup"],
      workflowIds: ["wf-cleanup"]
    });
  });
});
