import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateOperatorFollowUpPaths } from "@/app/actions/operator-follow-up-revalidation";
import { fetchRunSnapshot } from "@/app/actions/run-snapshot";
import { resumeRun } from "@/app/actions/runs";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getRunExecutionView } from "@/lib/get-run-views";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

vi.mock("@/app/actions/operator-follow-up-revalidation", () => ({
  revalidateOperatorFollowUpPaths: vi.fn()
}));

vi.mock("@/app/actions/run-snapshot", () => ({
  fetchRunSnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-run-views", () => ({
  getRunExecutionView: vi.fn()
}));

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("run actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(getRunExecutionView).mockResolvedValue(null);
    vi.mocked(getSystemOverview).mockResolvedValue(({
      callback_waiting_automation: {
        status: "disabled",
        scheduler_required: true,
        detail: "mock automation unavailable",
        scheduler_health_status: "unknown",
        scheduler_health_detail: "mock scheduler unavailable",
        steps: []
      }
    } as unknown) as Awaited<ReturnType<typeof getSystemOverview>>);
  });

  it("手动恢复优先消费后端 run follow-up explanation", async () => {
    vi.mocked(fetchRunSnapshot).mockResolvedValue({
      workflowId: "wf-1",
      status: "waiting",
      currentNodeId: "approval_gate",
      waitingReason: "waiting approval"
    });
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        run: {
          workflow_id: "wf-1",
          status: "waiting",
          current_node_id: "approval_gate"
        },
        outcome_explanation: {
          primary_signal: "已发起手动恢复。",
          follow_up: "runtime 已重新评估当前 waiting 链路。"
        },
        callback_blocker_delta: {
          summary: "阻塞变化：external callback blocker 已清除。"
        },
        run_follow_up: {
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
            follow_up: "样本 run 已切到 approval pending，下一步应先处理审批再观察 resume。"
          }
        }
      })
    );

    const formData = new FormData();
    formData.set("runId", "run-1");
    formData.set("nodeRunId", "node-run-1");

    const result = await resumeRun(
      { status: "idle", message: "", runId: "run-1" },
      formData
    );

    expect(result).toMatchObject({
      status: "success",
      runId: "run-1"
    });
    expect(result.message).toContain("已发起手动恢复。");
    expect(result.message).toContain("runtime 已重新评估当前 waiting 链路。");
    expect(result.message).toContain("阻塞变化：external callback blocker 已清除。");
    expect(result.message).toContain("本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。");
    expect(result.message).toContain("样本 run 已切到 approval pending，下一步应先处理审批再观察 resume。");
    expect(result.message).not.toContain("当前 run 状态：waiting。");
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-1"],
      workflowIds: ["wf-1"]
    });
  });
});
