import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InlineOperatorActionFeedback } from "@/components/inline-operator-action-feedback";
import type { RunCallbackTicketItem } from "@/lib/get-run-views";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

const callbackSummaryProps: Array<Record<string, unknown>> = [];
const runSampleListProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
    callbackSummaryProps.push(props);
    return createElement("div", { "data-testid": "callback-waiting-summary" });
  }
}));

vi.mock("@/components/operator-focus-evidence-card", () => ({
  OperatorFocusEvidenceCard: () => createElement("div", { "data-testid": "focus-evidence" })
}));

vi.mock("@/components/operator-run-sample-card-list", () => ({
  OperatorRunSampleCardList: (props: Record<string, unknown>) => {
    runSampleListProps.push(props);
    return createElement("div", { "data-testid": "run-sample-list" });
  }
}));

vi.mock("@/components/skill-reference-load-list", () => ({
  SkillReferenceLoadList: () => createElement("div", { "data-testid": "skill-reference-loads" })
}));

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: false,
        backend_ids: [],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason:
          "No sandbox backend is currently enabled. Strong-isolation execution must fail closed until a compatible backend is configured."
      }
    ],
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false
  };
}

function buildSensitiveAccessEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "tool",
      requester_id: "native.search",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "fetch remote search results",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "policy_requires_approval",
      reason_label: "Policy requires approval",
      policy_summary: "High-risk remote search requires operator approval.",
      created_at: "2026-03-20T10:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Remote search capability",
      description: "External search adapter",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-20T09:00:00Z",
      updated_at: "2026-03-20T09:00:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T10:30:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "当前阻断来自敏感访问审批票据。",
      follow_up: "下一步：优先处理审批票据，再观察 waiting 节点是否恢复。"
    },
    run_snapshot: null,
    run_follow_up: null
  };
}

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

function buildLegacyAuthGovernanceSnapshot() {
  return buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
    binding: {
      workflow_id: "wf-demo",
      workflow_name: "Demo Workflow",
      binding_id: "binding-demo",
      endpoint_id: "endpoint-demo",
      endpoint_name: "Demo Endpoint",
      workflow_version: "v1",
    },
  });
}

