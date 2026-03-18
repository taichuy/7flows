import { describe, expect, it } from "vitest";

import {
  formatPublishedInvocationWaitingFollowUp,
  formatPublishedInvocationWaitingHeadline,
  listPublishedInvocationSensitiveAccessChips,
  listPublishedInvocationSensitiveAccessRows
} from "./published-invocation-presenters";

describe("published invocation presenters", () => {
  it("把 approval 与 notification blocker 聚合成 chips", () => {
    expect(
      listPublishedInvocationSensitiveAccessChips({
        request_count: 1,
        approval_ticket_count: 1,
        pending_approval_count: 1,
        approved_approval_count: 0,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 1
      })
    ).toEqual(["1 approval pending", "1 notification retry"]);
  });

  it("输出活动列表需要的 blocker rows", () => {
    expect(
      listPublishedInvocationSensitiveAccessRows({
        request_count: 2,
        approval_ticket_count: 2,
        pending_approval_count: 1,
        approved_approval_count: 1,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 1,
        failed_notification_count: 1
      })
    ).toEqual([
      {
        label: "Sensitive access",
        value: "2 requests · 2 approval tickets"
      },
      {
        label: "Approval blockers",
        value: "1 pending · 1 approved"
      },
      {
        label: "Notification delivery",
        value: "1 delivered · 1 failed"
      }
    ]);
  });

  it("优先使用后端下发的 waiting primary signal", () => {
    expect(
      formatPublishedInvocationWaitingHeadline({
        explanation: {
          primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
          follow_up: "先处理审批，再观察 waiting 节点是否恢复。"
        },
        fallbackHeadline: "fallback headline",
        nodeRunId: "node-run-1",
        nodeStatus: "waiting_callback"
      })
    ).toBe("当前 callback waiting 仍卡在 1 条待处理审批。");
    expect(
      formatPublishedInvocationWaitingFollowUp({
        primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
        follow_up: "  先处理审批，再观察 waiting 节点是否恢复。  "
      })
    ).toBe("先处理审批，再观察 waiting 节点是否恢复。");
  });

  it("在没有后端解释时回退到既有 waiting headline", () => {
    expect(
      formatPublishedInvocationWaitingHeadline({
        explanation: null,
        fallbackHeadline: "callback lifecycle fallback",
        nodeRunId: "node-run-1",
        nodeStatus: "waiting_callback"
      })
    ).toBe("callback lifecycle fallback");

    expect(
      formatPublishedInvocationWaitingHeadline({
        explanation: null,
        fallbackHeadline: null,
        nodeRunId: "node-run-1",
        nodeStatus: "waiting_callback"
      })
    ).toBe("node run node-run-1 is still waiting_callback.");
    expect(formatPublishedInvocationWaitingFollowUp(null)).toBeNull();
  });
});
