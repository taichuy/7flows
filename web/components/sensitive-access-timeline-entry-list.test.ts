import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";

const inlineFeedbackProps: Array<Record<string, unknown>> = [];
const callbackSummaryProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/inline-operator-action-feedback", () => ({
  InlineOperatorActionFeedback: (props: Record<string, unknown>) => {
    inlineFeedbackProps.push(props);
    const runSnapshot = (props.runSnapshot ?? null) as { currentNodeId?: string | null } | null;
    return createElement(
      "div",
      {
        "data-testid": "inline-operator-feedback",
        "data-run-id": String(props.runId ?? ""),
        "data-focus-node": String(runSnapshot?.currentNodeId ?? "")
      },
      `${String(props.runId ?? "")}:${String(runSnapshot?.currentNodeId ?? "")}`
    );
  }
}));

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
    callbackSummaryProps.push(props);
    return createElement("div", {
      "data-testid": "callback-waiting-summary",
      "data-run-id": String(props.runId ?? "")
    });
  }
}));

vi.mock("@/components/sensitive-access-inline-actions", () => ({
  SensitiveAccessInlineActions: () => createElement("div", { "data-testid": "sensitive-access-inline-actions" })
}));

function buildEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-current",
      node_run_id: "node-run-current",
      requester_type: "tool",
      requester_id: "native.search",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "fetch remote search results",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "policy_requires_approval",
      reason_label: "Policy requires approval",
      policy_summary: "High-risk remote search requires operator approval.",
      created_at: "2026-03-20T10:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Remote search capability",
      description: "External search adapter",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-20T09:00:00Z",
      updated_at: "2026-03-20T09:00:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-current",
      node_run_id: "node-run-current",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T10:30:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "当前阻断来自敏感访问审批票据。",
      follow_up: "下一步：优先处理当前票据，再观察 waiting 节点是否恢复。"
    },
    run_snapshot: null,
    run_follow_up: {
      affected_run_count: 2,
      sampled_run_count: 2,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 1,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "本次影响 2 个 run；已回读 2 个样本。",
        follow_up: "run run-current：当前 run 状态：waiting。"
      },
      sampled_runs: [
        {
          run_id: "run-stale",
          snapshot: {
            status: "failed",
            currentNodeId: "stale-node",
            waitingReason: "stale blocker",
            executionFocusNodeId: "stale-node",
            executionFocusNodeRunId: "node-run-stale",
            executionFocusNodeName: "Stale Node",
            executionFocusNodeType: "tool"
          }
        },
        {
          run_id: "run-current",
          snapshot: {
            status: "waiting",
            currentNodeId: "current-node",
            waitingReason: "waiting approval",
            executionFocusNodeId: "current-node",
            executionFocusNodeRunId: "node-run-current",
            executionFocusNodeName: "Current Node",
            executionFocusNodeType: "tool"
          }
        }
      ]
    }
  };
}

