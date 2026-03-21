import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CallbackWaitingInlineActions } from "@/components/callback-waiting-inline-actions";

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn()
  })
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

describe("CallbackWaitingInlineActions", () => {
  beforeEach(() => {
    inlineFeedbackProps.length = 0;
    actionStateQueue = [];
  });

  it("passes canonical run follow-up into resume and cleanup feedback cards", () => {
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
        allowManualResume: true
      })
    );

    expect(html).toContain('data-has-run-follow-up="true"');
    expect(inlineFeedbackProps).toHaveLength(2);
    expect(inlineFeedbackProps[0]?.runFollowUp).toEqual(resumeRunFollowUp);
    expect(inlineFeedbackProps[1]?.runFollowUp).toEqual(cleanupRunFollowUp);
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
