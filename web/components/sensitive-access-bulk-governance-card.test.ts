import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  getSensitiveAccessBulkActionConfirmationMessage,
  SensitiveAccessBulkGovernanceCard
} from "@/components/sensitive-access-bulk-governance-card";
import type { SensitiveAccessBulkActionResult } from "@/lib/get-sensitive-access";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

function buildLegacyAuthGovernanceSnapshot() {
  return buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
    binding: {
      workflow_id: "wf-demo",
      workflow_name: "Demo Workflow",
      binding_id: "binding-demo",
      endpoint_id: "endpoint-demo",
      endpoint_name: "Demo Endpoint",
      workflow_version: "v1",
    },
  });
}

let mockPathname = "/sensitive-access";
let mockSearchParams = "";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearchParams)
}));

describe("SensitiveAccessBulkGovernanceCard", () => {
  it("clarifies current scope versus actionable subsets in the bulk summary", () => {
    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBulkGovernanceCard, {
        inScopeCount: 5,
        decisionCandidateCount: 2,
        retryCandidateCount: 1,
        operatorValue: "ops-reviewer",
        onOperatorChange: () => {},
        isMutating: false,
        lastResult: null,
        message: null,
        messageTone: "idle",
        onAction: () => {}
      })
    );

    expect(html).toContain("5 in scope");
    expect(html).toContain("approve/reject pending+waiting 2 / 5");
    expect(html).toContain("retry latest pending/failed 1 / 5");
    expect(html).toContain(
      "当前筛选范围命中 5 条票据；其中 2 条 pending + waiting 票据可执行 approve / reject，1 条最新且仍未投递成功的通知可执行 retry。"
    );
  });

  it("uses confirmation copy that distinguishes in-scope entries from actionable entries", () => {
    expect(getSensitiveAccessBulkActionConfirmationMessage("approved", 2, 5)).toBe(
      "确认批量批准当前筛选范围内可执行的 2 / 5 条 pending + waiting 票据吗？"
    );
    expect(getSensitiveAccessBulkActionConfirmationMessage("rejected", 2, 5)).toBe(
      "确认批量拒绝当前筛选范围内可执行的 2 / 5 条 pending + waiting 票据吗？"
    );
    expect(getSensitiveAccessBulkActionConfirmationMessage("retry", 1, 5)).toBe(
      "确认批量重试当前筛选范围内可执行的 1 / 5 条最新且仍未投递成功的通知吗？"
    );
  });

  it("renders callback waiting follow-up from compact sampled run snapshots", () => {
    const lastResult: SensitiveAccessBulkActionResult = {
      action: "retry",
      status: "success",
      message: "批量重试已提交。",
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
            executionFocusNodeId: "callback-node",
            executionFocusNodeName: "Callback node",
            executionFocusNodeRunId: "node-run-1",
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
            scheduledResumeRequeueSource: "waiting_resume_monitor",
            executionFocusArtifactCount: 1,
            executionFocusArtifactRefCount: 1,
            executionFocusToolCallCount: 1,
            executionFocusArtifactRefs: ["artifact://callback-artifact"],
            executionFocusToolCalls: [
              {
                id: "tool-call-1",
                tool_id: "callback.fetch",
                tool_name: "Callback Fetch",
                phase: "execute",
                status: "completed",
                effective_execution_class: "sandbox",
                execution_executor_ref: "tool:compat-adapter:dify-default",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_runner_kind: "tool",
                response_summary: "callback payload 已写入 artifact",
                raw_ref: "artifact://callback-tool-raw"
              }
            ],
            executionFocusSkillTrace: {
              reference_count: 1,
              phase_counts: {
                plan: 1
              },
              source_counts: {
                explicit: 1
              },
              loads: [
                {
                  phase: "plan",
                  references: [
                    {
                      skill_id: "skill-callback",
                      skill_name: "Callback skill",
                      reference_id: "ref-1",
                      reference_name: "Callback recovery checklist",
                      load_source: "explicit",
                      fetch_reason: "确认 callback 恢复条件",
                      fetch_request_index: 1,
                      fetch_request_total: 1,
                      retrieval_http_path: "/skills/callback",
                      retrieval_mcp_method: null,
                      retrieval_mcp_params: {}
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBulkGovernanceCard, {
        inScopeCount: 1,
        decisionCandidateCount: 0,
        retryCandidateCount: 1,
        operatorValue: "ops-reviewer",
        onOperatorChange: () => {},
        isMutating: false,
        lastResult,
        message: null,
        messageTone: "success",
        onAction: () => {}
      })
    );

    expect(html).toContain("当前 waiting 节点仍在等待 callback");
    expect(html).toContain("优先观察定时恢复是否已重新排队");
    expect(html).toContain("scheduled resume requeued");
    expect(html).toContain("requeued by waiting_resume_monitor");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner tool");
    expect(html.match(/Waiting node focus evidence/g)?.length ?? 0).toBe(1);
    expect(html.match(/Focused skill trace/g)?.length ?? 0).toBe(1);
    expect(html).toContain("Callback recovery checklist");
    expect(html).toContain("/runs/run-waiting-1");
  });

  it("renders stable recommended next step from bulk run follow-up instead of duplicating narrative follow_up", () => {
    const followUp = "先回到 workflow library 处理强隔离配置。";
    const lastResult: SensitiveAccessBulkActionResult = {
      action: "approved",
      status: "success",
      message: `批量批准已提交；${followUp}`,
      runFollowUpExplanation: {
        primary_signal: "1 个 run 已切回 workflow library 治理。",
        follow_up: followUp
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

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBulkGovernanceCard, {
        inScopeCount: 1,
        decisionCandidateCount: 1,
        retryCandidateCount: 0,
        operatorValue: "ops-reviewer",
        onOperatorChange: () => {},
        isMutating: false,
        lastResult,
        message: lastResult.message,
        messageTone: "success",
        onAction: () => {}
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("Open workflow library");
    expect(html).toContain('/workflows?execution=sandbox');
    expect(html.match(new RegExp(followUp, "g"))?.length ?? 0).toBe(1);
    expect(html).not.toContain("<strong>Next step：</strong>");
    expect(html).not.toContain(lastResult.message);
  });

  it("keeps workspace starter scope on sampled bulk run drilldown links", () => {
    mockSearchParams =
      "track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true";

    const lastResult: SensitiveAccessBulkActionResult = {
      action: "retry",
      status: "success",
      message: "批量重试已提交。",
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
          runId: "run-scoped-1",
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
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBulkGovernanceCard, {
        inScopeCount: 1,
        decisionCandidateCount: 0,
        retryCandidateCount: 1,
        operatorValue: "ops-reviewer",
        onOperatorChange: () => {},
        isMutating: false,
        lastResult,
        message: null,
        messageTone: "success",
        onAction: () => {}
      })
    );

    expect(html).toContain(
      "/runs/run-scoped-1?needs_follow_up=true&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );

    mockSearchParams = "";
  });

  it("defers duplicated bulk follow-up copy to the shared callback waiting summary", () => {
    const followUp = "优先观察定时恢复是否已重新排队。";
    const message = `批量重试已提交；${followUp}`;
    const lastResult: SensitiveAccessBulkActionResult = {
      action: "retry",
      status: "success",
      message,
      outcomeExplanation: {
        primary_signal: "已提交 1 条重试。",
        follow_up: followUp
      },
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
        follow_up: followUp
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
              follow_up: followUp
            },
            scheduledResumeDelaySeconds: 45,
            scheduledResumeSource: "runtime_retry",
            scheduledWaitingStatus: "waiting_callback",
            scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
            scheduledResumeDueAt: "2026-03-20T10:00:45Z"
          }
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBulkGovernanceCard, {
        inScopeCount: 1,
        decisionCandidateCount: 0,
        retryCandidateCount: 1,
        operatorValue: "ops-reviewer",
        onOperatorChange: () => {},
        isMutating: false,
        lastResult,
        message,
        messageTone: "success",
        onAction: () => {}
      })
    );

    expect(html).toContain("本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。");
    expect(html.match(new RegExp(followUp, "g"))?.length ?? 0).toBe(1);
    expect(html).not.toContain(message);
    expect(html).not.toContain("Next step");
  });

  it("renders workflow handoff when the bulk result carries legacy auth governance", () => {
    const lastResult: SensitiveAccessBulkActionResult = {
      action: "approved",
      status: "success",
      message: "批量审批已通过。",
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
      blockerStillBlockedCount: 0,
      legacyAuthGovernance: buildLegacyAuthGovernanceSnapshot()
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBulkGovernanceCard, {
        inScopeCount: 1,
        decisionCandidateCount: 1,
        retryCandidateCount: 0,
        operatorValue: "ops-reviewer",
        onOperatorChange: () => {},
        isMutating: false,
        lastResult,
        message: lastResult.message,
        messageTone: "success",
        onAction: () => {}
      })
    );

    expect(html).toContain("Workflow handoff");
    expect(html).toContain("published blockers 1");
    expect(html).toContain("再补发支持鉴权的 replacement bindings");
    expect(html).toContain("Demo Workflow");
  });
});
