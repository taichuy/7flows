import { describe, expect, it } from "vitest";

import { buildSensitiveAccessBulkResultNarrative } from "./sensitive-access-bulk-result-presenters";

describe("buildSensitiveAccessBulkResultNarrative", () => {
  it("优先暴露后端 canonical explanation 与 run follow-up", () => {
    const items = buildSensitiveAccessBulkResultNarrative({
      action: "approved",
      status: "success",
      message: "fallback",
      outcomeExplanation: {
        primary_signal: "已批准 2 张票据。",
        follow_up: "其余票据仍保持等待。"
      },
      runFollowUpExplanation: {
        primary_signal: "2 个 run 已恢复推进。",
        follow_up: "剩余 waiting run 仍可在 inbox 中继续跟踪。"
      },
      blockerDeltaSummary: "1 个 blocker 已清除。",
      requestedCount: 2,
      updatedCount: 2,
      skippedCount: 0,
      skippedReasonSummary: [],
      affectedRunCount: 2,
      sampledRunCount: 1,
      waitingRunCount: 0,
      runningRunCount: 1,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      blockerSampleCount: 1,
      blockerChangedCount: 1,
      blockerClearedCount: 1,
      blockerFullyClearedCount: 1,
      blockerStillBlockedCount: 0,
      sampledRuns: [
        {
          runId: "run-12345678",
          snapshot: {
            status: "running",
            currentNodeId: "tool-1",
            executionFocusExplanation: {
              primary_signal: "执行阻断已解除。",
              follow_up: "继续观察后续节点。"
            }
          }
        }
      ]
    });

    expect(items).toEqual([
      { label: "Primary signal", text: "已批准 2 张票据。" },
      { label: "Follow-up", text: "其余票据仍保持等待。" },
      { label: "Blocker delta", text: "1 个 blocker 已清除。" },
      { label: "Run follow-up", text: "2 个 run 已恢复推进。" },
      { label: "Next step", text: "剩余 waiting run 仍可在 inbox 中继续跟踪。" },
      {
        label: "Run run-1234",
        text: "当前 run 状态：running。 当前节点：tool-1。 重点信号：执行阻断已解除。 后续动作：继续观察后续节点。"
      }
    ]);
  });

  it("没有结构化解释时不输出无意义条目", () => {
    const items = buildSensitiveAccessBulkResultNarrative({
      action: "retry",
      status: "success",
      message: "fallback",
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      skippedReasonSummary: [],
      affectedRunCount: 0,
      sampledRunCount: 0,
      waitingRunCount: 0,
      runningRunCount: 0,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      blockerSampleCount: 0,
      blockerChangedCount: 0,
      blockerClearedCount: 0,
      blockerFullyClearedCount: 0,
      blockerStillBlockedCount: 0
    });

    expect(items).toEqual([]);
  });
});
