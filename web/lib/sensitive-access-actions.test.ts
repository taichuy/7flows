import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkRetrySensitiveAccessNotificationDispatches,
  decideSensitiveAccessApprovalTicket
} from "@/app/actions/sensitive-access";
import {
  revalidateOperatorFollowUpByRunIds,
  revalidateOperatorFollowUpPaths
} from "@/app/actions/operator-follow-up-revalidation";
import { fetchRunSnapshot } from "@/app/actions/run-snapshot";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

vi.mock("@/app/actions/operator-follow-up-revalidation", () => ({
  revalidateOperatorFollowUpByRunIds: vi.fn(),
  revalidateOperatorFollowUpPaths: vi.fn()
}));

vi.mock("@/app/actions/run-snapshot", () => ({
  fetchRunSnapshot: vi.fn(),
  fetchRunSnapshots: vi.fn()
}));

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("sensitive access actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("单条审批直接消费后端 callback blocker delta 与 run snapshot", async () => {
    vi.mocked(fetchRunSnapshot).mockResolvedValue({
      status: "waiting",
      workflowId: "wf-fallback"
    });
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        outcome_explanation: {
          primary_signal: "审批已通过。",
          follow_up: "后端已把 waiting blocker 重新交回 runtime。"
        },
        callback_blocker_delta: {
          sampled_scope_count: 1,
          changed_scope_count: 1,
          cleared_scope_count: 1,
          fully_cleared_scope_count: 1,
          still_blocked_scope_count: 0,
          summary: "阻塞变化：已解除 approval pending。"
        },
        approval_ticket: {
          waiting_status: "resumed"
        },
        run_snapshot: {
          workflow_id: "wf-1",
          status: "running",
          current_node_id: "review",
          execution_focus_node_id: "review",
          execution_focus_explanation: {
            primary_signal: "runtime 已继续推进。",
            follow_up: "继续观察后续节点。"
          }
        }
      })
    );

    const formData = new FormData();
    formData.set("ticketId", "ticket-1");
    formData.set("runId", "run-1");
    formData.set("status", "approved");
    formData.set("approvedBy", "operator-1");

    const result = await decideSensitiveAccessApprovalTicket(
      { status: "idle", message: "", ticketId: "ticket-1" },
      formData
    );

    expect(result).toMatchObject({
      status: "success",
      ticketId: "ticket-1"
    });
    expect(result.message).toContain("审批已通过。");
    expect(result.message).toContain("后端已把 waiting blocker 重新交回 runtime。");
    expect(result.message).toContain("阻塞变化：已解除 approval pending。");
    expect(result.message).toContain("当前 run 状态：running。");
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-1"],
      workflowIds: ["wf-1"]
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("批量通知重试优先消费后端 blocker delta 与 run follow-up", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        requested_count: 1,
        retried_count: 1,
        skipped_count: 0,
        outcome_explanation: {
          primary_signal: "批量通知已重试。",
          follow_up: "继续等待审批人与 callback 后续推进。"
        },
        callback_blocker_delta: {
          sampled_scope_count: 1,
          changed_scope_count: 1,
          cleared_scope_count: 1,
          fully_cleared_scope_count: 0,
          still_blocked_scope_count: 1,
          summary: "已回读 1 个 blocker 样本；发生变化 1 个。"
        },
        retried_items: [
          {
            approval_ticket: {
              id: "ticket-1",
              run_id: "run-1",
              node_run_id: "node-run-1"
            }
          }
        ],
        skipped_reason_summary: [],
        run_follow_up: {
          affected_run_count: 1,
          sampled_run_count: 1,
          waiting_run_count: 1,
          running_run_count: 0,
          succeeded_run_count: 0,
          failed_run_count: 0,
          unknown_run_count: 0,
          sampled_runs: [
            {
              run_id: "run-1",
              snapshot: {
                workflow_id: "wf-1",
                status: "waiting",
                current_node_id: "review",
                execution_focus_explanation: {
                  primary_signal: "仍在等待审批结果。",
                  follow_up: "继续观察审批与 callback。"
                }
              }
            }
          ]
        }
      })
    );

    const result = await bulkRetrySensitiveAccessNotificationDispatches({
      dispatches: [
        {
          dispatchId: "dispatch-1",
          approvalTicketId: "ticket-1",
          runId: "run-1",
          nodeRunId: "node-run-1"
        }
      ]
    });

    expect(result).toMatchObject({
      action: "retry",
      status: "success",
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      blockerSampleCount: 1,
      blockerChangedCount: 1,
      blockerClearedCount: 1,
      blockerFullyClearedCount: 0,
      blockerStillBlockedCount: 1,
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 1
    });
    expect(result.message).toContain("批量通知已重试。");
    expect(result.message).toContain("继续等待审批人与 callback 后续推进。");
    expect(result.message).toContain("已回读 1 个 blocker 样本；发生变化 1 个。");
    expect(result.message).toContain("本次影响 1 个 run");
    expect(revalidateOperatorFollowUpByRunIds).toHaveBeenCalledWith(["run-1"]);
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
