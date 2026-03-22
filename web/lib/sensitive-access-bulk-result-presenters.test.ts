import { describe, expect, it } from "vitest";

import type { SensitiveAccessBulkActionResult } from "@/lib/get-sensitive-access";
import {
  buildSensitiveAccessBulkRecommendedNextStep,
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

  it("sampled run 已有 shared callback summary 时跳过重复的 bulk follow-up 文案", () => {
    const items = buildSensitiveAccessBulkResultNarrative({
      action: "retry",
      status: "success",
      message: "fallback",
      outcomeExplanation: {
        primary_signal: "已提交 1 条重试。",
        follow_up: "优先观察定时恢复是否已重新排队。"
      },
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
        follow_up: "优先观察定时恢复是否已重新排队。"
      },
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      skippedReasonSummary: [],
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 1,
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
          runId: "run-waiting-1",
          snapshot: {
            callbackWaitingExplanation: {
              primary_signal: "当前 waiting 节点仍在等待 callback。",
              follow_up: "优先观察定时恢复是否已重新排队。"
            },
            scheduledResumeDelaySeconds: 45,
            scheduledResumeSource: "runtime_retry",
            scheduledWaitingStatus: "waiting_callback"
          }
        }
      ]
    });

    expect(items).toEqual([
      { label: "Primary signal", text: "已提交 1 条重试。" },
      {
        label: "Run follow-up",
        text: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。"
      }
    ]);
  });

  it("已有稳定 recommended_action 时，不再把 follow_up 继续投影成 narrative next step", () => {
    const result: SensitiveAccessBulkActionResult = {
      action: "approved",
      status: "success",
      message: "fallback",
      runFollowUpExplanation: {
        primary_signal: "1 个 run 已切回 workflow library 治理。",
        follow_up: "先回到 workflow library 处理强隔离配置。"
      },
      runFollowUp: {
        affectedRunCount: 1,
        sampledRunCount: 0,
        waitingRunCount: 0,
        runningRunCount: 1,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        recommendedAction: {
          kind: "open_workflow_library",
          entryKey: "workflowLibrary",
          href: "/workflows?execution=sandbox",
          label: "Open workflow library"
        },
        sampledRuns: []
      },
      requestedCount: 1,
      updatedCount: 1,
      skippedCount: 0,
      skippedReasonSummary: [],
      affectedRunCount: 1,
      sampledRunCount: 0,
      waitingRunCount: 0,
      runningRunCount: 1,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      blockerSampleCount: 0,
      blockerChangedCount: 0,
      blockerClearedCount: 0,
      blockerFullyClearedCount: 0,
      blockerStillBlockedCount: 0
    };

    expect(buildSensitiveAccessBulkResultNarrative(result)).toEqual([
      { label: "Run follow-up", text: "1 个 run 已切回 workflow library 治理。" }
    ]);
    expect(buildSensitiveAccessBulkRecommendedNextStep(result)).toEqual({
      label: "open_workflow_library",
      detail: "先回到 workflow library 处理强隔离配置。",
      href: "/workflows?execution=sandbox",
      href_label: "Open workflow library"
    });
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

    expect(cards).toMatchObject([
      {
        runId: "run-12345678",
        shortRunId: "run-1234",
        hasCallbackWaitingSummary: false,
        summary:
          "当前 run 状态：running。 当前节点：tool-1。 重点信号：执行阻断已解除。 后续动作：继续观察后续节点。 Sandbox tool 已关联 2 个 artifact、1 条 artifact ref、3 条 tool call。 其中 1 条 tool call 已落到 raw_ref，可直接回看原始输出。 样本 tool： Sandbox Search 状态 completed。 effective sandbox。 backend sandbox-default。 raw_ref artifact://tool-call-raw。 搜索结果已写入 artifact。",
        runStatus: "running",
        currentNodeId: "tool-1",
        focusNodeId: null,
        focusNodeLabel: "Sandbox tool",
        focusNodeRunId: null,
        waitingReason: null,
        executionFactBadges: [
          "effective sandbox",
          "backend sandbox-default",
          "runner tool"
        ],
        callbackWaitingExplanation: null,
        callbackWaitingLifecycle: null,
        callbackWaitingFocusNodeEvidence: {
          artifact_refs: ["artifact://focus-1"],
          artifacts: [
            {
              id: "focus-artifact-0",
              run_id: "snapshot-run",
              node_run_id: null,
              artifact_kind: "tool_result",
              content_type: "application/json",
              summary: "聚焦 tool 已产出结构化摘要。",
              uri: "artifact://focus-1",
              metadata_payload: {},
              created_at: ""
            }
          ],
          tool_calls: [
            {
              id: "tool-call-1",
              run_id: "snapshot-run",
              node_run_id: "snapshot-node-run",
              tool_id: "sandbox.search",
              tool_name: "Sandbox Search",
              phase: "execute",
              status: "completed",
              request_summary: "",
              latency_ms: 0,
              retry_count: 0,
              created_at: "",
              requested_execution_class: null,
              requested_execution_source: null,
              requested_execution_profile: null,
              requested_execution_timeout_ms: null,
              requested_execution_network_policy: null,
              requested_execution_filesystem_policy: null,
              requested_execution_dependency_mode: null,
              requested_execution_builtin_package_set: null,
              requested_execution_dependency_ref: null,
              requested_execution_backend_extensions: null,
              effective_execution_class: "sandbox",
              execution_executor_ref: null,
              execution_sandbox_backend_id: "sandbox-default",
              execution_sandbox_backend_executor_ref: null,
              execution_sandbox_runner_kind: "tool",
              execution_blocking_reason: null,
              execution_fallback_reason: null,
              response_summary: "搜索结果已写入 artifact。",
              response_content_type: "application/json",
              response_meta: undefined,
              raw_ref: "artifact://tool-call-raw",
              error_message: null,
              finished_at: null
            }
          ]
        },
        scheduledResumeDelaySeconds: null,
        scheduledResumeSource: null,
        scheduledWaitingStatus: null,
        scheduledResumeScheduledAt: null,
        scheduledResumeDueAt: null,
        scheduledResumeRequeuedAt: null,
        scheduledResumeRequeueSource: null,
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

  it("保留只有 callback waiting facts 的 sampled run，供 bulk 结果页渲染 follow-up", () => {
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
      waitingRunCount: 1,
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
          runId: "run-waiting-1",
          snapshot: {
            callbackWaitingExplanation: {
              primary_signal: "当前 waiting 节点仍在等待 callback。",
              follow_up: "优先观察定时恢复是否已重新排队。"
            },
            scheduledResumeDelaySeconds: 45,
            scheduledResumeSource: "runtime_retry",
            scheduledWaitingStatus: "waiting_callback",
            scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
            scheduledResumeDueAt: "2026-03-20T10:00:45Z",
            scheduledResumeRequeuedAt: "2026-03-20T10:01:30Z",
            scheduledResumeRequeueSource: "waiting_resume_monitor"
          }
        }
      ]
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      runId: "run-waiting-1",
      shortRunId: "run-wait",
      hasCallbackWaitingSummary: true,
      callbackWaitingExplanation: {
        primary_signal: "当前 waiting 节点仍在等待 callback。",
        follow_up: "优先观察定时恢复是否已重新排队。"
      }
    });
    expect(cards[0]).toMatchObject({
      scheduledResumeDelaySeconds: 45,
      scheduledResumeSource: "runtime_retry",
      scheduledWaitingStatus: "waiting_callback",
      scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
      scheduledResumeDueAt: "2026-03-20T10:00:45Z",
      scheduledResumeRequeuedAt: "2026-03-20T10:01:30Z",
      scheduledResumeRequeueSource: "waiting_resume_monitor"
    });
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