describe("InlineOperatorActionFeedback", () => {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  beforeEach(() => {
    callbackSummaryProps.length = 0;
    runSampleListProps.length = 0;
  });

  it("treats an explicit null recommendedNextStep override as disabling the auto fallback", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        recommendedNextStep: null,
        runFollowUpExplanation: {
          primary_signal: "本次影响 1 个 run；operator follow-up 已刷新。",
          follow_up: "run run-1：继续观察 waiting。"
        }
      })
    );

    expect(html).not.toContain(operatorSurfaceCopy.recommendedNextStepTitle);
  });

  it("keeps follow_up as explanation text when no stable CTA target is available", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runFollowUpExplanation: {
          primary_signal: "本次已刷新 operator follow-up。",
          follow_up: "先联系值班 operator 手动确认当前阻断。"
        }
      })
    );

    expect(html).not.toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("先联系值班 operator 手动确认当前阻断。");
  });

  it("preserves scoped run detail href through inline feedback and sampled runs", () => {
    const resolveRunDetailHref = (runId: string) =>
      `/runs/${runId}?needs_follow_up=true&q=starter&source_governance_kind=missing_source`;
    const escapedScopedRunHref = resolveRunDetailHref("run-1").replaceAll("&", "&amp;");
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        resolveRunDetailHref,
        runFollowUpExplanation: {
          primary_signal: "当前 operator follow-up 已刷新。",
          follow_up: "优先继续看当前 run detail。"
        },
        runFollowUp: {
          affectedRunCount: 2,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          sampledRuns: [
            {
              runId: "run-2",
              snapshot: {
                status: "waiting",
                currentNodeId: "approval_gate",
                executionFocusNodeId: "approval_gate",
                executionFocusNodeRunId: "node-run-2",
                executionFocusNodeName: "Approval Gate"
              },
              callbackTickets: [],
              sensitiveAccessEntries: []
            }
          ]
        }
      })
    );

    expect(html).toContain(`href="${escapedScopedRunHref}"`);
    expect(html).not.toContain('href="/runs/run-1"');
    expect(runSampleListProps).toHaveLength(1);
    expect(runSampleListProps[0]?.currentHref).toBeNull();
    expect(runSampleListProps[0]?.resolveRunDetailHref).toBe(resolveRunDetailHref);
    expect(
      (runSampleListProps[0]?.resolveRunDetailHref as ((runId: string) => string) | undefined)?.(
        "run-2"
      )
    ).toBe(
      "/runs/run-2?needs_follow_up=true&q=starter&source_governance_kind=missing_source"
    );
  });

  it("forwards currentHref to sampled run cards", () => {
    renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        currentHref: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
        runId: "run-1",
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          sampledRuns: [
            {
              runId: "run-2",
              snapshot: {
                status: "waiting",
                currentNodeId: "approval_gate",
                executionFocusNodeId: "approval_gate",
                executionFocusNodeRunId: "node-run-2",
                executionFocusNodeName: "Approval Gate"
              },
              callbackTickets: [],
              sensitiveAccessEntries: []
            }
          ]
        }
      })
    );

    expect(runSampleListProps).toHaveLength(1);
    expect(runSampleListProps[0]?.currentHref).toBe(
      "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1"
    );
  });

  it("forwards callback waiting summary context to the shared summary card", () => {
    const inboxHref = "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1";
    const callbackWaitingAutomation = buildCallbackWaitingAutomation();
    const callbackTickets: RunCallbackTicketItem[] = [
      {
        ticket: "callback-ticket-1",
        run_id: "run-1",
        node_run_id: "node-run-1",
        status: "pending",
        waiting_status: "waiting",
        tool_call_index: 0,
        created_at: "2026-03-20T10:00:00Z"
      }
    ];
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        runSnapshot: {
          status: "waiting",
          currentNodeId: "approval_gate",
          waitingReason: "approval pending",
          executionFocusNodeId: "approval_gate",
          executionFocusNodeRunId: "node-run-1",
          executionFocusNodeName: "Approval Gate",
          callbackWaitingExplanation: {
            primary_signal: "当前 run 仍在等待审批。",
            follow_up: "优先处理审批票据，再回来看 waiting 是否恢复。"
          }
        },
        callbackWaitingSummaryProps: {
          inboxHref,
          callbackTickets,
          callbackWaitingAutomation,
          sensitiveAccessEntries: [buildSensitiveAccessEntry()],
          recommendedAction: {
            kind: "approval blocker",
            entry_key: "operatorInbox",
            href: inboxHref,
            label: "Open approval inbox"
          },
          operatorFollowUp: "Open the approval inbox first.",
          preferCanonicalRecommendedNextStep: true,
          showSensitiveAccessInlineActions: false
        }
      })
    );

    expect(html).toContain('data-testid="callback-waiting-summary"');
    expect(callbackSummaryProps).toHaveLength(1);
    expect(callbackSummaryProps[0]?.inboxHref).toBe(inboxHref);
    expect(
      ((callbackSummaryProps[0]?.sensitiveAccessEntries as SensitiveAccessTimelineEntry[] | undefined) ?? [])[0]
        ?.request.id
    ).toBe("request-1");
    expect(
      ((callbackSummaryProps[0]?.callbackTickets as RunCallbackTicketItem[] | undefined) ?? [])[0]?.ticket
    ).toBe("callback-ticket-1");
    expect(callbackSummaryProps[0]?.callbackWaitingAutomation).toEqual(callbackWaitingAutomation);
    expect(callbackSummaryProps[0]?.recommendedAction).toMatchObject({
      kind: "approval blocker",
      entry_key: "operatorInbox",
      href: inboxHref,
      label: "Open approval inbox"
    });
    expect(callbackSummaryProps[0]?.operatorFollowUp).toBe("Open the approval inbox first.");
    expect(callbackSummaryProps[0]?.preferCanonicalRecommendedNextStep).toBe(true);
    expect(callbackSummaryProps[0]?.showSensitiveAccessInlineActions).toBe(false);
  });

  it("prefers shared callback recovery CTA when only callback automation context remains", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        callbackWaitingSummaryProps: {
          callbackWaitingAutomation: buildCallbackWaitingAutomation(),
          operatorFollowUp: "优先回到 waiting callback runs 看自动恢复状态。"
        },
        outcomeExplanation: {
          primary_signal: "callback follow-up 已刷新。"
        },
        runSnapshot: {
          status: "running",
          currentNodeId: "callback_gate",
          executionFocusNodeName: "Callback Gate"
        },
        runFollowUpExplanation: {
          primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
          follow_up: "局部 follow-up 仍只有泛化说明。"
        }
      })
    );

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("callback recovery");
    expect(html).toContain("Open run library");
    expect(html).toContain('/runs?status=waiting');
    expect(html).toContain("当前 callback recovery 仍影响 2 个 run / 1 个 workflow");
  });

  it("prefers refreshed action-result follow-up over parent callback summary props", () => {
    const staleInboxHref = "/sensitive-access?run_id=run-1&approval_ticket_id=stale-ticket";
    const refreshedInboxHref = "/sensitive-access?run_id=run-1&approval_ticket_id=fresh-ticket";

    renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        runSnapshot: {
          status: "waiting",
          currentNodeId: "approval_gate",
          waitingReason: "approval pending",
          executionFocusNodeId: "approval_gate",
          executionFocusNodeRunId: "node-run-1",
          executionFocusNodeName: "Approval Gate",
          callbackWaitingExplanation: {
            primary_signal: "当前 run 仍在等待审批。",
            follow_up: "旧 summary 仍指向上一次审批票据。"
          }
        },
        callbackWaitingSummaryProps: {
          recommendedAction: {
            kind: "approval blocker",
            entry_key: "operatorInbox",
            href: staleInboxHref,
            label: "Open stale approval inbox"
          },
          operatorFollowUp: "Open the stale approval inbox first.",
          preferCanonicalRecommendedNextStep: true
        },
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 0,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          recommendedAction: {
            kind: "approval blocker",
            entryKey: "operatorInbox",
            href: refreshedInboxHref,
            label: "Open refreshed approval inbox"
          },
          sampledRuns: []
        },
        runFollowUpExplanation: {
          primary_signal: "operator follow-up 已刷新。",
          follow_up: "Open the refreshed approval inbox first."
        }
      })
    );

    expect(callbackSummaryProps).toHaveLength(1);
    expect(callbackSummaryProps[0]?.recommendedAction).toMatchObject({
      kind: "approval blocker",
      href: refreshedInboxHref,
      label: "Open refreshed approval inbox"
    });
    expect(callbackSummaryProps[0]?.operatorFollowUp).toBe(
      "Open the refreshed approval inbox first."
    );
    expect(callbackSummaryProps[0]?.preferCanonicalRecommendedNextStep).toBe(true);
  });

  it("forwards canonical callback follow-up into sampled run cards", () => {
    renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          recommendedAction: {
            kind: "approval blocker",
            entryKey: "operatorInbox",
            href: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
            label: "Open approval inbox"
          },
          sampledRuns: [
            {
              runId: "run-1",
              snapshot: {
                status: "waiting",
                currentNodeId: "approval_gate",
                waitingReason: "approval pending",
                executionFocusNodeId: "approval_gate",
                executionFocusNodeRunId: "node-run-1",
                executionFocusNodeName: "Approval Gate",
                callbackWaitingExplanation: {
                  primary_signal: "当前 run 仍在等待审批。",
                  follow_up: "优先处理审批票据，再回来看 waiting 是否恢复。"
                }
              },
              callbackTickets: [],
              sensitiveAccessEntries: []
            }
          ]
        },
        runFollowUpExplanation: {
          primary_signal: "本次影响 1 个 run；operator follow-up 已刷新。",
          follow_up: "Open the approval inbox first."
        }
      })
    );

    expect(runSampleListProps).toHaveLength(1);
    expect(runSampleListProps[0]?.callbackWaitingSummaryProps).toMatchObject({
      recommendedAction: {
        kind: "approval blocker",
        entryKey: "operatorInbox",
        href: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1",
        label: "Open approval inbox"
      },
      operatorFollowUp: "Open the approval inbox first.",
      preferCanonicalRecommendedNextStep: true
    });
  });

  it("recovers a sampled approval blocker CTA when the top-level run follow-up omitted it", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          sampledRuns: [
            {
              runId: "run-1",
              snapshot: {
                status: "waiting",
                currentNodeId: "approval_gate",
                waitingReason: "approval pending",
                executionFocusNodeId: "approval_gate",
                executionFocusNodeRunId: "node-run-1",
                executionFocusNodeName: "Approval Gate",
                callbackWaitingExplanation: {
                  primary_signal: "当前 run 仍在等待审批。",
                  follow_up: "优先处理审批票据，再观察 waiting 是否恢复。"
                }
              },
              callbackTickets: [],
              sensitiveAccessEntries: [buildSensitiveAccessEntry()]
            }
          ]
        },
        runFollowUpExplanation: {
          primary_signal: "operator follow-up 已刷新。",
          follow_up: "优先处理审批票据，再观察 waiting 是否恢复。"
        }
      })
    );

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("approval blocker");
    expect(html).toContain("open approval inbox slice");
    expect(html).toContain("approval_ticket_id=ticket-1");
  });

  it("drops self-links from inline feedback when the current page already matches the inbox slice", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        currentHref:
          "/sensitive-access?access_request_id=request-1&approval_ticket_id=ticket-1&node_run_id=node-run-1&run_id=run-1&status=pending&waiting_status=waiting",
        runId: "run-1",
        runFollowUp: {
          affectedRunCount: 1,
          sampledRunCount: 1,
          waitingRunCount: 1,
          runningRunCount: 0,
          succeededRunCount: 0,
          failedRunCount: 0,
          unknownRunCount: 0,
          recommendedAction: {
            kind: "approval blocker",
            entryKey: "operatorInbox",
            href: "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-1&node_run_id=node-run-1&access_request_id=request-1&approval_ticket_id=ticket-1",
            label: "open approval inbox slice"
          },
          sampledRuns: []
        },
        runFollowUpExplanation: {
          primary_signal: "operator follow-up 已刷新。",
          follow_up: "优先处理审批票据，再观察 waiting 是否恢复。"
        }
      })
    );

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("approval blocker");
    expect(html).toContain("优先处理审批票据，再观察 waiting 是否恢复。");
    expect(html).not.toContain("open approval inbox slice</a>");
  });

  it("surfaces live sandbox readiness for blocked operator follow-up snapshots", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        sandboxReadiness: buildSandboxReadiness(),
        runSnapshot: {
          status: "failed",
          currentNodeId: "sandbox_tool",
          executionFocusNodeId: "sandbox_tool",
          executionFocusNodeRunId: "node-run-1",
          executionFocusNodeName: "Sandbox Tool",
          executionFocusNodeType: "tool",
          executionFocusToolCalls: [
            {
              id: "tool-call-1",
              tool_id: "sandbox.code",
              tool_name: "Sandbox Code",
              phase: "tool",
              status: "failed",
              requested_execution_class: "sandbox",
              requested_execution_source: "runtime_policy",
              requested_execution_profile: null,
              requested_execution_timeout_ms: null,
              requested_execution_network_policy: null,
              requested_execution_filesystem_policy: null,
              requested_execution_dependency_mode: null,
              requested_execution_builtin_package_set: null,
              requested_execution_dependency_ref: null,
              requested_execution_backend_extensions: null,
              effective_execution_class: "sandbox",
              execution_executor_ref: null,
              execution_sandbox_backend_id: null,
              execution_sandbox_backend_executor_ref: null,
              execution_sandbox_runner_kind: null,
              execution_blocking_reason: "No compatible sandbox backend is available.",
              execution_fallback_reason: null,
              response_summary: null,
              response_content_type: null,
              raw_ref: null
            }
          ]
        }
      })
    );

    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 仍 blocked。");
  });

  it("prioritizes the shared sandbox readiness CTA for blocked execution follow-up", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "",
        title: "Operator follow-up",
        runId: "run-1",
        sandboxReadiness: {
          ...buildSandboxReadiness(),
          affected_run_count: 4,
          affected_workflow_count: 1,
          primary_blocker_kind: "execution_class_blocked",
          recommended_action: {
            kind: "open_workflow_library",
            entry_key: "workflowLibrary",
            href: "/workflows?execution=sandbox",
            label: "Open workflow library"
          }
        },
        runFollowUpExplanation: {
          primary_signal: "operator follow-up 已刷新。",
          follow_up: "本地 run follow-up：先回看 execution focus。"
        },
        runSnapshot: {
          status: "failed",
          currentNodeId: "sandbox_tool",
          executionFocusNodeId: "sandbox_tool",
          executionFocusNodeRunId: "node-run-1",
          executionFocusNodeName: "Sandbox Tool",
          executionFocusNodeType: "tool",
          executionFocusExplanation: {
            primary_signal: "当前节点因 sandbox backend 不可用而阻断。",
            follow_up: "先恢复 backend，再重试该节点。"
          },
          executionFocusToolCalls: [
            {
              id: "tool-call-1",
              tool_id: "sandbox.code",
              tool_name: "Sandbox Code",
              phase: "tool",
              status: "failed",
              requested_execution_class: "sandbox",
              requested_execution_source: "runtime_policy",
              requested_execution_profile: null,
              requested_execution_timeout_ms: null,
              requested_execution_network_policy: null,
              requested_execution_filesystem_policy: null,
              requested_execution_dependency_mode: null,
              requested_execution_builtin_package_set: null,
              requested_execution_dependency_ref: null,
              requested_execution_backend_extensions: null,
              effective_execution_class: "sandbox",
              execution_executor_ref: null,
              execution_sandbox_backend_id: null,
              execution_sandbox_backend_executor_ref: null,
              execution_sandbox_runner_kind: null,
              execution_blocking_reason: "No compatible sandbox backend is available.",
              execution_fallback_reason: null,
              response_summary: null,
              response_content_type: null,
              raw_ref: null
            }
          ]
        }
      })
    );

    expect(html).toContain(operatorSurfaceCopy.recommendedNextStepTitle);
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("Open workflow library");
    expect(html).toContain('/workflows?execution=sandbox');
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
    expect(html).toContain("本地 run follow-up：先回看 execution focus。");
  });

  it("renders workflow handoff when the action result carries legacy auth governance", () => {
    const html = renderToStaticMarkup(
      createElement(InlineOperatorActionFeedback, {
        status: "success",
        message: "审批已通过。",
        title: "审批结果",
        runId: "run-1",
        runFollowUpExplanation: {
          primary_signal: "本次影响 1 个 workflow。",
          follow_up: "继续收口 workflow 侧 legacy binding backlog。"
        },
        legacyAuthGovernance: buildLegacyAuthGovernanceSnapshot()
      })
    );

    expect(html).toContain("Workflow handoff");
    expect(html).toContain("published blockers 1");
    expect(html).toContain("再补发支持鉴权的 replacement bindings");
    expect(html).toContain("Demo Workflow");
  });
});
