import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishInvocationCallbackSection } from "@/components/workflow-publish-invocation-callback-section";

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: ({ inboxHref }: { inboxHref?: string | null }) =>
    createElement("div", { "data-testid": "callback-waiting-summary-card" }, inboxHref ?? "no-inbox")
}));

describe("WorkflowPublishInvocationCallbackSection", () => {
  it("uses shared drilldown surface copy", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        invocation: {
          run_id: "run-callback-1",
          run_waiting_reason: "waiting_callback",
          run_waiting_lifecycle: {
            node_run_id: "node-run-callback-1",
            callback_waiting_lifecycle: null,
            waiting_reason: "waiting_callback",
            scheduled_resume_delay_seconds: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null
          }
        } as never,
        callbackTickets: [],
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: {
          primary_signal: "当前 callback waiting 仍卡在回调阶段。",
          follow_up: "优先观察 callback ticket 是否恢复。"
        },
        executionFocusNode: null
      })
    );

    expect(html).toContain("Callback waiting drilldown");
    expect(html).toContain("approval blockers and resume scheduling stay together here");
    expect(html).toContain("open inbox slice");
    expect(html).toContain("Resume blockers");
    expect(html).toContain("Latest callback events");
    expect(html).toContain("当前 callback waiting 仍卡在回调阶段。");
  });
});
