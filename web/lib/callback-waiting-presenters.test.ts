import { describe, expect, it } from "vitest";

import type { CallbackWaitingLifecycleSummary } from "./get-run-views";
import {
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  listCallbackWaitingChips,
  listCallbackWaitingOperatorStatuses
} from "./callback-waiting-presenters";

function createLifecycle(
  overrides: Partial<CallbackWaitingLifecycleSummary> = {}
): CallbackWaitingLifecycleSummary {
  return {
    wait_cycle_count: 1,
    issued_ticket_count: 0,
    expired_ticket_count: 0,
    consumed_ticket_count: 0,
    canceled_ticket_count: 0,
    late_callback_count: 0,
    resume_schedule_count: 0,
    max_expired_ticket_count: 0,
    terminated: false,
    last_resume_backoff_attempt: 0,
    ...overrides
  };
}

describe("callback waiting presenters", () => {
  it("保留 0 秒 scheduled resume 标签", () => {
    expect(
      formatScheduledResumeLabel({
        scheduledResumeDelaySeconds: 0,
        scheduledResumeSource: "route_cleanup",
        scheduledWaitingStatus: "waiting_callback"
      })
    ).toBe("scheduled resume 0s · route_cleanup · waiting_callback");
  });

  it("在 operator status 中展示 0 秒 scheduled resume", () => {
    expect(
      listCallbackWaitingOperatorStatuses({
        scheduledResumeDelaySeconds: 0,
        scheduledResumeSource: "route_cleanup",
        scheduledWaitingStatus: "waiting_callback"
      })
    ).toContainEqual({
      kind: "scheduled_resume_pending",
      label: "scheduled resume queued",
      detail: "runtime will retry in 0s · route_cleanup · waiting_callback"
    });
  });

  it("在 chips 中保留 lifecycle 外的 0 秒 scheduled resume", () => {
    expect(
      listCallbackWaitingChips({
        lifecycle: createLifecycle(),
        scheduledResumeDelaySeconds: 0
      })
    ).toContain("scheduled 0s");
  });

  it("在无其他 blocker 时给出 watch scheduled resume 动作", () => {
    expect(
      getCallbackWaitingRecommendedAction({
        scheduledResumeDelaySeconds: 0
      })
    ).toMatchObject({
      kind: "watch_scheduled_resume",
      label: "Watch the scheduled resume",
      ctaLabel: "Open waiting inbox"
    });
  });
});
