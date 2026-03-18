import { describe, expect, it } from "vitest";

import {
  formatBulkOperatorOutcomeExplanationMessage,
  formatCleanupResultMessage,
  formatOperatorOutcomeExplanationMessage
} from "@/lib/operator-action-result-presenters";

describe("operator-action-result-presenters", () => {
  it("single run snapshot 优先展示 backend execution focus explanation", () => {
    const message = formatOperatorOutcomeExplanationMessage({
      explanation: {
        primary_signal: "审批已通过，对应 waiting 链路已交回 runtime 恢复。",
        follow_up: "如果 run 仍停在 waiting，请继续检查 callback 到达情况或定时恢复链路。"
      },
      runSnapshot: {
        status: "waiting",
        currentNodeId: "mock_tool",
        waitingReason: "waiting approval",
        executionFocusNodeId: "mock_tool",
        executionFocusExplanation: {
          primary_signal: "等待原因：waiting approval",
          follow_up: "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
        }
      },
      fallback: "fallback"
    });

    expect(message).toContain("审批已通过，对应 waiting 链路已交回 runtime 恢复。");
    expect(message).toContain("重点信号：等待原因：waiting approval");
    expect(message).toContain(
      "后续动作：下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
    );
    expect(message).not.toContain("waiting reason：waiting approval");
  });

  it("bulk sampled runs 优先展示每个样本的 backend execution focus explanation", () => {
    const message = formatBulkOperatorOutcomeExplanationMessage({
      explanation: {
        primary_signal: "本次已批准 1 条审批票据，并把对应 waiting 链路交回 runtime 恢复。",
        follow_up: "后续请继续回看对应 run detail / inbox slice，确认 waiting 是否真正继续前进。"
      },
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
        follow_up:
          "run run-12345678：当前 run 状态：waiting。 当前节点：mock_tool。 重点信号：等待原因：waiting approval"
      },
      affectedRunCount: 1,
      sampledRuns: [
        {
          runId: "run-12345678",
          snapshot: {
            status: "waiting",
            currentNodeId: "mock_tool",
            waitingReason: "waiting approval",
            executionFocusNodeId: "mock_tool",
            executionFocusExplanation: {
              primary_signal: "等待原因：waiting approval",
              follow_up:
                "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
            }
          }
        }
      ],
      fallback: "fallback"
    });

    expect(message).toContain("本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。");
    expect(message).toContain("run run-12345678：当前 run 状态：waiting。");
    expect(message).toContain("重点信号：等待原因：waiting approval");
    expect(message).not.toContain("waiting reason：waiting approval");
  });

  it("callback cleanup 结果优先展示 backend run follow-up explanation", () => {
    const message = formatCleanupResultMessage({
      matchedCount: 1,
      expiredCount: 1,
      scheduledResumeCount: 1,
      terminatedCount: 0,
      blockerDeltaSummary: "阻塞变化：已解除 waiting external callback。",
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；当前仍有 1 个 run 处于 waiting。",
        follow_up: "样本 run 已切到 approval pending，下一步应先处理审批再观察 resume。"
      },
      runSnapshot: {
        status: "waiting",
        waitingReason: "waiting approval"
      }
    });

    expect(message).toContain("本次影响 1 个 run；当前仍有 1 个 run 处于 waiting。");
    expect(message).toContain("样本 run 已切到 approval pending，下一步应先处理审批再观察 resume。");
    expect(message).toContain("阻塞变化：已解除 waiting external callback。");
  });
});
