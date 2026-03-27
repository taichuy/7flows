import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidateOperatorFollowUpPaths } from "@/app/actions/operator-follow-up-revalidation";
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
  resolveCanonicalOperatorRunSnapshot: vi.fn((input?: {
    runId?: string | null;
    runSnapshot?: {
      workflow_id?: string | null;
      status?: string | null;
      current_node_id?: string | null;
      waiting_reason?: string | null;
    } | null;
    runFollowUp?: {
      sampled_runs?: Array<{
        run_id: string;
        snapshot?: {
          workflow_id?: string | null;
          status?: string | null;
          current_node_id?: string | null;
          waiting_reason?: string | null;
        } | null;
      }>;
    } | null;
  }) => {
    const direct = input?.runSnapshot;
    if (direct) {
      return {
        workflowId: direct.workflow_id ?? null,
        status: direct.status ?? null,
        currentNodeId: direct.current_node_id ?? null,
        waitingReason: direct.waiting_reason ?? null
      };
    }

    const samples = input?.runFollowUp?.sampled_runs ?? [];
    const fallback =
      samples.find((item) => item.run_id === input?.runId)?.snapshot ??
      samples.find((item) => item.snapshot != null)?.snapshot ??
      null;
    return fallback
      ? {
          workflowId: fallback.workflow_id ?? null,
          status: fallback.status ?? null,
          currentNodeId: fallback.current_node_id ?? null,
          waitingReason: fallback.waiting_reason ?? null
        }
      : null;
  }),
  normalizeOperatorRunFollowUp: vi.fn((summary?: {
    affected_run_count?: number;
    sampled_run_count?: number;
    waiting_run_count?: number;
    running_run_count?: number;
    succeeded_run_count?: number;
    failed_run_count?: number;
    unknown_run_count?: number;
    sampled_runs?: Array<{
      run_id: string;
      snapshot?: {
        workflow_id?: string | null;
        status?: string | null;
        current_node_id?: string | null;
        waiting_reason?: string | null;
      } | null;
    }>;
  } | null) =>
    summary
      ? {
          affectedRunCount: summary.affected_run_count ?? 0,
          sampledRunCount: summary.sampled_run_count ?? 0,
          waitingRunCount: summary.waiting_run_count ?? 0,
          runningRunCount: summary.running_run_count ?? 0,
          succeededRunCount: summary.succeeded_run_count ?? 0,
          failedRunCount: summary.failed_run_count ?? 0,
          unknownRunCount: summary.unknown_run_count ?? 0,
          sampledRuns: (summary.sampled_runs ?? []).map((item) => ({
            runId: item.run_id,
            snapshot: item.snapshot
              ? {
                  workflowId: item.snapshot.workflow_id ?? null,
                  status: item.snapshot.status ?? null,
                  currentNodeId: item.snapshot.current_node_id ?? null,
                  waitingReason: item.snapshot.waiting_reason ?? null
                }
              : null
          }))
        }
      : null),
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

  it("手动恢复优先消费后端 run_snapshot 与 run follow-up explanation", async () => {
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
        run_snapshot: {
          workflow_id: "wf-1",
          status: "running",
          current_node_id: "approval_gate",
          waiting_reason: null
        },
        callback_blocker_delta: {
          summary: "阻塞变化：external callback blocker 已清除。"
        },
        run_follow_up: {
          affected_run_count: 1,
          sampled_run_count: 1,
          waiting_run_count: 1,
          running_run_count: 0,
          succeeded_run_count: 0,
          failed_run_count: 0,
          unknown_run_count: 0,
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
            follow_up: "样本 run 已切到 approval pending，下一步应先处理审批再观察 resume。"
          },
          sampled_runs: [
            {
              run_id: "run-1",
              snapshot: {
                workflow_id: "wf-1",
                status: "waiting",
                current_node_id: "approval_gate",
                waiting_reason: "waiting approval"
              }
            }
          ]
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
    expect(result.message).not.toContain("当前 run 状态：running。");
    expect(result.runFollowUp).toEqual({
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 1,
      runningRunCount: 0,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      sampledRuns: [
        {
          runId: "run-1",
          snapshot: {
            workflowId: "wf-1",
            status: "waiting",
            currentNodeId: "approval_gate",
            waitingReason: "waiting approval"
          }
        }
      ]
    });
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-1"],
      workflowIds: ["wf-1"]
    });
  });

  it("手动恢复缺少 outcome explanation 时仍保留 canonical run follow-up", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        run: {
          workflow_id: "wf-1",
          status: "running",
          current_node_id: "review"
        },
        run_snapshot: {
          workflow_id: "wf-1",
          status: "running",
          current_node_id: "review",
          waiting_reason: null
        },
        callback_blocker_delta: {
          summary: "阻塞变化：external callback blocker 已清除。"
        },
        run_follow_up: {
          affected_run_count: 1,
          sampled_run_count: 1,
          waiting_run_count: 0,
          running_run_count: 1,
          succeeded_run_count: 0,
          failed_run_count: 0,
          unknown_run_count: 0,
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
            follow_up: "样本 run 已切到 review，下一步继续确认执行是否离开恢复事件。"
          },
          sampled_runs: [
            {
              run_id: "run-1",
              snapshot: {
                workflow_id: "wf-1",
                status: "running",
                current_node_id: "review",
                waiting_reason: null
              }
            }
          ]
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
    expect(result.message).toContain("已发起恢复尝试，run 已重新进入 running。");
    expect(result.message).toContain("阻塞变化：external callback blocker 已清除。");
    expect(result.message).toContain("本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。");
    expect(result.message).toContain("样本 run 已切到 review，下一步继续确认执行是否离开恢复事件。");
    expect(
      (result.message.match(/阻塞变化：external callback blocker 已清除。/g) ?? []).length
    ).toBe(1);
  });
});
