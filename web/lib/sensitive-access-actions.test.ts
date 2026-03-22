import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkDecideSensitiveAccessApprovalTickets,
  bulkRetrySensitiveAccessNotificationDispatches,
  decideSensitiveAccessApprovalTicket,
  retrySensitiveAccessNotificationDispatch
} from "@/app/actions/sensitive-access";
import {
  revalidateOperatorFollowUpByRunIds,
  revalidateOperatorFollowUpPaths
} from "@/app/actions/operator-follow-up-revalidation";
import {
  buildActionCallbackBlockerDeltaSummary,
  fetchScopedCallbackBlockerSnapshot
} from "@/app/actions/callback-blocker-action-summary";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

vi.mock("@/app/actions/operator-follow-up-revalidation", () => ({
  revalidateOperatorFollowUpByRunIds: vi.fn(),
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
  fetchRunSnapshots: vi.fn(),
  resolveCanonicalOperatorRunSnapshot: vi.fn((input?: {
    runId?: string | null;
    runSnapshot?: {
      workflow_id?: string | null;
      status?: string | null;
      current_node_id?: string | null;
      waiting_reason?: string | null;
      execution_focus_reason?: string | null;
    } | null;
    runFollowUp?: {
      sampled_runs?: Array<{
        run_id: string;
        snapshot?: {
          workflow_id?: string | null;
          status?: string | null;
          current_node_id?: string | null;
          waiting_reason?: string | null;
          execution_focus_reason?: string | null;
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
        waitingReason: direct.waiting_reason ?? null,
        executionFocusReason: direct.execution_focus_reason ?? null
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
          waitingReason: fallback.waiting_reason ?? null,
          executionFocusReason: fallback.execution_focus_reason ?? null
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
        execution_focus_reason?: string | null;
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
                  waitingReason: item.snapshot.waiting_reason ?? null,
                  executionFocusReason: item.snapshot.execution_focus_reason ?? null
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
    execution_focus_reason?: string | null;
  } | null) =>
    snapshot
      ? {
          workflowId: snapshot.workflow_id ?? null,
          status: snapshot.status ?? null,
          currentNodeId: snapshot.current_node_id ?? null,
          waitingReason: snapshot.waiting_reason ?? null,
          executionFocusReason: snapshot.execution_focus_reason ?? null
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

describe("sensitive access actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("单条审批优先消费后端 run follow-up explanation", async () => {
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
            follow_up: "run run-1：当前 run 状态：running。 当前节点：review。 重点信号：runtime 已继续推进。"
          },
          sampled_runs: [
            {
              run_id: "run-1",
              snapshot: {
                workflow_id: "wf-1",
                status: "running",
                current_node_id: "review",
                execution_focus_reason: "blocking_node_run"
              }
            }
          ]
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
    formData.set("nodeRunId", "node-run-1");
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
    expect(result.outcomeExplanation).toEqual({
      primary_signal: "审批已通过。",
      follow_up: "后端已把 waiting blocker 重新交回 runtime。"
    });
    expect(result.runFollowUpExplanation).toEqual({
      primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
      follow_up: "run run-1：当前 run 状态：running。 当前节点：review。 重点信号：runtime 已继续推进。"
    });
    expect(result.runFollowUp).toEqual({
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 0,
      runningRunCount: 1,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      sampledRuns: [
        {
          runId: "run-1",
          snapshot: {
            workflowId: "wf-1",
            status: "running",
            currentNodeId: "review",
            waitingReason: null,
            executionFocusReason: "blocking_node_run"
          }
        }
      ]
    });
    expect(result.blockerDeltaSummary).toBe(
      "阻塞变化：已解除 approval pending。 Automation 摘要：scheduler 已重新接管该 waiting run。"
    );
    expect(result.runSnapshot).toMatchObject({
      workflowId: "wf-1",
      status: "running",
      currentNodeId: "review"
    });
    expect(result.message).toContain("审批已通过。");
    expect(result.message).toContain("后端已把 waiting blocker 重新交回 runtime。");
    expect(result.message).toContain(
      "阻塞变化：已解除 approval pending。 Automation 摘要：scheduler 已重新接管该 waiting run。"
    );
    expect(result.message).toContain("本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。");
    expect(result.message).toContain("run run-1：当前 run 状态：running。 当前节点：review。 重点信号：runtime 已继续推进。");
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-1"],
      workflowIds: ["wf-1"]
    });
    expect(fetchScopedCallbackBlockerSnapshot).toHaveBeenNthCalledWith(1, {
      runId: "run-1",
      nodeRunId: "node-run-1"
    });
    expect(fetchScopedCallbackBlockerSnapshot).toHaveBeenNthCalledWith(2, {
      runId: "run-1",
      nodeRunId: "node-run-1"
    });
    expect(buildActionCallbackBlockerDeltaSummary).toHaveBeenCalledWith({
      backendSummary: "阻塞变化：已解除 approval pending。",
      before: undefined,
      after: undefined
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
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
            follow_up: "run run-1：当前 run 状态：waiting。 当前节点：review。 重点信号：仍在等待审批结果。"
          },
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
    expect(result.message).toContain("本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。");
    expect(revalidateOperatorFollowUpByRunIds).toHaveBeenCalledWith(
      ["run-1"],
      expect.objectContaining({
        sampledRuns: expect.arrayContaining([
          expect.objectContaining({
            runId: "run-1",
            snapshot: {
              workflowId: "wf-1",
              status: "waiting",
              currentNodeId: "review",
              waitingReason: null,
              executionFocusReason: null
            },
            callbackTickets: [],
            sensitiveAccessEntries: []
          })
        ])
      })
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("单条通知重试优先消费后端 run follow-up explanation", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        outcome_explanation: {
          primary_signal: "通知已重新投递。",
          follow_up: "等待审批人与 callback 后续推进。"
        },
        callback_blocker_delta: {
          sampled_scope_count: 1,
          changed_scope_count: 1,
          cleared_scope_count: 0,
          fully_cleared_scope_count: 0,
          still_blocked_scope_count: 1,
          summary: "阻塞变化：仍有 1 个 operator blocker 需要审批。"
        },
        notification: {
          status: "pending",
          target: "ops@example.com"
        },
        approval_ticket: {
          waiting_status: "waiting"
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
            follow_up: "run run-1：当前 run 状态：waiting。 当前节点：review。 重点信号：仍在等待审批结果。"
          }
        },
        run_snapshot: {
          workflow_id: "wf-1",
          status: "waiting",
          current_node_id: "review",
          execution_focus_node_id: "review",
          execution_focus_explanation: {
            primary_signal: "仍在等待审批结果。",
            follow_up: "继续观察审批与 callback。"
          }
        }
      })
    );

    const formData = new FormData();
    formData.set("dispatchId", "dispatch-1");
    formData.set("runId", "run-1");
    formData.set("nodeRunId", "node-run-1");
    formData.set("target", "ops@example.com");

    const result = await retrySensitiveAccessNotificationDispatch(
      { status: "idle", message: "", dispatchId: "dispatch-1", target: "ops@example.com" },
      formData
    );

    expect(result).toMatchObject({
      status: "success",
      dispatchId: "dispatch-1",
      target: "ops@example.com"
    });
    expect(result.outcomeExplanation).toEqual({
      primary_signal: "通知已重新投递。",
      follow_up: "等待审批人与 callback 后续推进。"
    });
    expect(result.runFollowUpExplanation).toEqual({
      primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
      follow_up: "run run-1：当前 run 状态：waiting。 当前节点：review。 重点信号：仍在等待审批结果。"
    });
    expect(result.blockerDeltaSummary).toBe(
      "阻塞变化：仍有 1 个 operator blocker 需要审批。 Automation 摘要：scheduler 已重新接管该 waiting run。"
    );
    expect(result.runSnapshot).toMatchObject({
      workflowId: "wf-1",
      status: "waiting",
      currentNodeId: "review"
    });
    expect(result.message).toContain("通知已重新投递。");
    expect(result.message).toContain("等待审批人与 callback 后续推进。");
    expect(result.message).toContain(
      "阻塞变化：仍有 1 个 operator blocker 需要审批。 Automation 摘要：scheduler 已重新接管该 waiting run。"
    );
    expect(result.message).toContain("本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。");
    expect(result.message).toContain("run run-1：当前 run 状态：waiting。 当前节点：review。 重点信号：仍在等待审批结果。");
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-1"],
      workflowIds: ["wf-1"]
    });
    expect(fetchScopedCallbackBlockerSnapshot).toHaveBeenNthCalledWith(1, {
      runId: "run-1",
      nodeRunId: "node-run-1"
    });
    expect(fetchScopedCallbackBlockerSnapshot).toHaveBeenNthCalledWith(2, {
      runId: "run-1",
      nodeRunId: "node-run-1"
    });
    expect(buildActionCallbackBlockerDeltaSummary).toHaveBeenCalledWith({
      backendSummary: "阻塞变化：仍有 1 个 operator blocker 需要审批。",
      before: undefined,
      after: undefined
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("批量审批优先消费后端 blocker delta 与 run follow-up explanation", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        requested_count: 1,
        decided_count: 1,
        skipped_count: 0,
        outcome_explanation: {
          primary_signal: "批量审批已通过。",
          follow_up: "继续观察 waiting 与 callback 后续推进。"
        },
        callback_blocker_delta: {
          sampled_scope_count: 1,
          changed_scope_count: 1,
          cleared_scope_count: 1,
          fully_cleared_scope_count: 1,
          still_blocked_scope_count: 0,
          summary: "已回读 1 个 blocker 样本；发生变化 1 个。"
        },
        decided_items: [
          {
            id: "ticket-1",
            run_id: "run-1",
            node_run_id: "node-run-1"
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
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
            follow_up: "run run-1：当前 run 状态：waiting。 当前节点：review。 重点信号：等待原因：waiting approval"
          },
          sampled_runs: [
            {
              run_id: "run-1",
              snapshot: {
                workflow_id: "wf-1",
                status: "waiting",
                current_node_id: "review",
                execution_focus_explanation: {
                  primary_signal: "等待原因：waiting approval",
                  follow_up: "继续观察 runtime 是否恢复。"
                }
              }
            }
          ]
        }
      })
    );

    const result = await bulkDecideSensitiveAccessApprovalTickets({
      tickets: [
        {
          ticketId: "ticket-1",
          runId: "run-1",
          nodeRunId: "node-run-1"
        }
      ],
      status: "approved",
      approvedBy: "operator-1"
    });

    expect(result).toMatchObject({
      action: "approved",
      status: "success",
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      blockerSampleCount: 1,
      blockerChangedCount: 1,
      blockerClearedCount: 1,
      blockerFullyClearedCount: 1,
      blockerStillBlockedCount: 0,
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 1
    });
    expect(result.message).toContain("批量审批已通过。");
    expect(result.message).toContain("继续观察 waiting 与 callback 后续推进。");
    expect(result.message).toContain("已回读 1 个 blocker 样本；发生变化 1 个。");
    expect(result.message).toContain("本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。");
    expect(revalidateOperatorFollowUpByRunIds).toHaveBeenCalledWith(
      ["run-1"],
      expect.objectContaining({
        sampledRuns: expect.arrayContaining([
          expect.objectContaining({
            runId: "run-1",
            snapshot: {
              workflowId: "wf-1",
              status: "waiting",
              currentNodeId: "review",
              waitingReason: null,
              executionFocusReason: null
            },
            callbackTickets: [],
            sensitiveAccessEntries: []
          })
        ])
      })
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
