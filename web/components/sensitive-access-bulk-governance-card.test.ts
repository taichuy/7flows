import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SensitiveAccessBulkGovernanceCard } from "@/components/sensitive-access-bulk-governance-card";
import type { SensitiveAccessBulkActionResult } from "@/lib/get-sensitive-access";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("SensitiveAccessBulkGovernanceCard", () => {
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
});