describe("SensitiveAccessTimelineEntryList", () => {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  beforeEach(() => {
    inlineFeedbackProps.length = 0;
    callbackSummaryProps.length = 0;
  });

  it("uses the matching sampled run snapshot instead of the first stale sample", () => {
    const html = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [buildEntry()],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain("run-current:current-node");
    expect(html).not.toContain("run-current:stale-node");
    expect(inlineFeedbackProps).toHaveLength(1);
    expect(inlineFeedbackProps[0]?.runId).toBe("run-current");
    expect(
      (inlineFeedbackProps[0]?.runSnapshot as { currentNodeId?: string | null } | undefined)
        ?.currentNodeId
    ).toBe("current-node");
  });

  it("keeps the shared callback waiting summary when only structured follow-up explanation exists", () => {
    const entry = buildEntry();
    const runFollowUpExplanation = {
      primary_signal: "本次影响 1 个 run；operator follow-up 已刷新。",
      follow_up: "先看共享 callback waiting 建议，再决定是否人工 override。"
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            run_follow_up: {
              ...entry.run_follow_up!,
              explanation: runFollowUpExplanation,
              sampled_runs: []
            }
          }
        ],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain('data-testid="inline-operator-feedback"');
    expect(html).toContain('data-testid="callback-waiting-summary"');
    expect(inlineFeedbackProps).toHaveLength(1);
    expect(inlineFeedbackProps[0]?.outcomeExplanation ?? null).toBeNull();
    expect(inlineFeedbackProps[0]?.recommendedNextStep ?? null).toBeNull();
    expect(inlineFeedbackProps[0]?.runFollowUpExplanation).toEqual(runFollowUpExplanation);
    expect(callbackSummaryProps).toHaveLength(1);
    expect(
      (
        callbackSummaryProps[0]?.callbackWaitingExplanation as
          | { primary_signal?: string | null }
          | undefined
      )?.primary_signal
    ).toBe("当前阻断来自敏感访问审批票据。");
    expect(callbackSummaryProps[0]?.showInlineActions).toBe(false);
  });

  it("passes sensitive-access callback context into inline feedback when run snapshot already carries callback waiting facts", () => {
    const entry = buildEntry();

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            run_snapshot: {
              status: "waiting",
              currentNodeId: "approval_gate",
              waitingReason: "approval pending",
              executionFocusNodeId: "approval_gate",
              executionFocusNodeRunId: "node-run-current",
              executionFocusNodeName: "Approval Gate",
              callbackWaitingExplanation: {
                primary_signal: "当前 run snapshot 已回接 callback waiting 审批阻断。",
                follow_up: "优先处理审批票据，再回来看 waiting 是否恢复。"
              }
            }
          }
        ],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain('data-testid="inline-operator-feedback"');
    expect(callbackSummaryProps).toHaveLength(0);
    expect(inlineFeedbackProps).toHaveLength(1);
    expect(inlineFeedbackProps[0]?.recommendedNextStep ?? null).toBeNull();
    expect(inlineFeedbackProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      inboxHref: expect.stringContaining("/sensitive-access?"),
      showSensitiveAccessInlineActions: false
    });
    expect(
      (
        (inlineFeedbackProps[0]?.callbackWaitingSummaryProps as {
          inboxHref?: string;
          sensitiveAccessEntries?: SensitiveAccessTimelineEntry[];
        })?.sensitiveAccessEntries ?? []
      )[0]?.request.id
    ).toBe("request-1");
    expect(
      (
        inlineFeedbackProps[0]?.callbackWaitingSummaryProps as {
          inboxHref?: string;
        }
      )?.inboxHref
    ).toContain("run_id=run-current");
  });

  it("renders a standalone shared recommended next step when only operator follow-up remains", () => {
    const entry = buildEntry();

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessTimelineEntryList, {
        entries: [
          {
            ...entry,
            request: {
              ...entry.request,
              decision: "allow",
              decision_label: "Allow",
              reason_code: "sensitive_access_allowed",
              reason_label: "Allowed",
              policy_summary: "允许当前读取。",
              decided_at: "2026-03-21T00:05:00Z"
            },
            approval_ticket: {
              ...entry.approval_ticket!,
              status: "approved",
              waiting_status: "resumed",
              approved_by: "operator-1",
              decided_at: "2026-03-21T00:05:00Z"
            },
            notifications: [],
            outcome_explanation: {
              primary_signal: "审批已通过，waiting blocker 已回交 runtime。",
              follow_up: "优先打开 run 查看恢复后的 focus 节点与最新执行证据。"
            },
            run_snapshot: null,
            run_follow_up: null
          }
        ],
        emptyCopy: "no entries"
      })
    );

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("approval blocker");
    expect(html).toContain(operatorSurfaceCopy.openInboxSliceLabel);
    expect(html).toContain("优先打开 run 查看恢复后的 focus 节点与最新执行证据。");
  });
});
