import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CallbackWaitingLifecycleSummary } from "./get-run-views";
import {
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  listCallbackWaitingChips,
  listCallbackWaitingOperatorStatuses
} from "./callback-waiting-presenters";
import { formatTimestamp } from "./runtime-presenters";

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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T10:06:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("当 scheduled resume 已过 due_at 时，展示 overdue 状态", () => {
    const scheduledAt = formatTimestamp("2026-03-18T10:00:00Z");
    const dueAt = formatTimestamp("2026-03-18T10:05:00Z");

    expect(
      listCallbackWaitingOperatorStatuses({
        scheduledResumeDelaySeconds: 5,
        scheduledResumeSource: "callback_ticket_monitor",
        scheduledWaitingStatus: "waiting_callback",
        scheduledResumeScheduledAt: "2026-03-18T10:00:00Z",
        scheduledResumeDueAt: "2026-03-18T10:05:00Z"
      })
    ).toContainEqual({
      kind: "scheduled_resume_pending",
      label: "scheduled resume overdue",
      detail: `scheduled resume passed its due time · callback_ticket_monitor · waiting_callback · scheduled ${scheduledAt} · due ${dueAt} · overdue`
    });
  });

  it("在 chips 中把 overdue resume 单独标出来", () => {
    expect(
      listCallbackWaitingChips({
        lifecycle: createLifecycle(),
        scheduledResumeDelaySeconds: 5,
        scheduledResumeDueAt: "2026-03-18T10:05:00Z"
      })
    ).toContain("resume overdue");
  });

  it("当 scheduled resume 逾期未触发时，建议人工恢复而不是继续等待", () => {
    expect(
      getCallbackWaitingRecommendedAction({
        scheduledResumeDelaySeconds: 5,
        scheduledResumeScheduledAt: "2026-03-18T10:00:00Z",
        scheduledResumeDueAt: "2026-03-18T10:05:00Z"
      })
    ).toMatchObject({
      kind: "manual_resume",
      label: "Scheduled resume is overdue",
      ctaLabel: "Try manual resume"
    });
  });
});
