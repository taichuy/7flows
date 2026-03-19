import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanupRunCallbackTickets
} from "@/app/actions/callback-tickets";
import { revalidateOperatorFollowUpPaths } from "@/app/actions/operator-follow-up-revalidation";
import { fetchRunSnapshot } from "@/app/actions/run-snapshot";
import { resumeRun } from "@/app/actions/runs";
import {
  fetchCallbackBlockerSnapshot,
  formatCallbackAutomationHealthDeltaSummary,
  formatCallbackBlockerDeltaSummary
} from "@/lib/callback-blocker-follow-up";
import { getSystemOverview } from "@/lib/get-system-overview";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

vi.mock("@/app/actions/operator-follow-up-revalidation", () => ({
  revalidateOperatorFollowUpPaths: vi.fn(),
  revalidateOperatorFollowUpByRunIds: vi.fn()
}));

vi.mock("@/app/actions/run-snapshot", () => ({
  fetchRunSnapshot: vi.fn(),
  fetchRunSnapshots: vi.fn(),
  normalizeOperatorRunSnapshot: vi.fn((snapshot?: Record<string, unknown> | null) =>
    snapshot
      ? {
          workflowId: snapshot.workflow_id ?? null,
          status: snapshot.status ?? null,
          currentNodeId: snapshot.current_node_id ?? null,
          waitingReason: snapshot.waiting_reason ?? null,
          executionFocusNodeId: snapshot.execution_focus_node_id ?? null,
          executionFocusExplanation: snapshot.execution_focus_explanation ?? null,
          callbackWaitingExplanation: snapshot.callback_waiting_explanation ?? null,
          executionFocusArtifactCount: snapshot.execution_focus_artifact_count ?? 0,
          executionFocusArtifactRefCount: snapshot.execution_focus_artifact_ref_count ?? 0,
          executionFocusToolCallCount: snapshot.execution_focus_tool_call_count ?? 0,
          executionFocusRawRefCount: snapshot.execution_focus_raw_ref_count ?? 0
        }
      : null)
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/callback-blocker-follow-up", () => ({
  fetchCallbackBlockerSnapshot: vi.fn(),
  formatCallbackAutomationHealthDeltaSummary: vi.fn(),
  formatCallbackBlockerDeltaSummary: vi.fn()
}));

function jsonResponse(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

describe("callback operator actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(getSystemOverview).mockResolvedValue({
      callback_waiting_automation: {
        enabled: true
      }
    } as never);
    vi.mocked(fetchCallbackBlockerSnapshot).mockResolvedValue({ stage: "sample" } as never);
    vi.mocked(formatCallbackAutomationHealthDeltaSummary).mockReturnValue(
      "自动化健康变化：scheduler 已重新接管该 waiting run。"
    );
    vi.mocked(formatCallbackBlockerDeltaSummary).mockReturnValue(
      "阻塞变化：已清理当前 slice 内的过期 callback ticket。"
    );
  });

  it("manual resume keeps canonical outcome and snapshot in returned state", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        outcome_explanation: {
          primary_signal: "已发起恢复尝试。",
          follow_up: "runtime 已重新接手当前 waiting 链路。"
        },
        callback_blocker_delta: {
          summary: "阻塞变化：已解除 callback waiting。"
        },
        run_follow_up: {
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
            follow_up: "run run-1：当前 run 状态：running。 当前节点：review。 重点信号：runtime 已继续推进。"
          }
        },
        run_snapshot: {
          workflow_id: "wf-1",
          status: "running",
          current_node_id: "review",
          execution_focus_node_id: "review",
          execution_focus_explanation: {
            primary_signal: "runtime 已继续推进。",
            follow_up: "继续观察后续节点。"
          },
          execution_focus_artifact_count: 1,
          execution_focus_tool_call_count: 1,
          execution_focus_raw_ref_count: 1
        }
      })
    );

    const formData = new FormData();
    formData.set("runId", "run-1");
    formData.set("nodeRunId", "node-run-1");
    formData.set("reason", "operator_manual_resume_attempt");

    const result = await resumeRun({ status: "idle", message: "", runId: "run-1" }, formData);

    expect(result).toMatchObject({
      status: "success",
      runId: "run-1",
      outcomeExplanation: {
        primary_signal: "已发起恢复尝试。",
        follow_up: "runtime 已重新接手当前 waiting 链路。"
      },
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
        follow_up: "run run-1：当前 run 状态：running。 当前节点：review。 重点信号：runtime 已继续推进。"
      },
      blockerDeltaSummary:
        "阻塞变化：已解除 callback waiting。 自动化健康变化：scheduler 已重新接管该 waiting run。"
    });
    expect(result.runSnapshot).toMatchObject({
      workflowId: "wf-1",
      status: "running",
      currentNodeId: "review",
      executionFocusArtifactCount: 1,
      executionFocusToolCallCount: 1,
      executionFocusRawRefCount: 1
    });
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-1"],
      workflowIds: ["wf-1"]
    });
  });

  it("callback cleanup keeps canonical follow-up evidence in returned state", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse({
        matched_count: 1,
        expired_count: 1,
        scheduled_resume_count: 1,
        terminated_count: 0,
        run_ids: ["run-1"],
        callback_blocker_delta: {
          summary: "阻塞变化：已清理当前 slice 内的过期 callback ticket。"
        },
        outcome_explanation: {
          primary_signal: "已处理过期 callback ticket。",
          follow_up: "后端已安排恢复，下一步观察 run 是否真正离开 waiting。"
        },
        run_follow_up: {
          explanation: {
            primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
            follow_up: "run run-1：当前 run 状态：waiting。 当前节点：review。 重点信号：等待原因：waiting callback"
          }
        },
        run_snapshot: {
          workflow_id: "wf-1",
          status: "waiting",
          current_node_id: "review",
          waiting_reason: "waiting callback",
          execution_focus_node_id: "review",
          callback_waiting_explanation: {
            primary_signal: "等待原因：waiting callback",
            follow_up: "继续观察恢复是否生效。"
          }
        }
      })
    );

    const formData = new FormData();
    formData.set("runId", "run-1");
    formData.set("nodeRunId", "node-run-1");

    const result = await cleanupRunCallbackTickets(
      { status: "idle", message: "", scopeKey: "run-1:node-run-1" },
      formData
    );

    expect(result).toMatchObject({
      status: "success",
      scopeKey: "run-1:node-run-1",
      outcomeExplanation: {
        primary_signal: "已处理过期 callback ticket。",
        follow_up: "后端已安排恢复，下一步观察 run 是否真正离开 waiting。"
      },
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
        follow_up: "run run-1：当前 run 状态：waiting。 当前节点：review。 重点信号：等待原因：waiting callback"
      },
      blockerDeltaSummary: "阻塞变化：已清理当前 slice 内的过期 callback ticket。"
    });
    expect(result.runSnapshot).toMatchObject({
      workflowId: "wf-1",
      status: "waiting",
      currentNodeId: "review",
      waitingReason: "waiting callback"
    });
    expect(fetchRunSnapshot).not.toHaveBeenCalled();
    expect(revalidateOperatorFollowUpPaths).toHaveBeenCalledWith({
      runIds: ["run-1"],
      workflowIds: ["wf-1"]
    });
  });
});
