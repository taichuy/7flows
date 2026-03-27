import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CallbackWaitingInlineActions } from "@/components/callback-waiting-inline-actions";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";

type MockActionState = Record<string, unknown>;

const inlineFeedbackProps: Array<Record<string, unknown>> = [];
let actionStateQueue: MockActionState[] = [];
let mockSearchParams = "";

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [actionStateQueue.shift() ?? { status: "idle", message: "" }, vi.fn()],
    useEffect: () => undefined
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/runs/run-1",
  useRouter: () => ({
    refresh: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams(mockSearchParams)
}));

vi.mock("@/app/actions/callback-tickets", () => ({
  cleanupRunCallbackTickets: vi.fn()
}));

vi.mock("@/app/actions/runs", () => ({
  resumeRun: vi.fn()
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

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "configured",
    scheduler_required: true,
    detail: "callback automation degraded",
    scheduler_health_status: "unhealthy",
    scheduler_health_detail: "scheduler is currently backlogged.",
    affected_run_count: 2,
    affected_workflow_count: 1,
    primary_blocker_kind: "scheduler_unhealthy",
    recommended_action: {
      kind: "callback_waiting",
      entry_key: "runLibrary",
      href: "/runs?status=waiting",
      label: "Open run library"
    },
    steps: []
  };
}

describe("CallbackWaitingInlineActions", () => {
  beforeEach(() => {
    inlineFeedbackProps.length = 0;
    actionStateQueue = [];
    mockSearchParams = "";
  });

  it("passes canonical run follow-up into resume and cleanup feedback cards", () => {
    const callbackWaitingAutomation = buildCallbackWaitingAutomation();
    const cleanupRunFollowUp = {
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 1,
      runningRunCount: 0,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      explanation: {
        primary_signal: "cleanup 影响 1 个 run。"
      },
      sampledRuns: []
    };
    const resumeRunFollowUp = {
      affectedRunCount: 1,
      sampledRunCount: 1,
      waitingRunCount: 0,
      runningRunCount: 1,
      succeededRunCount: 0,
      failedRunCount: 0,
      unknownRunCount: 0,
      explanation: {
        primary_signal: "resume 影响 1 个 run。"
      },
      sampledRuns: []
    };

    actionStateQueue = [
      {
        status: "success",
        message: "cleanup 已完成。",
        scopeKey: "run-1:node-run-1",
        runFollowUp: cleanupRunFollowUp
      },
      {
        status: "success",
        message: "resume 已提交。",
        runId: "run-1",
        runFollowUp: resumeRunFollowUp
      }
    ];

    const html = renderToStaticMarkup(
      createElement(CallbackWaitingInlineActions, {
        runId: "run-1",
        nodeRunId: "node-run-1",
        compact: true,
        allowManualResume: true,
        callbackWaitingSummaryProps: {
          inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
          callbackTickets: [
            {
              ticket: "callback-ticket-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              status: "pending",
              waiting_status: "waiting",
              tool_call_index: 0,
              created_at: "2026-03-20T10:00:00Z"
            }
          ],
          callbackWaitingAutomation,
          sensitiveAccessEntries: []
        }
      })
    );

    expect(html).toContain('data-has-run-follow-up="true"');
    expect(inlineFeedbackProps).toHaveLength(2);
    expect(inlineFeedbackProps[0]?.runFollowUp).toEqual(resumeRunFollowUp);
    expect(inlineFeedbackProps[1]?.runFollowUp).toEqual(cleanupRunFollowUp);
    expect(inlineFeedbackProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      callbackWaitingAutomation,
      inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1"
    });
    expect(inlineFeedbackProps[1]?.callbackWaitingSummaryProps).toMatchObject({
      callbackWaitingAutomation,
      inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1"
    });
  });

  it("keeps workflow governance handoff and workspace-starter scope in action feedback", () => {
    mockSearchParams =
      "needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92";

    actionStateQueue = [
      {
        status: "success",
        message: "cleanup 已完成。",
        scopeKey: "run-1:node-run-1"
      },
      {
        status: "success",
        message: "resume 已提交。",
        runId: "run-1"
      }
    ];

    renderToStaticMarkup(
      createElement(CallbackWaitingInlineActions, {
        runId: "run-1",
        nodeRunId: "node-run-1",
        compact: true,
        allowManualResume: true,
        callbackWaitingSummaryProps: {
          inboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
          callbackTickets: [
            {
              ticket: "callback-ticket-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              status: "pending",
              waiting_status: "waiting",
              tool_call_index: 0,
              created_at: "2026-03-20T10:00:00Z"
            }
          ],
          callbackWaitingAutomation: buildCallbackWaitingAutomation(),
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
          sensitiveAccessEntries: []
        }
      })
    );

    expect(inlineFeedbackProps).toHaveLength(2);
    expect(inlineFeedbackProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapDetail: "workflow catalog gap（native.catalog-gap）仍需先处理。",
      workflowCatalogGapHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-1?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
    expect(inlineFeedbackProps[0]?.currentHref).toBe(
      "/runs/run-1?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(
      typeof inlineFeedbackProps[0]?.resolveRunDetailHref === "function"
        ? inlineFeedbackProps[0].resolveRunDetailHref("run-2")
        : null
    ).toBe(
      "/runs/run-2?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });

  it("renders a custom compact title when the caller marks actions as optional overrides", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingInlineActions, {
        runId: "run-1",
        compact: true,
        title: "Optional callback override"
      })
    );

    expect(html).toContain("Optional callback override");
    expect(html).not.toContain("<p class=\"entry-card-title\">Callback actions</p>");
  });

  it("reuses shared observe-first copy when the caller only passes the recommended action kind", () => {
    const html = renderToStaticMarkup(
      createElement(CallbackWaitingInlineActions, {
        runId: "run-1",
        compact: true,
        recommendedActionKind: "watch_scheduled_resume"
      })
    );

    expect(html).toContain("Optional callback override");
    expect(html).toContain("系统已安排定时恢复；仅在需要绕过当前 backoff 时，再手动恢复或清理过期 ticket。");
  });
});
