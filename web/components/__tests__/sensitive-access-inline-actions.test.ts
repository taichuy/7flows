import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SensitiveAccessInlineActions } from "@/components/sensitive-access-inline-actions";

type MockActionState = Record<string, unknown>;

const inlineFeedbackProps: Array<Record<string, unknown>> = [];
let actionStateQueue: MockActionState[] = [];
let mockSearchParams = "status=pending";

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
  useSearchParams: () => new URLSearchParams(mockSearchParams)
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
    mockSearchParams = "status=pending";
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

  it("keeps workflow governance handoff and workspace-starter scope in inline feedback", () => {
    mockSearchParams =
      "needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92";

    const callbackWaitingSummaryProps = {
      currentHref: "/sensitive-access?status=pending",
      inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
      callbackWaitingAutomation: {
        status: "healthy",
        scheduler_required: true,
        detail: "callback waiting automation healthy",
        scheduler_health_status: "healthy",
        scheduler_health_detail: "scheduler ready",
        steps: []
      },
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapDetail: "workflow catalog gap（native.catalog-gap）仍需先处理。",
      workflowCatalogGapHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker",
        detail: "published blocker 仍需 replacement binding。",
        workflowSummary: {
          workflow_id: "workflow-1",
          workflow_name: "Workflow 1",
          binding_count: 1,
          draft_candidate_count: 0,
          published_blocker_count: 1,
          offline_inventory_count: 0,
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        }
      },
      showSensitiveAccessInlineActions: false
    };

    actionStateQueue = [
      {
        status: "success",
        message: "审批已通过。",
        ticketId: "ticket-1"
      },
      {
        status: "success",
        message: "通知已重试。",
        dispatchId: "dispatch-1",
        target: "ops@example.com"
      }
    ];

    renderToStaticMarkup(
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
        runId: "run-1",
        nodeRunId: "node-run-1",
        callbackWaitingSummaryProps,
        compact: true
      })
    );

    expect(inlineFeedbackProps).toHaveLength(2);
    expect(inlineFeedbackProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      workflowCatalogGapSummary: callbackWaitingSummaryProps.workflowCatalogGapSummary,
      workflowCatalogGapDetail: callbackWaitingSummaryProps.workflowCatalogGapDetail,
      workflowCatalogGapHref: callbackWaitingSummaryProps.workflowCatalogGapHref,
      workflowGovernanceHref: callbackWaitingSummaryProps.workflowGovernanceHref,
      legacyAuthHandoff: callbackWaitingSummaryProps.legacyAuthHandoff
    });
    expect(inlineFeedbackProps[0]?.currentHref).toBe(
      "/sensitive-access?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(
      typeof inlineFeedbackProps[0]?.resolveRunDetailHref === "function"
        ? inlineFeedbackProps[0].resolveRunDetailHref("run-2")
        : null
    ).toBe(
      "/runs/run-2?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });
});
