import { describe, expect, it } from "vitest";

import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";
import { buildSensitiveAccessBlockedSurfaceCopy } from "@/lib/sensitive-access-presenters";

function buildBlockedPayload(
  overrides?: Partial<SensitiveAccessBlockingPayload>
): SensitiveAccessBlockingPayload {
  return {
    detail: "Export is guarded by sensitive access control.",
    resource: {
      id: "resource-1",
      label: "Publish invocation export",
      description: "Protected export payload",
      sensitivity_level: "L3",
      source: "workspace_resource",
      metadata: {}
    },
    access_request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "human",
      requester_id: "ops-reviewer",
      resource_id: "resource-1",
      action_type: "read",
      decision: "require_approval",
      reason_code: "approval_required_high_sensitive_access",
      policy_summary: null
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "审批票据仍在等待处理。",
      follow_up: "先处理审批票据，再重试导出。"
    },
    run_snapshot: null,
    run_follow_up: null,
    ...overrides
  };
}

describe("sensitive access presenters", () => {
  it("builds approval-blocked export copy from fresh blocking evidence", () => {
    expect(
      buildSensitiveAccessBlockedSurfaceCopy({
        surfaceLabel: "Publish activity export",
        payload: buildBlockedPayload()
      })
    ).toEqual({
      title: "Publish activity export waiting on approval",
      summary:
        "当前 Publish activity export 已接入统一敏感访问控制；导出动作不会绕过审批、通知与 run follow-up 事实链。当前信号：审批票据仍在等待处理。"
    });
  });

  it("prefers notification delivery status when approval is already resolved", () => {
    const basePayload = buildBlockedPayload();

    expect(
      buildSensitiveAccessBlockedSurfaceCopy({
        surfaceLabel: "Trace export",
        payload: buildBlockedPayload({
          access_request: {
            ...basePayload.access_request,
            decision: "allow"
          },
          approval_ticket: {
            ...basePayload.approval_ticket!,
            status: "approved",
            waiting_status: null
          },
          notifications: [
            {
              id: "notification-1",
              approval_ticket_id: "ticket-1",
              channel: "in_app",
              target: "ops",
              status: "failed"
            }
          ],
          outcome_explanation: null,
          run_follow_up: {
            affectedRunCount: 1,
            sampledRunCount: 0,
            waitingRunCount: 0,
            runningRunCount: 0,
            succeededRunCount: 0,
            failedRunCount: 1,
            unknownRunCount: 0,
            sampledRuns: [],
            explanation: {
              primary_signal: "审批已通过，但通知补链仍失败。",
              follow_up: "先修复通知补链，再回到导出入口。"
            }
          }
        })
      })
    ).toEqual({
      title: "Trace export blocked by notification delivery",
      summary:
        "当前 Trace export 已接入统一敏感访问控制；导出动作不会绕过审批、通知与 run follow-up 事实链。当前信号：审批已通过，但通知补链仍失败。"
    });
  });

  it("falls back to policy summary when no runtime signal is available", () => {
    const basePayload = buildBlockedPayload();

    expect(
      buildSensitiveAccessBlockedSurfaceCopy({
        surfaceLabel: "Publish activity export",
        payload: buildBlockedPayload({
          access_request: {
            ...basePayload.access_request,
            decision: "deny",
            policy_summary: "高敏资源导出必须经过人工复核。"
          },
          approval_ticket: null,
          outcome_explanation: null
        })
      })
    ).toEqual({
      title: "Publish activity export blocked by sensitive access policy",
      summary:
        "当前 Publish activity export 已接入统一敏感访问控制；导出动作不会绕过审批、通知与 run follow-up 事实链。当前策略：高敏资源导出必须经过人工复核。"
    });
  });

  it("preserves explicit title and summary overrides", () => {
    expect(
      buildSensitiveAccessBlockedSurfaceCopy({
        surfaceLabel: "Publish activity export",
        payload: buildBlockedPayload(),
        title: "Custom blocked title",
        summary: "Custom blocked summary"
      })
    ).toEqual({
      title: "Custom blocked title",
      summary: "Custom blocked summary"
    });
  });
});
