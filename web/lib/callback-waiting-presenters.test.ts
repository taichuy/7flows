import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CallbackWaitingLifecycleSummary } from "./get-run-views";
import {
  buildCallbackWaitingInlineActionStatusHint,
  buildCallbackWaitingInlineActionTitle,
  buildCallbackWaitingSummarySurfaceCopy,
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  isObserveFirstCallbackWaitingAction,
  listCallbackWaitingBlockerRows,
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

  it("暴露 callback waiting 共享 surface copy", () => {
    expect(buildCallbackWaitingSummarySurfaceCopy()).toMatchObject({
      recommendedNextStepTitle: "Recommended next step",
      defaultInboxLinkLabel: "open inbox slice",
      manualOverrideOptionalLabel: "manual override optional",
      waitingNodeFocusEvidenceTitle: "Waiting node focus evidence",
      focusedSkillTraceTitle: "Focused skill trace",
      injectedReferencesTitle: "Injected references",
      terminatedLabel: "callback waiting terminated"
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

  it("当 waiting resume monitor 已重入队时，不再把 scheduled resume 标成 overdue", () => {
    const scheduledAt = formatTimestamp("2026-03-18T10:00:00Z");
    const dueAt = formatTimestamp("2026-03-18T10:05:00Z");
    const requeuedAt = formatTimestamp("2026-03-18T10:06:00Z");

    expect(
      listCallbackWaitingOperatorStatuses({
        scheduledResumeDelaySeconds: 5,
        scheduledResumeSource: "callback_ticket_monitor",
        scheduledWaitingStatus: "waiting_callback",
        scheduledResumeScheduledAt: "2026-03-18T10:00:00Z",
        scheduledResumeDueAt: "2026-03-18T10:05:00Z",
        scheduledResumeRequeuedAt: "2026-03-18T10:06:00Z",
        scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor"
      })
    ).toContainEqual({
      kind: "scheduled_resume_pending",
      label: "scheduled resume requeued",
      detail:
        `waiting resume monitor already requeued the stalled resume · callback_ticket_monitor · waiting_callback · scheduled ${scheduledAt} · due ${dueAt} · overdue · requeued by scheduler_waiting_resume_monitor · ${requeuedAt}`
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

  it("在 chips 中把 requeued resume 单独标出来，而不是继续标 overdue", () => {
    const chips = listCallbackWaitingChips({
      lifecycle: createLifecycle(),
      scheduledResumeDelaySeconds: 5,
      scheduledResumeDueAt: "2026-03-18T10:05:00Z",
      scheduledResumeRequeuedAt: "2026-03-18T10:06:00Z",
      scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor"
    });

    expect(chips).toContain("requeued");
    expect(chips).not.toContain("resume overdue");
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

  it("当 scheduled resume 已被重入队时，建议先观察这次 requeue", () => {
    expect(
      getCallbackWaitingRecommendedAction({
        scheduledResumeDelaySeconds: 5,
        scheduledResumeScheduledAt: "2026-03-18T10:00:00Z",
        scheduledResumeDueAt: "2026-03-18T10:05:00Z",
        scheduledResumeRequeuedAt: "2026-03-18T10:06:00Z",
        scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor"
      })
    ).toMatchObject({
      kind: "watch_scheduled_resume",
      label: "Watch the requeued resume",
      ctaLabel: "Open waiting inbox"
    });
  });

  it("把 waiting resume monitor 的 scheduler health 接到 blocker rows", () => {
    const rows = listCallbackWaitingBlockerRows({
      scheduledResumeDelaySeconds: 5,
      scheduledResumeScheduledAt: "2026-03-18T10:00:00Z",
      scheduledResumeDueAt: "2026-03-18T10:05:00Z",
      callbackWaitingAutomation: {
        status: "partial",
        scheduler_required: true,
        detail: "`WAITING_CALLBACK` 只完成了部分后台补偿配置。",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "waiting resume monitor 最近没有成功执行。",
        steps: [
          {
            key: "waiting_resume_monitor",
            label: "Requeue due waiting callbacks",
            task: "runtime.monitor_waiting_resumes",
            source: "scheduler_waiting_resume_monitor",
            enabled: true,
            interval_seconds: 30,
            detail: "周期扫描到期的 waiting callback。",
            scheduler_health: {
              health_status: "degraded",
              detail: "最近执行事实已超过调度窗口。",
              last_status: "succeeded",
              last_started_at: null,
              last_finished_at: "2026-03-18T09:00:00Z",
              matched_count: 0,
              affected_count: 0
            }
          }
        ]
      }
    });

    expect(rows).toContainEqual(
      expect.objectContaining({
        label: "Automation",
        value: expect.stringContaining("Requeue due waiting callbacks: degraded")
      })
    );
  });

  it("在 blocker rows 里展示最近一次 scheduled resume requeue", () => {
    const requeuedAt = formatTimestamp("2026-03-18T10:06:00Z");

    const rows = listCallbackWaitingBlockerRows({
      scheduledResumeDelaySeconds: 5,
      scheduledResumeRequeuedAt: "2026-03-18T10:06:00Z",
      scheduledResumeRequeueSource: "scheduler_waiting_resume_monitor"
    });

    expect(rows).toContainEqual({
      label: "Latest requeue",
      value: `requeued by scheduler_waiting_resume_monitor · ${requeuedAt}`
    });
  });

  it("在 resume blocker 有 scheduler 问题时补 scheduler chip", () => {
    expect(
      listCallbackWaitingChips({
        lifecycle: createLifecycle(),
        scheduledResumeDelaySeconds: 5,
        scheduledResumeDueAt: "2026-03-18T10:05:00Z",
        callbackWaitingAutomation: {
          status: "configured",
          scheduler_required: true,
          detail: "`WAITING_CALLBACK` 后台补偿链路已完成配置。",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "至少一个步骤缺少最近执行事实。",
          steps: []
        }
      })
    ).toContain("scheduler degraded");
  });

  it("把 observe-first 动作统一标记为 optional override 标题", () => {
    const surfaceCopy = buildCallbackWaitingSummarySurfaceCopy();

    expect(isObserveFirstCallbackWaitingAction("monitor_callback")).toBe(true);
    expect(isObserveFirstCallbackWaitingAction("watch_scheduled_resume")).toBe(true);
    expect(isObserveFirstCallbackWaitingAction("manual_resume")).toBe(false);
    expect(
      buildCallbackWaitingInlineActionTitle({
        actionKind: "watch_scheduled_resume",
        surfaceCopy
      })
    ).toBe(surfaceCopy.optionalInlineActionTitle);
  });

  it("把 observe-first 和 preferred action 提示统一收口到 shared surface", () => {
    const surfaceCopy = buildCallbackWaitingSummarySurfaceCopy();

    expect(
      buildCallbackWaitingInlineActionStatusHint({
        actionKind: "monitor_callback",
        surfaceCopy
      })
    ).toBe(surfaceCopy.monitorCallbackStatusHint);
    expect(
      buildCallbackWaitingInlineActionStatusHint({
        actionKind: "manual_resume",
        preferredAction: "cleanup",
        surfaceCopy
      })
    ).toBe(surfaceCopy.preferredCleanupStatusHint);
  });
});
