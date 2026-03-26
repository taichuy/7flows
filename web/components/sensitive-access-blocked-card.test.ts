import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SensitiveAccessBlockedCard } from "@/components/sensitive-access-blocked-card";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

let mockPathname = "/workflows/workflow-1";
let mockSearchParams = "";
const sensitiveAccessInlineActionProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearchParams)
}));

vi.mock("@/components/sensitive-access-inline-actions", () => ({
  SensitiveAccessInlineActions: (props: Record<string, unknown>) => {
    sensitiveAccessInlineActionProps.push(props);
    return createElement("div", { "data-testid": "sensitive-access-inline-actions" });
  }
}));

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

describe("SensitiveAccessBlockedCard", () => {
  beforeEach(() => {
    mockPathname = "/workflows/workflow-1";
    mockSearchParams = "";
    sensitiveAccessInlineActionProps.length = 0;
  });

  it("renders canonical follow-up and run snapshot evidence", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Published invocation detail requires approval before the payload can be viewed.",
      resource: {
        id: "resource-1",
        label: "Credential · Invocation Detail Key",
        description: "Sensitive published invocation detail",
        sensitivity_level: "L3",
        source: "credential",
        credential_governance: {
          credential_id: "cred-1",
          credential_name: "Invocation Detail Key",
          credential_type: "api_key",
          credential_status: "active",
          sensitivity_level: "L3",
          sensitive_resource_id: "resource-1",
          sensitive_resource_label: "Credential · Invocation Detail Key",
          credential_ref: "credential://cred-1",
          summary: "本次命中的凭据是 Invocation Detail Key（api_key）；当前治理级别 L3，状态 生效中。"
        },
        metadata: {
          run_id: "run-1",
          invocation_id: "invocation-1"
        }
      },
      access_request: {
        id: "request-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-1",
        action_type: "read",
        decision: "require_approval"
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
      notifications: [
        {
          id: "notification-1",
          approval_ticket_id: "ticket-1",
          channel: "in_app",
          target: "sensitive-access-inbox",
          status: "pending"
        }
      ],
      outcome_explanation: {
        primary_signal: "当前阻断来自敏感访问审批票据。",
        follow_up: "下一步：优先处理审批票据，再观察 waiting 节点是否恢复。"
      },
      run_snapshot: {
        status: "waiting",
        currentNodeId: "agent_review",
        executionFocusNodeId: "agent_review",
        executionFocusNodeRunId: "node-run-1",
        executionFocusNodeName: "Agent Review",
        executionFocusExplanation: {
          primary_signal: "当前 focus node 仍在等待审批阻断解除。",
          follow_up: "审批通过后继续观察 review 节点。"
        }
      },
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-1：当前 run 状态：waiting。"
        },
        sampledRuns: [
          {
            runId: "run-1",
            snapshot: {
              status: "waiting",
              currentNodeId: "agent_review",
              waitingReason: "approval pending",
              executionFocusNodeId: "agent_review",
              executionFocusNodeRunId: "node-run-1",
              executionFocusNodeName: "Agent Review",
              callbackWaitingExplanation: {
                primary_signal: "当前 sampled run 仍在等待审批。",
                follow_up: "优先完成审批后再继续观察恢复。"
              },
              executionFocusArtifactCount: 1,
              executionFocusArtifactRefCount: 1,
              executionFocusToolCallCount: 1,
              executionFocusRawRefCount: 1,
              executionFocusArtifactRefs: ["artifact://approval-1"],
              executionFocusToolCalls: [
                {
                  id: "tool-call-1",
                  tool_id: "approval.tool",
                  tool_name: "Approval Tool",
                  phase: "waiting_approval",
                  status: "waiting",
                  response_summary: "审批阻断前已保留最近一次工具调用摘要。",
                  raw_ref: "raw://approval-tool-1"
                }
              ]
            }
          }
        ]
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    expect(html).toContain("Canonical follow-up");
    expect(html).toContain("本次影响 1 个 run");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("open inbox slice");
    expect(html).toContain(
      "Primary governed resource: Credential · Invocation Detail Key · L3 治理 · 生效中."
    );
    expect(html).toContain("审批通过后继续观察 review 节点");
    expect(html).not.toContain("当前阻断来自敏感访问审批票据");
    expect(html).toContain("Run status");
    expect(html).toContain("waiting");
    expect(html).toContain("Focus node");
    expect(html).toContain("Agent Review");
    expect(html).toContain("sampled 1");
    expect(html).toContain("still waiting 1");
    expect(html).toContain("/runs/run-1");
  });

  it("passes workflow governance handoff into blocked callback summary props", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Blocked export still needs workflow governance follow-up.",
      resource: {
        id: "resource-blocked",
        label: "Trace export",
        description: "Sensitive workflow trace export",
        sensitivity_level: "L3",
        source: "workspace_resource",
        metadata: {}
      },
      access_request: {
        id: "request-blocked",
        run_id: "run-blocked",
        node_run_id: "node-run-blocked",
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-blocked",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-blocked",
        access_request_id: "request-blocked",
        run_id: "run-blocked",
        node_run_id: "node-run-blocked",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [],
      outcome_explanation: {
        primary_signal: "当前阻断仍需要先处理审批。",
        follow_up: "处理审批后，还要回到 workflow governance 入口补齐定义问题。"
      },
      run_snapshot: null,
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；sampled run 已暴露 workflow governance blocker。",
          follow_up: "先处理审批，再回到 workflow detail 补齐 catalog gap 和 publish auth。"
        },
        sampledRuns: [
          {
            runId: "run-blocked",
            snapshot: {
              workflowId: "workflow-blocked",
              status: "waiting",
              currentNodeId: "approval_wait",
              executionFocusNodeId: "approval_wait",
              executionFocusNodeRunId: "node-run-blocked",
              executionFocusNodeName: "Approval Wait"
            },
            toolGovernance: {
              referenced_tool_ids: ["native.blocked-gap"],
              missing_tool_ids: ["native.blocked-gap"],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            },
            legacyAuthGovernance:
              buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                binding: {
                  workflow_id: "workflow-blocked",
                  workflow_name: "Workflow Blocked"
                }
              })
          }
        ]
      }
    };

    renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    const callbackWaitingSummaryProps = (sensitiveAccessInlineActionProps[0]?.callbackWaitingSummaryProps ??
      null) as Record<string, unknown> | null;

    expect(callbackWaitingSummaryProps).not.toBeNull();
    expect(callbackWaitingSummaryProps).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.blocked-gap",
      workflowCatalogGapHref: "/workflows/workflow-blocked?definition_issue=missing_tool",
      workflowGovernanceHref: "/workflows/workflow-blocked?definition_issue=legacy_publish_auth",
      legacyAuthHandoff: {
        bindingChipLabel: "1 legacy bindings",
        statusChipLabel: "publish auth blocker"
      }
    });
    expect(String(callbackWaitingSummaryProps?.workflowCatalogGapDetail ?? "")).toContain(
      "当前 sensitive-access callback summary 对应的 workflow 版本仍有 catalog gap（native.blocked-gap）"
    );
  });

  it("keeps workspace-starter query scope on blocked callback summary workflow links", () => {
    mockSearchParams =
      "needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92";

    const payload: SensitiveAccessBlockingPayload = {
      detail: "Published invocation detail requires approval before the payload can be viewed.",
      resource: {
        id: "resource-scoped",
        label: "Credential · Invocation Detail Key",
        description: "Sensitive published invocation detail",
        sensitivity_level: "L3",
        source: "credential",
        metadata: {
          run_id: "run-blocked"
        }
      },
      access_request: {
        id: "request-scoped",
        run_id: "run-blocked",
        node_run_id: "node-run-blocked",
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-scoped",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-scoped",
        access_request_id: "request-scoped",
        run_id: "run-blocked",
        node_run_id: "node-run-blocked",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [],
      outcome_explanation: {
        primary_signal: "当前阻断仍需要先处理审批。",
        follow_up: "处理审批后，还要回到 workflow governance 入口补齐定义问题。"
      },
      run_snapshot: null,
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；sampled run 已暴露 workflow governance blocker。",
          follow_up: "先处理审批，再回到 workflow detail 补齐 catalog gap 和 publish auth。"
        },
        sampledRuns: [
          {
            runId: "run-blocked",
            snapshot: {
              workflowId: "workflow-blocked",
              status: "waiting",
              currentNodeId: "approval_wait",
              executionFocusNodeId: "approval_wait",
              executionFocusNodeRunId: "node-run-blocked",
              executionFocusNodeName: "Approval Wait"
            },
            toolGovernance: {
              referenced_tool_ids: ["native.blocked-gap"],
              missing_tool_ids: ["native.blocked-gap"],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            },
            legacyAuthGovernance:
              buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                binding: {
                  workflow_id: "workflow-blocked",
                  workflow_name: "Workflow Blocked"
                }
              })
          }
        ]
      }
    };

    renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    const callbackWaitingSummaryProps = (sensitiveAccessInlineActionProps[0]?.callbackWaitingSummaryProps ??
      null) as Record<string, unknown> | null;

    expect(callbackWaitingSummaryProps).toMatchObject({
      workflowCatalogGapHref:
        "/workflows/workflow-blocked?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=missing_tool",
      workflowGovernanceHref:
        "/workflows/workflow-blocked?needs_follow_up=true&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&definition_issue=legacy_publish_auth"
    });
  });

  it("falls back to sampled run context when request and ticket run_id are missing", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Published invocation export requires approval before the payload can be downloaded.",
      resource: {
        id: "resource-2",
        label: "Invocation Export",
        description: "Sensitive published invocation export",
        sensitivity_level: "L3",
        source: "workspace_resource",
        metadata: {
          run_ids: ["run-sampled-1"]
        }
      },
      access_request: {
        id: "request-2",
        run_id: null,
        node_run_id: null,
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-2",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-2",
        access_request_id: "request-2",
        run_id: null,
        node_run_id: "node-run-sampled",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [],
      outcome_explanation: {
        primary_signal: "当前阻断来自 metadata-only run_ids 的敏感访问审批。",
        follow_up: "下一步：先处理审批票据，再回看 sampled run 的 waiting 事实。"
      },
      run_snapshot: null,
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-sampled-1：当前 run 状态：waiting。"
        },
        sampledRuns: [
          {
            runId: "run-sampled-1",
            snapshot: {
              status: "waiting",
              currentNodeId: "export_wait",
              waitingReason: "approval pending",
              executionFocusNodeId: "export_wait",
              executionFocusNodeRunId: "node-run-sampled",
              executionFocusNodeName: "Export Wait"
            }
          }
        ]
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    expect(html).toContain("/runs/run-sampled-1");
    expect(html).toContain("run_id=run-sampled-1");
  });

  it("keeps workspace starter scope on blocked-card run drilldown links", () => {
    mockSearchParams =
      "track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&needs_follow_up=true";

    const payload: SensitiveAccessBlockingPayload = {
      detail: "Blocked export still needs approval.",
      resource: {
        id: "resource-scope-1",
        label: "Trace export",
        description: "Scoped trace export",
        sensitivity_level: "L3",
        source: "workspace_resource",
        metadata: {
          run_id: "run-1"
        }
      },
      access_request: {
        id: "request-scope-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-scope-1",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-scope-1",
        access_request_id: "request-scope-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [],
      outcome_explanation: {
        primary_signal: "审批票据仍在等待处理。",
        follow_up: "先处理审批票据，再继续回看 scoped run detail。"
      },
      run_snapshot: {
        status: "waiting",
        currentNodeId: "approval_wait",
        executionFocusNodeId: "approval_wait",
        executionFocusNodeRunId: "node-run-1",
        executionFocusNodeName: "Approval Wait"
      },
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 1,
        waitingRunCount: 1,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "优先留在当前 workspace starter scope 继续排障。"
        },
        sampledRuns: [
          {
            runId: "run-sampled-1",
            snapshot: {
              status: "waiting",
              currentNodeId: "approval_wait",
              executionFocusNodeId: "approval_wait",
              executionFocusNodeRunId: "node-run-sampled-1",
              executionFocusNodeName: "Approval Wait"
            }
          }
        ]
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    expect(html).toContain(
      "/runs/run-1?needs_follow_up=true&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(html).toContain(
      "/runs/run-sampled-1?needs_follow_up=true&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );

    mockSearchParams = "";
  });

  it("keeps approval inbox CTA in callback waiting summaries when canonical action is missing", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Published invocation detail requires approval before the payload can be viewed.",
      resource: {
        id: "resource-2b",
        label: "Invocation Detail",
        description: "Sensitive published invocation detail",
        sensitivity_level: "L3",
        source: "workspace_resource",
        metadata: {
          run_id: "run-2b"
        }
      },
      access_request: {
        id: "request-2b",
        run_id: "run-2b",
        node_run_id: "node-run-2b",
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-2b",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-2b",
        access_request_id: "request-2b",
        run_id: "run-2b",
        node_run_id: "node-run-2b",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [
        {
          id: "notification-2b",
          approval_ticket_id: "ticket-2b",
          channel: "in_app",
          target: "sensitive-access-inbox",
          status: "pending"
        }
      ],
      outcome_explanation: {
        primary_signal: "审批票据仍在等待处理。",
        follow_up: "先处理审批票据，再观察 callback waiting 是否恢复。"
      },
      run_snapshot: {
        status: "waiting",
        currentNodeId: "approval_wait",
        waitingReason: "approval pending",
        callbackWaitingExplanation: {
          primary_signal: "当前 blocked run 仍在等待审批。",
          follow_up: "先处理审批票据，再观察 callback waiting 是否恢复。"
        },
        callbackWaitingLifecycle: {
          wait_cycle_count: 1,
          issued_ticket_count: 1,
          expired_ticket_count: 0,
          consumed_ticket_count: 0,
          canceled_ticket_count: 0,
          late_callback_count: 0,
          resume_schedule_count: 0,
          max_expired_ticket_count: 0,
          terminated: false,
          last_resume_backoff_attempt: 0
        },
        executionFocusNodeId: "approval_wait",
        executionFocusNodeRunId: "node-run-2b",
        executionFocusNodeName: "Approval Wait"
      },
      run_follow_up: {
        affectedRunCount: 2,
        sampledRunCount: 1,
        waitingRunCount: 2,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 0,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "本次影响 2 个 run；已回读 1 个样本。",
          follow_up: "当前主 run 与 sampled run 都还在等待审批。"
        },
        sampledRuns: [
          {
            runId: "run-2b-sampled",
            snapshot: {
              status: "waiting",
              currentNodeId: "approval_wait",
              waitingReason: "approval pending",
              callbackWaitingExplanation: {
                primary_signal: "sampled run 仍在等待审批。",
                follow_up: "处理审批后再观察 sampled run 的 callback waiting。"
              },
              callbackWaitingLifecycle: {
                wait_cycle_count: 1,
                issued_ticket_count: 1,
                expired_ticket_count: 0,
                consumed_ticket_count: 0,
                canceled_ticket_count: 0,
                late_callback_count: 0,
                resume_schedule_count: 0,
                max_expired_ticket_count: 0,
                terminated: false,
                last_resume_backoff_attempt: 0
              },
              executionFocusNodeId: "approval_wait",
              executionFocusNodeRunId: "node-run-2b-sampled",
              executionFocusNodeName: "Approval Wait"
            }
          }
        ]
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    expect((html.match(/approval blocker/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html.match(/Open approval inbox/g) ?? []).toHaveLength(4);
  });

  it("prefers live sandbox readiness CTA when the blocked run is fail-closed on strong isolation", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Published invocation detail requires approval before the payload can be viewed.",
      resource: {
        id: "resource-3",
        label: "Invocation Detail",
        description: "Sensitive published invocation detail",
        sensitivity_level: "L3",
        source: "workspace_resource",
        metadata: {
          run_id: "run-3"
        }
      },
      access_request: {
        id: "request-3",
        run_id: "run-3",
        node_run_id: "node-run-3",
        requester_type: "human",
        requester_id: "ops-reviewer",
        resource_id: "resource-3",
        action_type: "read",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-3",
        access_request_id: "request-3",
        run_id: "run-3",
        node_run_id: "node-run-3",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [],
      outcome_explanation: {
        primary_signal: "审批票据仍在等待处理。",
        follow_up: "先处理审批票据，再重试导出。"
      },
      run_snapshot: {
        status: "failed",
        currentNodeId: "sandbox_call",
        executionFocusReason: "blocked_execution",
        executionFocusNodeId: "sandbox_call",
        executionFocusNodeRunId: "node-run-3",
        executionFocusNodeName: "Sandbox Call",
        executionFocusNodeType: "tool",
        executionFocusExplanation: {
          primary_signal: "当前 focus 节点因强隔离 backend 不可用而阻断。",
          follow_up: "先恢复兼容 backend，再重新调度该节点。"
        },
        executionFocusToolCalls: [
          {
            id: "tool-call-3",
            tool_id: "sandbox.tool",
            tool_name: "Sandbox Tool",
            phase: "execute",
            status: "failed",
            requested_execution_class: "sandbox",
            effective_execution_class: "inline",
            execution_blocking_reason: "No compatible sandbox backend is available."
          }
        ]
      },
      run_follow_up: {
        affectedRunCount: 1,
        sampledRunCount: 0,
        waitingRunCount: 0,
        runningRunCount: 0,
        succeededRunCount: 0,
        failedRunCount: 1,
        unknownRunCount: 0,
        explanation: {
          primary_signal: "当前 sampled run 显示强隔离执行链路已 fail-closed。",
          follow_up: "先恢复兼容 backend，再重新调度该节点。"
        },
        sampledRuns: []
      }
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload,
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
    expect(html).toContain("优先回到 workflow library 处理强隔离 execution class 与隔离需求。");
    expect(html).toContain("Open workflow library");
    expect(html).not.toContain("approval blocker");
  });

  it("renders credential governance summary when blocked payload carries shared resource contract", () => {
    const payload: SensitiveAccessBlockingPayload = {
      detail: "Run trace export requires approval before the payload can be exported.",
      resource: {
        id: "resource-credential-governance",
        label: "Trace Export",
        description: "Sensitive trace export",
        sensitivity_level: "L3",
        source: "credential",
        metadata: {
          run_id: "run-credential-governance"
        },
        credential_governance: {
          credential_id: "credential-openai-prod",
          credential_name: "OpenAI production key",
          credential_type: "openai_api_key",
          credential_status: "revoked",
          sensitivity_level: "L3",
          sensitive_resource_id: "resource-credential-governance",
          sensitive_resource_label: "Trace Export",
          credential_ref: "credential://openai-prod",
          summary: "本次命中的凭据是 OpenAI production key（openai_api_key）；当前治理级别 L3，状态 已吊销。"
        }
      },
      access_request: {
        id: "request-credential-governance",
        run_id: "run-credential-governance",
        node_run_id: "node-run-credential-governance",
        requester_type: "human",
        requester_id: "ops-debugger",
        resource_id: "resource-credential-governance",
        action_type: "export",
        decision: "require_approval"
      },
      approval_ticket: {
        id: "ticket-credential-governance",
        access_request_id: "request-credential-governance",
        run_id: "run-credential-governance",
        node_run_id: "node-run-credential-governance",
        status: "pending",
        waiting_status: "waiting",
        approved_by: null
      },
      notifications: [],
      outcome_explanation: null,
      run_snapshot: null,
      run_follow_up: null
    };

    const html = renderToStaticMarkup(
      createElement(SensitiveAccessBlockedCard, {
        title: "Sensitive access blocked",
        payload
      })
    );

    expect(html).toContain("Credential governance");
    expect(html).toContain("credential OpenAI production key");
    expect(html).toContain("type openai_api_key");
    expect(html).toContain("L3 治理");
    expect(html).toContain("已吊销");
  });
});
