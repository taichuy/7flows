import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";

const callbackSummaryProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
    callbackSummaryProps.push(props);
    return createElement("div", { "data-testid": "callback-waiting-summary" });
  }
}));

vi.mock("@/components/operator-focus-evidence-card", () => ({
  OperatorFocusEvidenceCard: () => createElement("div", { "data-testid": "focus-evidence" })
}));

vi.mock("@/components/operator-run-sample-card-list", () => ({
  OperatorRunSampleCardList: () => createElement("div", { "data-testid": "run-sample-list" })
}));

vi.mock("@/components/skill-reference-load-list", () => ({
  SkillReferenceLoadList: () => createElement("div", { "data-testid": "skill-reference-loads" })
}));

function buildSensitiveAccessEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
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
      run_id: "run-1",
      node_run_id: "node-run-1",
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
      follow_up: "下一步：优先处理审批票据，再观察 waiting 节点是否恢复。"
    },
    run_snapshot: null,
    run_follow_up: null
  };
}

describe("InlineOperatorActionFeedback", () => {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  beforeEach(() => {
    callbackSummaryProps.length = 0;
  });

  it("treats an explicit null recommendedNextStep override as disabling the auto fallback", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        recommendedNextStep: null,
        runFollowUpExplanation: {
          primary_signal: "本次影响 1 个 run；operator follow-up 已刷新。",
          follow_up: "run run-1：继续观察 waiting。"
        }
      })
    );

    expect(html).not.toContain(operatorSurfaceCopy.recommendedNextStepTitle);
  });

  it("forwards callback waiting summary context to the shared summary card", () => {
    const inboxHref = "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1";
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        runSnapshot: {
          status: "waiting",
          currentNodeId: "approval_gate",
          waitingReason: "approval pending",
          executionFocusNodeId: "approval_gate",
          executionFocusNodeRunId: "node-run-1",
          executionFocusNodeName: "Approval Gate",
          callbackWaitingExplanation: {
            primary_signal: "当前 run 仍在等待审批。",
            follow_up: "优先处理审批票据，再回来看 waiting 是否恢复。"
          }
        },
        callbackWaitingSummaryProps: {
          inboxHref,
          sensitiveAccessEntries: [buildSensitiveAccessEntry()],
          showSensitiveAccessInlineActions: false
        }
      })
    );

    expect(html).toContain('data-testid="callback-waiting-summary"');
    expect(callbackSummaryProps).toHaveLength(1);
    expect(callbackSummaryProps[0]?.inboxHref).toBe(inboxHref);
    expect(
      ((callbackSummaryProps[0]?.sensitiveAccessEntries as SensitiveAccessTimelineEntry[] | undefined) ?? [])[0]
        ?.request.id
    ).toBe("request-1");
    expect(callbackSummaryProps[0]?.showSensitiveAccessInlineActions).toBe(false);
  });
});
