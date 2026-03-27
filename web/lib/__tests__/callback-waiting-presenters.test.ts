import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CallbackWaitingLifecycleSummary } from "../get-run-views";
import {
  buildCallbackWaitingApprovalRecommendedAction,
  buildCallbackWaitingInlineActionStatusHint,
  buildCallbackWaitingInlineActionTitle,
  buildCallbackWaitingRecommendedNextStep,
  buildCallbackWaitingSummarySurfaceCopy,
  formatCallbackWaitingSensitiveAccessSummary,
  formatScheduledResumeLabel,
  getCallbackWaitingRecommendedAction,
  isObserveFirstCallbackWaitingAction,
  listCallbackWaitingBlockerRows,
  listCallbackWaitingChips,
  listCallbackWaitingOperatorStatuses
} from "../callback-waiting-presenters";
import { formatTimestamp } from "../runtime-presenters";

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

  it("在只有敏感访问 summary 时也给出稳定 inbox CTA", () => {
    expect(
      getCallbackWaitingRecommendedAction({
        sensitiveAccessSummary: {
          request_count: 1,
          approval_ticket_count: 1,
          pending_approval_count: 1,
          approved_approval_count: 0,
          rejected_approval_count: 0,
          expired_approval_count: 0,
          pending_notification_count: 0,
          delivered_notification_count: 0,
          failed_notification_count: 0,
          primary_resource: null
        }
      })
    ).toMatchObject({
      kind: "open_inbox",
      label: "Open inbox slice first",
      ctaLabel: "Open approval inbox"
    });
  });

  it("把 approval waiting 的 callback 动作映射成稳定 approval blocker CTA", () => {
    expect(
      buildCallbackWaitingApprovalRecommendedAction({
        action: {
          kind: "resolve_inline_sensitive_access",
          label: "Handle approval here first",
          detail:
            "1 approval is still pending, so resume should start from approval handling instead of retrying the run."
        },
        inboxHref: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1"
      })
    ).toEqual({
      kind: "approval blocker",
      entry_key: "operatorInbox",
      href: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
      label: "Open approval inbox"
    });
  });

  it("在 callback waiting sensitive access 摘要里带出凭据治理信息", () => {
    expect(
      formatCallbackWaitingSensitiveAccessSummary({
        request: {
          id: "request-1",
          requester_type: "tool",
          requester_id: "native.search",
          resource_id: "resource-1",
          action_type: "invoke",
          decision: "require_approval",
          decision_label: null,
          reason_code: "approval_required_high_sensitive_access",
          reason_label: null,
          policy_summary: "High-sensitivity credential use requires approval.",
          created_at: "2026-03-18T10:00:00Z"
        },
        resource: {
          id: "resource-1",
          label: "Credential · Ops Key",
          sensitivity_level: "L3",
          source: "credential",
          metadata: {},
          credential_governance: {
            credential_id: "cred-ops-key",
            credential_name: "Ops Key",
            credential_type: "api_key",
            credential_status: "active",
            sensitivity_level: "L3",
            sensitive_resource_id: "resource-1",
            sensitive_resource_label: "Credential · Ops Key",
            credential_ref: "credential://cred-ops-key",
            summary: "本次命中的凭据是 Ops Key（api_key）；当前治理级别 L3，状态 生效中。"
          },
          created_at: "2026-03-18T10:00:00Z",
          updated_at: "2026-03-18T10:00:00Z"
        },
        notifications: []
      })
    ).toContain("Ops Key · L3 治理 · 生效中");
  });

  it("没有稳定 CTA 时，不把裸 follow_up 投影成 recommended next step", () => {
    expect(
      buildCallbackWaitingRecommendedNextStep({
        operatorFollowUp: "先继续观察 callback ticket 是否真正被消费。"
      })
    ).toBeNull();
  });

  it("把 primary governed resource 透传给 callback waiting next step", () => {
    expect(
      buildCallbackWaitingRecommendedNextStep({
        action: {
          kind: "open_inbox",
          label: "Open inbox slice first",
          detail: "1 approval is still pending, so resume should start from approval handling.",
          ctaLabel: "Open approval inbox"
        },
        inboxHref: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
        primaryResourceSummary: "OpenAI Production Key · L3 治理 · 生效中"
      })
    ).toEqual({
      label: "Open inbox slice first",
      detail: "1 approval is still pending, so resume should start from approval handling.",
      href: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
      href_label: "Open approval inbox",
      primaryResourceSummary: "OpenAI Production Key · L3 治理 · 生效中"
    });
  });

  it("暴露 callback waiting 共享 surface copy", () => {
    expect(buildCallbackWaitingSummarySurfaceCopy()).toMatchObject({
      recommendedNextStepTitle: "Recommended next step",
      defaultInboxLinkLabel: "open inbox slice",
      callbackFollowUpLabel: "callback waiting follow-up",
      manualOverrideOptionalLabel: "manual override optional",
      waitingNodeFocusEvidenceTitle: "Waiting node focus evidence",
      focusedSkillTraceTitle: "Focused skill trace",
      injectedReferencesTitle: "Injected references",
      terminatedLabel: "callback waiting terminated",
      reviewTimelineFallbackDetail:
        "Review the callback waiting timeline before forcing another resume."
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

  it("在缺少本地 recommended action 时回退到 system overview callback recovery contract", () => {
    expect(
      buildCallbackWaitingRecommendedNextStep({
        action: null,
        callbackWaitingAutomation: {
          status: "partial",
          scheduler_required: true,
          detail: "callback automation degraded",
          scheduler_health_status: "degraded",
          scheduler_health_detail: "waiting resume monitor degraded",
          affected_run_count: 3,
          affected_workflow_count: 2,
          primary_blocker_kind: "scheduler_unhealthy",
          recommended_action: {
            kind: "open_run_library",
            label: "Open run library",
            href: "/runs?focus=callback-waiting",
            entry_key: "runLibrary"
          },
          steps: []
        },
        operatorFollowUp: null
      })
    ).toEqual({
      label: "callback recovery",
      detail:
        "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。",
      href: "/runs?focus=callback-waiting",
      href_label: "Open run library"
    });
  });
});
