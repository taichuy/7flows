import { describe, expect, it } from "vitest";

import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import {
  buildSensitiveAccessBlockedRecommendedNextStep,
  buildSensitiveAccessBlockedSurfaceCopy,
  buildSensitiveAccessTimelineSurfaceCopy
} from "@/lib/sensitive-access-presenters";

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

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 1,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: false,
        backend_ids: [],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason: "No compatible sandbox backend is available."
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["builtin"],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false,
    affected_run_count: 4,
    affected_workflow_count: 1,
    primary_blocker_kind: "execution_class_blocked",
    recommended_action: {
      kind: "open_workflow_library",
      label: "Open workflow library",
      href: "/workflows?execution=sandbox",
      entry_key: "workflowLibrary"
    }
  };
}

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "degraded",
    scheduler_required: true,
    detail: "callback waiting automation degraded",
    scheduler_health_status: "degraded",
    scheduler_health_detail: "scheduler lagging",
    steps: [],
    affected_run_count: 3,
    affected_workflow_count: 2,
    primary_blocker_kind: "scheduler_unhealthy",
    recommended_action: {
      kind: "open_run_library",
      label: "Open run library",
      href: "/runs?status=callback_waiting",
      entry_key: "runLibrary"
    }
  };
}

describe("sensitive access presenters", () => {
  it("provides shared timeline copy for execution and publish surfaces", () => {
    expect(
      buildSensitiveAccessTimelineSurfaceCopy({
        surface: "execution_node"
      })
    ).toEqual({
      title: "Sensitive access timeline",
      description: expect.stringContaining("without leaving the execution node"),
      emptyState: "当前这个 execution node 没有关联 sensitive access timeline。",
      inboxLinkLabel: "open inbox slice"
    });

    expect(
      buildSensitiveAccessTimelineSurfaceCopy({
        surface: "publish_invocation"
      })
    ).toEqual({
      title: "Approval timeline",
      description: expect.stringContaining("published-surface debugging"),
      emptyState: "当前这次 invocation 没有关联 sensitive access timeline。",
      inboxLinkLabel: "open approval inbox slice"
    });

    expect(
      buildSensitiveAccessTimelineSurfaceCopy({
        surface: "publish_blocking_invocation",
        blockingNodeRunId: "node-run-blocked"
      })
    ).toEqual({
      title: "Blocking approval timeline",
      description: expect.stringContaining("node-run-blocked"),
      emptyState: "当前阻塞节点没有关联 sensitive access timeline。",
      inboxLinkLabel: "open blocker inbox slice"
    });
  });

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

  it("复用共享 operator CTA labels，避免 sensitive access 入口 copy 再次漂移", () => {
    const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

    expect(
      buildSensitiveAccessTimelineSurfaceCopy({
        surface: "execution_node"
      }).inboxLinkLabel
    ).toBe(operatorSurfaceCopy.openInboxSliceLabel);

    expect(
      buildSensitiveAccessBlockedRecommendedNextStep({
        inboxHref: "/sensitive-access/inbox",
        runId: "run-1",
        outcomeExplanation: {
          primary_signal: "审批票据仍在等待处理。",
          follow_up: "先处理审批票据，再重试导出。"
        }
      })
    ).toMatchObject({
      href: "/sensitive-access/inbox",
      href_label: operatorSurfaceCopy.openInboxSliceLabel
    });

    expect(
      buildSensitiveAccessBlockedRecommendedNextStep({
        runId: "run-1"
      })
    ).toMatchObject({
      href: "/runs/run-1",
      href_label: operatorSurfaceCopy.openRunLabel
    });

    expect(
      buildSensitiveAccessBlockedRecommendedNextStep({
        currentHref:
          "/workflows/workflow-1?needs_follow_up=true&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        runId: "run-1",
        runHref:
          "/runs/run-1?needs_follow_up=true&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
      })
    ).toMatchObject({
      href: "/runs/run-1?needs_follow_up=true&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
      href_label: operatorSurfaceCopy.openRunLabel
    });
  });

  it("没有稳定 CTA 或导航目标时，不再把 follow_up 单独投影成 next-step 卡片", () => {
    expect(
      buildSensitiveAccessBlockedRecommendedNextStep({
        outcomeExplanation: {
          primary_signal: "审批票据仍在等待处理。",
          follow_up: "先处理审批票据，再重试导出。"
        }
      })
    ).toBeNull();
  });

  it("callback waiting 仍活跃且本地 action 缺失时，优先复用 shared callback recovery contract", () => {
    expect(
      buildSensitiveAccessBlockedRecommendedNextStep({
        inboxHref: "/sensitive-access/inbox?status=pending",
        runId: "run-1",
        primaryResourceSummary: "OpenAI Prod Key · L3 治理 · 生效中",
        outcomeExplanation: {
          primary_signal: "审批票据仍在等待处理。",
          follow_up: "本地 callback follow-up：先处理审批票据，再观察 waiting。"
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        callbackWaitingActive: true
      })
    ).toMatchObject({
      label: "callback recovery",
      href: "/runs?status=callback_waiting",
      href_label: "Open run library",
      primaryResourceSummary: "OpenAI Prod Key · L3 治理 · 生效中",
      detail:
        "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。"
    });
  });

  it("shared callback recovery 不会抢过 live sandbox readiness", () => {
    expect(
      buildSensitiveAccessBlockedRecommendedNextStep({
        inboxHref: "/sensitive-access/inbox?status=pending",
        runId: "run-1",
        outcomeExplanation: {
          primary_signal: "审批票据仍在等待处理。",
          follow_up: "本地 callback follow-up：先处理审批票据，再观察 waiting。"
        },
        runSnapshot: {
          status: "failed",
          executionFocusReason: "blocked_execution",
          executionFocusNodeType: "tool",
          executionFocusExplanation: {
            primary_signal: "当前 focus 节点因强隔离 backend 不可用而阻断。",
            follow_up: "先恢复兼容 backend，再重新调度该节点。"
          },
          executionFocusToolCalls: [
            {
              id: "tool-call-1",
              tool_id: "sandbox.tool",
              tool_name: "Sandbox Tool",
              status: "failed",
              requested_execution_class: "sandbox",
              effective_execution_class: "inline",
              execution_blocking_reason: "No compatible sandbox backend is available."
            }
          ]
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        callbackWaitingActive: true,
        sandboxReadiness: buildSandboxReadiness()
      })
    ).toMatchObject({
      label: "sandbox readiness",
      href: "/workflows?execution=sandbox",
      href_label: "Open workflow library",
      detail:
        "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。"
    });
  });

  it("命中强隔离阻断时优先复用 live sandbox readiness CTA", () => {
    const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

    expect(
      buildSensitiveAccessBlockedRecommendedNextStep({
        inboxHref: "/sensitive-access/inbox?status=pending",
        runId: "run-1",
        outcomeExplanation: {
          primary_signal: "审批票据仍在等待处理。",
          follow_up: "先处理审批票据，再重试导出。"
        },
        runSnapshot: {
          status: "failed",
          executionFocusReason: "blocked_execution",
          executionFocusNodeType: "tool",
          executionFocusExplanation: {
            primary_signal: "当前 focus 节点因强隔离 backend 不可用而阻断。",
            follow_up: "先恢复兼容 backend，再重新调度该节点。"
          },
          executionFocusToolCalls: [
            {
              id: "tool-call-1",
              tool_id: "sandbox.tool",
              tool_name: "Sandbox Tool",
              status: "failed",
              requested_execution_class: "sandbox",
              effective_execution_class: "inline",
              execution_blocking_reason: "No compatible sandbox backend is available."
            }
          ]
        },
        sandboxReadiness: buildSandboxReadiness()
      })
    ).toMatchObject({
      label: "sandbox readiness",
      href: "/workflows?execution=sandbox",
      href_label: "Open workflow library",
      detail:
        "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。"
    });

    expect(operatorSurfaceCopy.openInboxSliceLabel).not.toBe("Open workflow library");
  });
});
