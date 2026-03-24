import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishInvocationCallbackSection } from "@/components/workflow-publish-invocation-callback-section";

const callbackSummaryProps: Array<Record<string, unknown>> = [];

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
    callbackSummaryProps.push(props);
    return createElement(
      "div",
      { "data-testid": "callback-waiting-summary-card" },
      String(props.inboxHref ?? "no-inbox")
    );
  }
}));

describe("WorkflowPublishInvocationCallbackSection", () => {
  it("forwards current publish detail href into the shared callback summary", () => {
    renderToStaticMarkup(
      createElement(WorkflowPublishInvocationCallbackSection, {
        currentHref: "/workflows/workflow-1?publish_invocation=invocation-1",
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
        callbackWaitingExplanation: null,
        executionFocusNode: {
          node_id: "callback_node",
          node_name: "Callback node",
          node_run_id: "node-run-callback-1",
          node_type: "tool",
          skill_reference_load_count: 0,
          skill_reference_loads: [],
          artifacts: [],
          artifact_refs: [],
          tool_calls: []
        } as never
      })
    );

    expect(
      callbackSummaryProps.some(
        (props) => props.currentHref === "/workflows/workflow-1?publish_invocation=invocation-1"
      )
    ).toBe(true);
    expect(callbackSummaryProps[0]?.focusEvidenceDrilldownLink).toMatchObject({
      label: "jump to focused trace slice",
      href: "/runs/run-callback-1?node_run_id=node-run-callback-1#run-diagnostics-execution-timeline"
    });
  });

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

  it("uses shared callback ticket copy", () => {
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
        callbackTickets: [
          {
            ticket: "ticket-1",
            status: "pending",
            callback_payload: {
              ok: true
            }
          }
        ] as never,
        sensitiveAccessEntries: [],
        callbackWaitingAutomation: {
          status: "disabled",
          scheduler_required: false,
          detail: "disabled in test",
          scheduler_health_status: "idle",
          scheduler_health_detail: "not configured",
          steps: []
        },
        callbackWaitingExplanation: null,
        executionFocusNode: null
      })
    );

    expect(html).toContain("Callback ticket");
    expect(html).toContain("open ticket inbox slice");
    expect(html).toContain("callback payload preview");
  });
});
