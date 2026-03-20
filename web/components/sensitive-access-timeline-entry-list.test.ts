import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SensitiveAccessTimelineEntryList } from "@/components/sensitive-access-timeline-entry-list";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";

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
});
