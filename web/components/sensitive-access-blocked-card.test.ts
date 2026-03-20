import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/sensitive-access-inline-actions", () => ({
  SensitiveAccessInlineActions: () =>
    createElement("div", { "data-testid": "sensitive-access-inline-actions" })
}));

describe("SensitiveAccessBlockedCard", () => {
  it("renders canonical follow-up and run snapshot evidence", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Published invocation detail requires approval before the payload can be viewed.",
      resource: {
        id: "resource-1",
        label: "Invocation Detail",
        description: "Sensitive published invocation detail",
        sensitivity_level: "L3",
        source: "workspace_resource",
        metadata: {
          run_id: "run-1",
          invocation_id: "invocation-1"
        }
      },
      access_request: {
        id: "request-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-1",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-1",
        access_request_id: "request-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [
        {
          id: "notification-1",
          approval_ticket_id: "ticket-1",
          channel: "in_app",
          target: "sensitive-access-inbox",
          status: "pending"
        }
      ],
      outcome_explanation: {
        primary_signal: "当前阻断来自敏感访问审批票据。",
        follow_up: "下一步：优先处理审批票据，再观察 waiting 节点是否恢复。"
      },
      run_snapshot: {
        status: "waiting",
        currentNodeId: "agent_review",
        executionFocusNodeId: "agent_review",
        executionFocusNodeRunId: "node-run-1",
        executionFocusNodeName: "Agent Review",
        executionFocusExplanation: {
          primary_signal: "当前 focus node 仍在等待审批阻断解除。",
          follow_up: "审批通过后继续观察 review 节点。"
        }
      },
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-1：当前 run 状态：waiting。"
        },
        sampledRuns: [
          {
            runId: "run-1",
            snapshot: {
              status: "waiting",
              currentNodeId: "agent_review",
              waitingReason: "approval pending",
              executionFocusNodeId: "agent_review",
              executionFocusNodeRunId: "node-run-1",
              executionFocusNodeName: "Agent Review",
              callbackWaitingExplanation: {
                primary_signal: "当前 sampled run 仍在等待审批。",
                follow_up: "优先完成审批后再继续观察恢复。"
              },
              executionFocusArtifactCount: 1,
              executionFocusArtifactRefCount: 1,
              executionFocusToolCallCount: 1,
              executionFocusRawRefCount: 1,
              executionFocusArtifactRefs: ["artifact://approval-1"],
              executionFocusToolCalls: [
                {
                  id: "tool-call-1",
                  tool_id: "approval.tool",
                  tool_name: "Approval Tool",
                  phase: "waiting_approval",
                  status: "waiting",
                  response_summary: "审批阻断前已保留最近一次工具调用摘要。",
                  raw_ref: "raw://approval-tool-1"
                }
              ]
            }
          }
        ]
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    expect(html).toContain("Canonical follow-up");
    expect(html).toContain("本次影响 1 个 run");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("open inbox slice");
    expect(html).toContain("优先处理审批票据，再观察 waiting 节点是否恢复");
    expect(html).not.toContain("当前阻断来自敏感访问审批票据");
    expect(html).toContain("Run status");
    expect(html).toContain("waiting");
    expect(html).toContain("Focus node");
    expect(html).toContain("Agent Review");
    expect(html).toContain("sampled 1");
    expect(html).toContain("still waiting 1");
    expect(html).toContain("/runs/run-1");
  });

  it("falls back to sampled run context when request and ticket run_id are missing", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Published invocation export requires approval before the payload can be downloaded.",
      resource: {
        id: "resource-2",
        label: "Invocation Export",
        description: "Sensitive published invocation export",
        sensitivity_level: "L3",
        source: "workspace_resource",
        metadata: {
          run_ids: ["run-sampled-1"]
        }
      },
      access_request: {
        id: "request-2",
        run_id: null,
        node_run_id: null,
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-2",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-2",
        access_request_id: "request-2",
        run_id: null,
        node_run_id: "node-run-sampled",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [],
      outcome_explanation: {
        primary_signal: "当前阻断来自 metadata-only run_ids 的敏感访问审批。",
        follow_up: "下一步：先处理审批票据，再回看 sampled run 的 waiting 事实。"
      },
      run_snapshot: null,
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-sampled-1：当前 run 状态：waiting。"
        },
        sampledRuns: [
          {
            runId: "run-sampled-1",
            snapshot: {
              status: "waiting",
              currentNodeId: "export_wait",
              waitingReason: "approval pending",
              executionFocusNodeId: "export_wait",
              executionFocusNodeRunId: "node-run-sampled",
              executionFocusNodeName: "Export Wait"
            }
          }
        ]
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    expect(html).toContain("/runs/run-sampled-1");
    expect(html).toContain("run_id=run-sampled-1");
  });
});
