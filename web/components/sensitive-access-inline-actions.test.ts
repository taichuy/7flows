import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";

type MockActionState = Record<string, unknown>;

const inlineFeedbackProps: Array<Record<string, unknown>> = [];
let actionStateQueue: MockActionState[] = [];

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [actionStateQueue.shift() ?? { status: "idle", message: "" }, vi.fn()],
    useEffect: () => undefined
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => ({ pending: false })
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/sensitive-access",
  useRouter: () => ({
    refresh: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams("status=pending")
}));

vi.mock("@/app/actions/sensitive-access", () => ({
  decideSensitiveAccessApprovalTicket: vi.fn(),
  retrySensitiveAccessNotificationDispatch: vi.fn()
}));

vi.mock("@/components/inline-operator-action-feedback", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    InlineOperatorActionFeedback: (props: Record<string, unknown>) => {
      inlineFeedbackProps.push(props);
      return actual.createElement("div", {
        "data-testid": "inline-operator-feedback",
        "data-has-run-follow-up": String(Boolean(props.runFollowUp))
      });
    }
  };
});

describe("SensitiveAccessInlineActions", () => {
  beforeEach(() => {
    inlineFeedbackProps.length = 0;
    actionStateQueue = [];
  });

  it("passes canonical run follow-up into approval and retry feedback cards", () => {
    const callbackWaitingSummaryProps = {
      inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
      callbackWaitingAutomation: {
        status: "healthy",
        scheduler_required: true,
        detail: "callback waiting automation healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "scheduler ready",
        steps: []
      },
      showSensitiveAccessInlineActions: false
    };
    const decisionRunFollowUp = {
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 1,
      runningRunCount: 0,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      explanation: {
        primary_signal: "本次影响 1 个 run；已回读 1 个样本。"
      },
      sampledRuns: []
    };
    const retryRunFollowUp = {
      affectedRunCount: 2,
      sampledRunCount: 1,
      waitingRunCount: 1,
      runningRunCount: 1,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      explanation: {
        primary_signal: "本次影响 2 个 run；已回读 1 个样本。"
      },
      sampledRuns: []
    };

    actionStateQueue = [
      {
        status: "success",
        message: "审批已通过。",
        ticketId: "ticket-1",
        runFollowUp: decisionRunFollowUp
      },
      {
        status: "success",
        message: "通知已重试。",
        dispatchId: "dispatch-1",
        target: "ops@example.com",
        runFollowUp: retryRunFollowUp
      }
    ];

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessInlineActions, {
        ticket: {
          id: "ticket-1",
          node_run_id: "node-run-1",
          status: "pending",
          waiting_status: "waiting"
        },
        notifications: [
          {
            id: "dispatch-1",
            channel: "email",
            target: "ops@example.com",
            status: "failed",
            error: "smtp unavailable",
            created_at: "2026-03-20T10:00:00Z"
          }
        ],
        notificationChannels: [],
        runId: "run-1",
        nodeRunId: "node-run-1",
        callbackWaitingSummaryProps,
        compact: true
      })
    );

    expect(html).toContain('data-has-run-follow-up="true"');
    expect(inlineFeedbackProps).toHaveLength(2);
    expect(inlineFeedbackProps[0]?.callbackWaitingSummaryProps).toEqual(callbackWaitingSummaryProps);
    expect(inlineFeedbackProps[1]?.callbackWaitingSummaryProps).toEqual(callbackWaitingSummaryProps);
    expect(inlineFeedbackProps[0]?.runFollowUp).toEqual(decisionRunFollowUp);
    expect(inlineFeedbackProps[1]?.runFollowUp).toEqual(retryRunFollowUp);
  });
});
