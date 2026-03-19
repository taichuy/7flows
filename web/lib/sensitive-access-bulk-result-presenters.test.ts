import { describe, expect, it } from "vitest";

import {
  buildSensitiveAccessBulkResultNarrative,
  buildSensitiveAccessBulkRunSampleCards
} from "./sensitive-access-bulk-result-presenters";

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

  it("把 sampled run snapshot 转成可渲染的 focus evidence 卡片模型", () => {
    const cards = buildSensitiveAccessBulkRunSampleCards({
      action: "approved",
      status: "success",
      message: "fallback",
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      skippedReasonSummary: [],
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 0,
      runningRunCount: 1,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      blockerSampleCount: 0,
      blockerChangedCount: 0,
      blockerClearedCount: 0,
      blockerFullyClearedCount: 0,
      blockerStillBlockedCount: 0,
      sampledRuns: [
        {
          runId: "run-12345678",
          snapshot: {
            status: "running",
            currentNodeId: "tool-1",
            executionFocusNodeName: "Sandbox tool",
            executionFocusExplanation: {
              primary_signal: "执行阻断已解除。",
              follow_up: "继续观察后续节点。"
            },
            executionFocusArtifactCount: 2,
            executionFocusArtifactRefCount: 1,
            executionFocusToolCallCount: 3,
            executionFocusRawRefCount: 1,
            executionFocusArtifactRefs: ["artifact://focus-1"],
            executionFocusArtifacts: [
              {
                artifact_kind: "tool_result",
                content_type: "application/json",
                summary: "聚焦 tool 已产出结构化摘要。",
                uri: "artifact://focus-1"
              }
            ],
            executionFocusToolCalls: [
              {
                id: "tool-call-1",
                tool_id: "sandbox.search",
                tool_name: "Sandbox Search",
                phase: "execute",
                status: "completed",
                effective_execution_class: "sandbox",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_runner_kind: "tool",
                response_summary: "搜索结果已写入 artifact。",
                response_content_type: "application/json",
                raw_ref: "artifact://tool-call-raw"
              }
            ]
          }
        }
      ]
    });

    expect(cards).toEqual([
      {
        runId: "run-12345678",
        shortRunId: "run-1234",
        summary:
          "当前 run 状态：running。 当前节点：tool-1。 重点信号：执行阻断已解除。 后续动作：继续观察后续节点。 Sandbox tool 已关联 2 个 artifact、1 条 artifact ref、3 条 tool call。 其中 1 条 tool call 已落到 raw_ref，可直接回看原始输出。 样本 tool： Sandbox Search 状态 completed。 effective sandbox。 backend sandbox-default。 raw_ref artifact://tool-call-raw。 搜索结果已写入 artifact。",
        runStatus: "running",
        currentNodeId: "tool-1",
        focusNodeLabel: "Sandbox tool",
        waitingReason: null,
        artifactCount: 2,
        artifactRefCount: 1,
        toolCallCount: 3,
        rawRefCount: 1,
        skillReferenceCount: 0,
        skillReferencePhaseSummary: null,
        skillReferenceSourceSummary: null,
        focusArtifactSummary:
          "聚焦节点已沉淀 1 个 artifact（tool_result 1）。 run artifact refs 1 条。 至少 1 条 tool call 已把原始结果落到 raw_ref，可直接回看 sandbox / tool 输出。",
        focusToolCallSummaries: [
          {
            id: "tool-call-1",
            title: "Sandbox Search · completed",
            detail: "搜索结果已写入 artifact。",
            badges: [
              "phase execute",
              "effective sandbox",
              "backend sandbox-default",
              "runner tool",
              "content application/json",
              "raw payload"
            ],
            rawRef: "artifact://tool-call-raw"
          }
        ],
        focusArtifacts: [
          {
            key: "artifact://focus-1",
            artifactKind: "tool_result",
            contentType: "application/json",
            summary: "聚焦 tool 已产出结构化摘要。",
            uri: "artifact://focus-1"
          }
        ],
        focusSkillReferenceLoads: []
      }
    ]);
  });

  it("忽略没有任何结构化 focus evidence 的 sampled run", () => {
    const cards = buildSensitiveAccessBulkRunSampleCards({
      action: "retry",
      status: "success",
      message: "fallback",
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      skippedReasonSummary: [],
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 0,
      runningRunCount: 0,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      blockerSampleCount: 0,
      blockerChangedCount: 0,
      blockerClearedCount: 0,
      blockerFullyClearedCount: 0,
      blockerStillBlockedCount: 0,
      sampledRuns: [
        {
          runId: "run-empty",
          snapshot: null
        }
      ]
    });

    expect(cards).toEqual([]);
  });
});
