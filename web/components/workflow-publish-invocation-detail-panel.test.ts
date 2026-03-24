import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishInvocationDetailPanel } from "@/components/workflow-publish-invocation-detail-panel";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";

const sensitiveAccessTimelineProps: Array<Record<string, unknown>> = [];

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-diagnostics-execution/execution-node-card", () => ({
  ExecutionNodeCard: () => createElement("div", { "data-testid": "execution-node-card" })
}));

vi.mock("@/components/sensitive-access-timeline-entry-list", () => ({
  SensitiveAccessTimelineEntryList: (props: Record<string, unknown>) => {
    sensitiveAccessTimelineProps.push(props);
    return createElement(
      "div",
      {
        "data-testid": "sensitive-access-timeline-entry-list",
        "data-empty-copy": String(props.emptyCopy ?? "")
      },
      String(props.emptyCopy ?? "")
    );
  }
}));

vi.mock("@/components/tool-governance-summary", () => ({
  ToolGovernanceSummary: () => createElement("div", { "data-testid": "tool-governance-summary" })
}));

vi.mock("@/components/workflow-publish-invocation-callback-section", () => ({
  WorkflowPublishInvocationCallbackSection: () =>
    createElement("div", { "data-testid": "workflow-publish-invocation-callback-section" })
}));

function buildSampleApprovalEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-callback-1",
      node_run_id: "node-run-tool-wait",
      requester_type: "tool",
      requester_id: "published.search",
      resource_id: "resource-1",
      action_type: "invoke",
      purpose_text: "Inspect published callback blocker",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "policy_requires_approval",
      reason_label: "Policy requires approval",
      policy_summary: "An operator must approve this callback blocker.",
      created_at: "2026-03-20T10:00:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-1",
      label: "Published callback gate",
      description: "Protected callback endpoint",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-20T10:00:00Z",
      updated_at: "2026-03-20T10:00:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-callback-1",
      node_run_id: "node-run-tool-wait",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-20T10:30:00Z",
      created_at: "2026-03-20T10:00:00Z"
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "当前 callback waiting 仍卡在 1 条待处理审批。",
      follow_up: "优先处理审批票据，再观察 callback waiting 是否恢复。"
    }
  };
}

function buildDetail(): PublishedEndpointInvocationDetailResponse {
  return {
    invocation: {
      id: "invocation-1",
      workflow_id: "workflow-1",
      binding_id: "binding-1",
      endpoint_id: "endpoint-1",
      endpoint_alias: "alias-1",
      route_path: "/published/test",
      protocol: "openai",
      auth_mode: "api_key",
      request_source: "workflow",
      request_surface: "native.workflow",
      status: "succeeded",
      cache_status: "miss",
      request_preview: {
        key_count: 1,
        keys: ["query"]
      },
      response_preview: {
        ok: true
      },
      created_at: "2026-03-20T10:00:00Z",
      finished_at: "2026-03-20T10:00:01Z",
      duration_ms: 1000,
      error_message: null,
      reason_code: null,
      api_key_name: null,
      api_key_prefix: null,
      run_id: "run-callback-1",
      run_status: "running",
      run_current_node_id: "legacy-invocation-node",
      run_waiting_reason: "legacy invocation waiting reason",
      run_waiting_lifecycle: null,
      run_follow_up: {
        affected_run_count: 1,
        sampled_run_count: 1,
        waiting_run_count: 1,
        running_run_count: 0,
        succeeded_run_count: 0,
        failed_run_count: 0,
        unknown_run_count: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-callback-1：继续观察 callback waiting。"
        },
        sampled_runs: [
          {
            run_id: "run-callback-1",
            snapshot: {
              status: "waiting",
              current_node_id: "tool_wait",
              waiting_reason: "callback pending",
              execution_focus_node_id: "tool_wait",
              execution_focus_node_run_id: "node-run-tool-wait",
              execution_focus_node_name: "Tool wait",
              callback_waiting_explanation: {
                primary_signal: "当前 waiting 节点仍在等待 callback。",
                follow_up: "优先观察定时恢复是否已重新排队。"
              },
              callback_waiting_lifecycle: {
                wait_cycle_count: 1,
                issued_ticket_count: 1,
                expired_ticket_count: 0,
                consumed_ticket_count: 0,
                canceled_ticket_count: 0,
                late_callback_count: 0,
                resume_schedule_count: 1,
                max_expired_ticket_count: 0,
                terminated: false,
                last_resume_delay_seconds: 45,
                last_resume_source: "callback_ticket_monitor",
                last_resume_backoff_attempt: 0
              },
              scheduled_resume_delay_seconds: 45,
              scheduled_resume_source: "callback_ticket_monitor",
              scheduled_waiting_status: "waiting_callback",
              scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
              scheduled_resume_due_at: "2026-03-20T10:00:45Z",
              scheduled_resume_requeued_at: "2026-03-20T10:01:30Z",
              scheduled_resume_requeue_source: "waiting_resume_monitor",
              execution_focus_artifact_count: 1,
              execution_focus_artifact_ref_count: 1,
              execution_focus_tool_call_count: 1,
              execution_focus_artifact_refs: ["artifact://callback-artifact"],
              execution_focus_tool_calls: [
                {
                  id: "tool-call-1",
                  tool_id: "callback.wait",
                  tool_name: "Callback Wait",
                  phase: "execute",
                  status: "waiting",
                  effective_execution_class: "sandbox",
                  execution_sandbox_backend_id: "sandbox-default",
                  response_summary: "callback payload 已写入 artifact",
                  raw_ref: "artifact://callback-tool-raw"
                }
              ],
              execution_focus_skill_trace: {
                reference_count: 1,
                phase_counts: {
                  plan: 1
                },
                source_counts: {
                  explicit: 1
                },
                loads: [
                  {
                    phase: "plan",
                    references: [
                      {
                        skill_id: "skill-callback",
                        skill_name: "Callback skill",
                        reference_id: "ref-1",
                        reference_name: "Callback recovery checklist",
                        load_source: "explicit",
                        retrieval_mcp_params: {}
                      }
                    ]
                  }
                ]
              }
            }
          }
        ]
      },
      execution_focus_explanation: null,
      callback_waiting_explanation: null
    },
    run: {
      id: "run-callback-1",
      status: "running",
      current_node_id: "legacy-run-node",
      created_at: "2026-03-20T10:00:00Z"
    },
    run_snapshot: {
      status: "waiting",
      current_node_id: "detail-snapshot-node",
      waiting_reason: "detail snapshot waiting reason",
      callback_waiting_explanation: {
        primary_signal: "详情顶层快照确认当前仍在等待 callback。",
        follow_up: "先看 waiting reason，再结合 callback summary。"
      }
    },
    run_follow_up: {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 0,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
        follow_up: "run run-callback-1：继续观察 callback waiting。"
      },
      sampled_runs: [
        {
          run_id: "run-callback-1",
          snapshot: {
            status: "waiting",
            current_node_id: "tool_wait",
            waiting_reason: "callback pending",
            execution_focus_node_id: "tool_wait",
            execution_focus_node_run_id: "node-run-tool-wait",
            execution_focus_node_name: "Tool wait",
            callback_waiting_explanation: {
              primary_signal: "当前 waiting 节点仍在等待 callback。",
              follow_up: "优先观察定时恢复是否已重新排队。"
            },
            callback_waiting_lifecycle: {
              wait_cycle_count: 1,
              issued_ticket_count: 1,
              expired_ticket_count: 0,
              consumed_ticket_count: 0,
              canceled_ticket_count: 0,
              late_callback_count: 0,
              resume_schedule_count: 1,
              max_expired_ticket_count: 0,
              terminated: false,
              last_resume_delay_seconds: 45,
              last_resume_source: "callback_ticket_monitor",
              last_resume_backoff_attempt: 0
            },
            scheduled_resume_delay_seconds: 45,
            scheduled_resume_source: "callback_ticket_monitor",
            scheduled_waiting_status: "waiting_callback",
            scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
            scheduled_resume_due_at: "2026-03-20T10:00:45Z",
            scheduled_resume_requeued_at: "2026-03-20T10:01:30Z",
            scheduled_resume_requeue_source: "waiting_resume_monitor",
            execution_focus_artifact_count: 1,
            execution_focus_artifact_ref_count: 1,
            execution_focus_tool_call_count: 1,
            execution_focus_artifact_refs: ["artifact://callback-artifact"],
            execution_focus_tool_calls: [
              {
                id: "tool-call-1",
                tool_id: "callback.wait",
                tool_name: "Callback Wait",
                phase: "execute",
                status: "waiting",
                effective_execution_class: "sandbox",
                execution_executor_ref: "tool:compat-adapter:dify-default",
                execution_sandbox_backend_id: "sandbox-default",
                execution_sandbox_runner_kind: "container",
                adapter_request_trace_id: "trace-follow-up-compat",
                adapter_request_execution: {
                  class: "sandbox",
                  source: "runtime_policy",
                  timeoutMs: 3000,
                },
                adapter_request_execution_class: "sandbox",
                adapter_request_execution_source: "runtime_policy",
                adapter_request_execution_contract: {
                  kind: "tool_execution",
                  toolId: "callback.wait",
                  irVersion: "2026-03-10",
                },
                response_summary: "callback payload 已写入 artifact",
                raw_ref: "artifact://callback-tool-raw"
              }
            ],
            execution_focus_skill_trace: {
              reference_count: 1,
              phase_counts: {
                plan: 1
              },
              source_counts: {
                explicit: 1
              },
              loads: [
                {
                  phase: "plan",
                  references: [
                    {
                      skill_id: "skill-callback",
                      skill_name: "Callback skill",
                      reference_id: "ref-1",
                      reference_name: "Callback recovery checklist",
                      load_source: "explicit",
                      retrieval_mcp_params: {}
                    }
                  ]
                }
              ]
            }
          }
        }
      ]
    },
    legacy_auth_governance: null,
    callback_tickets: [],
    blocking_node_run_id: null,
    execution_focus_reason: null,
    execution_focus_node: null,
    execution_focus_explanation: null,
    callback_waiting_explanation: null,
    skill_trace: null,
    blocking_sensitive_access_entries: [],
    sensitive_access_entries: [],
    cache: {
      cache_status: "miss",
      cache_key: null,
      cache_entry_id: null,
      inventory_entry: null
    }
  };
}

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 1,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true,
        reason: null
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["builtin"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: false,
    supports_network_policy: true,
    supports_filesystem_policy: true
  };
}

function buildBlockedSandboxReadiness(): SandboxReadinessCheck {
  const readiness = buildSandboxReadiness();

  return {
    ...readiness,
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    offline_backend_count: 1,
    execution_classes: readiness.execution_classes.map((item) => ({
      ...item,
      available: false,
      backend_ids: [],
      supports_tool_execution: false,
      supports_builtin_package_sets: false,
      supports_network_policy: false,
      supports_filesystem_policy: false,
      reason: "No compatible sandbox backend is available."
    })),
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
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

const callbackWaitingAutomation: CallbackWaitingAutomationCheck = {
  status: "healthy",
  scheduler_required: true,
  detail: "callback automation healthy",
  scheduler_health_status: "healthy",
  scheduler_health_detail: "scheduler ok",
  steps: []
};

describe("WorkflowPublishInvocationDetailPanel", () => {
  it("renders sampled callback runs with shared callback waiting summary", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail: buildDetail(),
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("当前 waiting 节点仍在等待 callback");
    expect(html).toContain("优先观察定时恢复是否已重新排队");
    expect(html).toContain("scheduled resume requeued");
    expect(html).toContain("requeued by waiting_resume_monitor");
    expect(html).toContain("detail-snapshot-node");
    expect(html).toContain("detail snapshot waiting reason");
    expect(html).not.toContain("legacy-run-node");
    expect(html).not.toContain("当前节点：tool_wait。");
    expect(html).toContain("Waiting node focus evidence");
    expect(html).toContain("Callback recovery checklist");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
    expect(html).toContain("compat trace trace-follow-up-compat");
    expect(html).toContain("compat exec (class sandbox / source runtime_policy / timeout 3000ms)");
    expect(html).toContain("compat contract (tool_execution / tool callback.wait / ir 2026-03-10)");
    expect(html).not.toContain("Sampled run focus evidence");
    expect(html.match(/Focused skill trace/g)?.length ?? 0).toBe(1);
  });

  it("renders the shared workflow legacy auth handoff in publish audit detail", () => {
    const detail = buildDetail();
    detail.legacy_auth_governance = {
      generated_at: "2026-03-20T10:00:00Z",
      workflow_count: 1,
      binding_count: 2,
      summary: {
        draft_candidate_count: 1,
        published_blocker_count: 1,
        offline_inventory_count: 0
      },
      checklist: [
        {
          key: "draft_cleanup",
          title: "Draft cleanup",
          tone: "ready",
          tone_label: "ready now",
          count: 1,
          detail: "先下线 draft binding，再继续 publish audit follow-up。"
        },
        {
          key: "published_follow_up",
          title: "Published blockers",
          tone: "manual",
          tone_label: "manual follow-up",
          count: 1,
          detail: "当前仍有 published binding 使用 unsupported legacy auth mode。"
        }
      ],
      workflows: [
        {
          workflow_id: "workflow-1",
          workflow_name: "Workflow 1",
          binding_count: 2,
          draft_candidate_count: 1,
          published_blocker_count: 1,
          offline_inventory_count: 0
        }
      ],
      buckets: {
        draft_candidates: [
          {
            workflow_id: "workflow-1",
            workflow_name: "Workflow 1",
            binding_id: "binding-draft-1",
            endpoint_id: "endpoint-draft-1",
            endpoint_name: "Draft endpoint",
            workflow_version: "0.1.0",
            lifecycle_status: "draft",
            auth_mode: "token"
          }
        ],
        published_blockers: [
          {
            workflow_id: "workflow-1",
            workflow_name: "Workflow 1",
            binding_id: "binding-published-1",
            endpoint_id: "endpoint-published-1",
            endpoint_name: "Published endpoint",
            workflow_version: "0.1.0",
            lifecycle_status: "published",
            auth_mode: "token"
          }
        ],
        offline_inventory: []
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("shared workflow artifact");
    expect(html).toContain("Draft cleanup");
    expect(html).toContain("Published blockers");
    expect(html).toContain("当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory");
    expect(html).toContain("/workflows/workflow-1");
  });

  it("prefers shared callback recovery CTA when publish detail only carries local callback prose", () => {
    const detail = buildDetail();
    detail.invocation.run_waiting_lifecycle = { node_run_id: "node-run-tool-wait" } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
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
        }
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("callback recovery");
    expect(html).toContain("当前 callback recovery 仍影响 3 个 run / 2 个 workflow");
    expect(html).toContain("Open run library");
    expect(html).toContain('/runs?focus=callback-waiting');
  });

  it("forwards sampled approval blocker context into the shared callback waiting summary", () => {
    const detail = buildDetail();
    detail.run_follow_up!.sampled_runs[0] = {
      ...detail.run_follow_up!.sampled_runs[0],
      callback_tickets: [
        {
          ticket: "callback-ticket-1",
          run_id: "run-callback-1",
          node_run_id: "node-run-tool-wait",
          tool_call_id: null,
          tool_id: "published.search",
          tool_call_index: 0,
          waiting_status: "waiting_callback",
          status: "pending",
          reason: "callback pending",
          callback_payload: null,
          created_at: "2026-03-20T10:00:00Z",
          expires_at: "2026-03-20T10:30:00Z",
          consumed_at: null,
          canceled_at: null,
          expired_at: null
        }
      ],
      sensitive_access_entries: [buildSampleApprovalEntry()]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("approval_ticket_id=ticket-1");
    expect(html).toContain("Handle approval here first");
  });

  it("restores recommended approval CTA from sampled blocker context when top-level inbox facts are missing", () => {
    const detail = buildDetail();
    detail.invocation.run_waiting_lifecycle = null;
    detail.blocking_node_run_id = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.callback_waiting_explanation = {
      primary_signal: "当前 waiting 节点仍在等待 callback。",
      follow_up: "优先处理审批票据，再观察 waiting 节点是否恢复。"
    };
    detail.run_follow_up!.sampled_runs[0] = {
      ...detail.run_follow_up!.sampled_runs[0],
      callback_tickets: [],
      sensitive_access_entries: [buildSampleApprovalEntry()]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("open approval inbox slice");
    expect(html).toContain("approval_ticket_id=ticket-1");
    expect(html).toContain("优先处理审批票据，再观察 waiting 节点是否恢复。");
  });

  it("prefers sampled approval inbox ids for publish detail CTAs when top-level scope is only generic", () => {
    const detail = buildDetail();
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.blocking_node_run_id = "node-run-tool-wait";
    detail.invocation.run_waiting_lifecycle = {
      node_run_id: "node-run-tool-wait",
      node_status: "waiting_callback",
      waiting_reason: "callback pending",
      callback_ticket_count: 1,
      callback_ticket_status_counts: { pending: 1 },
      callback_waiting_lifecycle: {
        wait_cycle_count: 1,
        issued_ticket_count: 1,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 1,
        max_expired_ticket_count: 0,
        terminated: false,
        last_resume_delay_seconds: 45,
        last_resume_source: "callback_ticket_monitor",
        last_resume_backoff_attempt: 0
      },
      callback_waiting_explanation: {
        primary_signal: "当前 waiting 节点仍在等待 callback。",
        follow_up: "优先处理审批票据，再观察 waiting 节点是否恢复。"
      },
      sensitive_access_summary: {
        request_count: 1,
        approval_ticket_count: 1,
        pending_approval_count: 1,
        approved_approval_count: 0,
        rejected_approval_count: 0,
        expired_approval_count: 0,
        pending_notification_count: 0,
        delivered_notification_count: 0,
        failed_notification_count: 0
      },
      scheduled_resume_delay_seconds: 45,
      scheduled_resume_source: "callback_ticket_monitor",
      scheduled_waiting_status: "waiting_callback",
      scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
      scheduled_resume_due_at: "2026-03-20T10:00:45Z",
      scheduled_resume_requeued_at: null,
      scheduled_resume_requeue_source: null
    };
    detail.run_follow_up!.sampled_runs[0] = {
      ...detail.run_follow_up!.sampled_runs[0],
      callback_tickets: [],
      sensitive_access_entries: [buildSampleApprovalEntry()]
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("open approval inbox slice");
    expect(html.match(/approval_ticket_id=ticket-1/g)?.length ?? 0).toBeGreaterThan(1);
  });

  it("passes shared callback blocker context into approval timeline lists", () => {
    const detail = buildDetail();
    const initialLength = sensitiveAccessTimelineProps.length;

    renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    const currentProps = sensitiveAccessTimelineProps.slice(initialLength);
    expect(currentProps.length).toBeGreaterThan(0);
    currentProps.forEach((props) => {
      expect(props.callbackWaitingAutomation).toEqual(callbackWaitingAutomation);
      expect(props.callbackTickets).toEqual(detail.callback_tickets);
    });
  });

  it("keeps invocation-level summary but defers duplicated callback follow-up to the sampled shared summary", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail: buildDetail(),
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("Canonical follow-up");
    expect(html).toContain("本次影响 1 个 run；已回读 1 个样本。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("callback waiting");
    expect(html).toContain("当前 waiting 节点仍在等待 callback。");
    expect(html).toContain("优先观察定时恢复是否已重新排队。");
    expect(html).not.toContain("run run-callback-1：继续观察 callback waiting。");
  });

  it("prefers the projected selected next-step surface when the activity panel already resolved it", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail: buildDetail(),
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation,
        selectedNextStepSurface: {
          title: "Selected invocation next step",
          invocationId: "invocation-1",
          label: "approval blocker",
          detail: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。",
          href: "/sensitive-access?run_id=run-callback-1&waiting_status=waiting",
          hrefLabel: "open blocker inbox slice"
        }
      })
    );

    expect(html).toContain("Selected invocation next step");
    expect(html.match(/Selected invocation next step/g)?.length ?? 0).toBe(1);
    expect(html).toContain("approval blocker");
    expect(html).toContain("open blocker inbox slice");
  });

  it("hides generic execution focus recommendation when the focused node already exposes callback waiting summary", () => {
    const detail = buildDetail();
    detail.execution_focus_reason = "blocking_node_run";
    detail.execution_focus_explanation = {
      primary_signal: "顶层 execution focus 仍在等待 callback。",
      follow_up: "顶层 execution focus 建议先观察重排队。"
    };
    detail.execution_focus_node = {
      node_run_id: "node-run-focus",
      node_id: "tool_wait",
      node_name: "Tool wait",
      node_type: "tool",
      status: "waiting",
      phase: "execute",
      retry_count: 0,
      input_payload: {},
      checkpoint_payload: {},
      working_context: {},
      evidence_context: null,
      artifact_refs: [],
      output_payload: null,
      error_message: null,
      waiting_reason: "callback pending",
      started_at: "2026-03-20T10:00:00Z",
      phase_started_at: "2026-03-20T10:00:00Z",
      finished_at: null,
      execution_class: "sandbox",
      execution_source: "runtime_policy",
      execution_profile: null,
      execution_timeout_ms: null,
      execution_network_policy: null,
      execution_filesystem_policy: null,
      execution_dependency_mode: null,
      execution_builtin_package_set: null,
      execution_dependency_ref: null,
      execution_backend_extensions: null,
      execution_dispatched_count: 1,
      execution_fallback_count: 0,
      execution_blocked_count: 0,
      execution_unavailable_count: 0,
      requested_execution_class: null,
      requested_execution_source: null,
      requested_execution_profile: null,
      requested_execution_timeout_ms: null,
      requested_execution_network_policy: null,
      requested_execution_filesystem_policy: null,
      requested_execution_dependency_mode: null,
      requested_execution_builtin_package_set: null,
      requested_execution_dependency_ref: null,
      requested_execution_backend_extensions: null,
      effective_execution_class: "sandbox",
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_id: "sandbox-default",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_blocking_reason: null,
      execution_fallback_reason: null,
      event_count: 0,
      event_type_counts: {},
      last_event_type: null,
      artifacts: [],
      tool_calls: [],
      ai_calls: [],
      callback_tickets: [],
      skill_reference_load_count: 0,
      skill_reference_loads: [],
      sensitive_access_entries: [],
      callback_waiting_lifecycle: {
        wait_cycle_count: 1,
        issued_ticket_count: 1,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 1,
        max_expired_ticket_count: 0,
        terminated: false,
        termination_reason: null,
        terminated_at: null,
        last_ticket_status: "pending",
        last_ticket_reason: "callback pending",
        last_ticket_updated_at: "2026-03-20T10:00:05Z",
        last_late_callback_status: null,
        last_late_callback_reason: null,
        last_late_callback_at: null,
        last_resume_delay_seconds: 45,
        last_resume_reason: "callback pending",
        last_resume_source: "callback_ticket_monitor",
        last_resume_backoff_attempt: 0
      },
      execution_focus_explanation: null,
      callback_waiting_explanation: {
        primary_signal: "focus 节点 callback summary 仍在等待。",
        follow_up: "focus 节点 callback summary 建议先观察重排队。"
      },
      scheduled_resume_delay_seconds: 45,
      scheduled_resume_reason: "callback pending",
      scheduled_resume_source: "callback_ticket_monitor",
      scheduled_waiting_status: "waiting_callback",
      scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
      scheduled_resume_due_at: "2026-03-20T10:00:45Z",
      scheduled_resume_requeued_at: "2026-03-20T10:01:30Z",
      scheduled_resume_requeue_source: "waiting_resume_monitor"
    } as NonNullable<PublishedEndpointInvocationDetailResponse["execution_focus_node"]>;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("Execution focus");
    expect(html).toContain("data-testid=\"execution-node-card\"");
    expect(html).not.toContain("顶层 execution focus 仍在等待 callback。");
    expect(html).not.toContain("顶层 execution focus 建议先观察重排队。");
  });

  it("shows live sandbox readiness for blocked execution focus nodes", () => {
    const detail = buildDetail();
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_node = {
      node_run_id: "node-run-focus",
      node_id: "tool_wait",
      node_name: "Tool wait",
      node_type: "tool",
      status: "blocked",
      phase: "execute",
      retry_count: 0,
      artifact_refs: [],
      error_message: null,
      waiting_reason: "callback pending",
      started_at: "2026-03-20T10:00:00Z",
      finished_at: null,
      execution_class: "sandbox",
      execution_source: "runtime_policy",
      execution_profile: null,
      execution_timeout_ms: null,
      execution_network_policy: null,
      execution_filesystem_policy: null,
      execution_dependency_mode: null,
      execution_builtin_package_set: null,
      execution_dependency_ref: null,
      execution_backend_extensions: null,
      execution_dispatched_count: 1,
      execution_fallback_count: 0,
      execution_blocked_count: 1,
      execution_unavailable_count: 0,
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
      execution_blocking_reason: "No compatible sandbox backend is available.",
      effective_execution_class: "inline",
      execution_sandbox_backend_id: "sandbox-stale",
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_fallback_reason: null,
      event_count: 0,
      event_type_counts: {},
      last_event_type: null,
      artifacts: [],
      tool_calls: [],
      ai_calls: [],
      callback_tickets: [],
      skill_reference_load_count: 0,
      skill_reference_loads: [],
      sensitive_access_entries: []
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation,
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 已 ready。");
    expect(html).toContain("历史 run 记录的 backend 是 sandbox-stale");
  });

  it("routes execution-focus follow-up back to run detail when no callback blocker exists", () => {
    const detail = buildDetail();
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_explanation = {
      primary_signal: "sandbox execution 仍被阻断。",
      follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("execution focus");
    expect(html).toContain("open run");
    expect(html).toContain("优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。");
  });

  it("ignores stale callback follow-up copy when no live callback context remains", () => {
    const detail = buildDetail();
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = {
      primary_signal: "历史 callback waiting 曾卡住。",
      follow_up: "先观察 callback 是否恢复。"
    };
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.blocking_node_run_id = null;
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_explanation = {
      primary_signal: "sandbox execution 仍被阻断。",
      follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
    };
    detail.invocation.run_waiting_lifecycle = null;
    detail.invocation.run_status = "failed";
    detail.invocation.run_waiting_reason = null;
    detail.run = {
      id: "run-callback-1",
      status: "failed",
      current_node_id: "tool_wait",
      started_at: "2026-03-20T10:00:00Z",
      finished_at: "2026-03-20T10:05:00Z"
    } as never;
    detail.run_snapshot = {
      status: "failed",
      current_node_id: "tool_wait",
      waiting_reason: null,
      execution_focus_reason: "blocked_execution",
      execution_focus_node_id: "tool_wait",
      execution_focus_node_run_id: "node-run-focus",
      execution_focus_node_name: "Tool wait",
      execution_focus_node_type: "tool",
      execution_focus_explanation: {
        primary_signal: "sandbox execution 仍被阻断。",
        follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
      }
    } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
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
        }
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("execution focus");
    expect(html).toContain("open run");
    expect(html).toContain("优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。");
    expect(html).not.toContain("callback recovery");
    expect(html).not.toContain("Open run library");
  });

  it("prefers shared sandbox readiness CTA when blocked execution still carries a local follow-up", () => {
    const detail = buildDetail();
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.blocking_node_run_id = null;
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_explanation = {
      primary_signal: "sandbox execution 仍被阻断。",
      follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
    };
    detail.run_snapshot = {
      status: "failed",
      current_node_id: "tool_wait",
      waiting_reason: null,
      execution_focus_reason: "blocked_execution",
      execution_focus_node_id: "tool_wait",
      execution_focus_node_run_id: "node-run-focus",
      execution_focus_node_name: "Tool wait",
      execution_focus_node_type: "tool",
      execution_focus_explanation: {
        primary_signal: "sandbox execution 仍被阻断。",
        follow_up: "优先打开 run，继续检查 execution focus node 的 fallback / blocking reason。"
      },
      execution_focus_tool_calls: [
        {
          id: "tool-call-1",
          tool_id: "callback.wait",
          tool_name: "Callback Wait",
          phase: "execute",
          status: "failed",
          requested_execution_class: "sandbox",
          effective_execution_class: "inline",
          execution_sandbox_backend_id: "sandbox-stale",
          execution_blocking_reason: "No compatible sandbox backend is available."
        }
      ]
    } as never;
    detail.execution_focus_node = {
      node_run_id: "node-run-focus",
      node_id: "tool_wait",
      node_name: "Tool wait",
      node_type: "tool",
      status: "blocked",
      phase: "execute",
      retry_count: 0,
      artifact_refs: [],
      error_message: null,
      waiting_reason: null,
      started_at: "2026-03-20T10:00:00Z",
      finished_at: null,
      execution_class: "sandbox",
      execution_source: "runtime_policy",
      execution_profile: null,
      execution_timeout_ms: null,
      execution_network_policy: null,
      execution_filesystem_policy: null,
      execution_dependency_mode: null,
      execution_builtin_package_set: null,
      execution_dependency_ref: null,
      execution_backend_extensions: null,
      execution_dispatched_count: 1,
      execution_fallback_count: 0,
      execution_blocked_count: 1,
      execution_unavailable_count: 0,
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
      execution_blocking_reason: "No compatible sandbox backend is available.",
      effective_execution_class: "inline",
      execution_sandbox_backend_id: "sandbox-stale",
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_fallback_reason: null,
      event_count: 0,
      event_type_counts: {},
      last_event_type: null,
      artifacts: [],
      tool_calls: [],
      ai_calls: [],
      callback_tickets: [],
      skill_reference_load_count: 0,
      skill_reference_loads: [],
      sensitive_access_entries: []
    } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation,
        sandboxReadiness: buildBlockedSandboxReadiness()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("/workflows?execution=sandbox");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
  });

  it("adds shared sandbox remediation CTA inside sampled run cards", () => {
    const detail = buildDetail();
    detail.run_follow_up = {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 0,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 1,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
        follow_up: "run run-callback-1：继续检查 sandbox 阻断。"
      },
      recommended_action: null,
      sampled_runs: [
        {
          run_id: "run-callback-1",
          snapshot: {
            status: "failed",
            current_node_id: "sandbox_tool",
            waiting_reason: null,
            execution_focus_reason: "blocked_execution",
            execution_focus_node_id: "sandbox_tool",
            execution_focus_node_run_id: "node-run-tool-wait",
            execution_focus_node_name: "Sandbox tool",
            execution_focus_node_type: "tool",
            execution_focus_explanation: {
              primary_signal: "当前 sampled run 因 sandbox backend 不可用而阻断。",
              follow_up: "先恢复 backend，再回来复核 sampled run。"
            },
            execution_focus_tool_calls: [
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
            ],
            execution_focus_artifact_count: 0,
            execution_focus_artifact_ref_count: 0,
            execution_focus_tool_call_count: 1,
            execution_focus_raw_ref_count: 0
          },
          callback_tickets: [],
          sensitive_access_entries: []
        }
      ]
    } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation,
        sandboxReadiness: buildBlockedSandboxReadiness()
      })
    );

    expect(html).toContain("当前 sampled run 因 sandbox backend 不可用而阻断。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("Open workflow library");
    expect(html).toContain('/workflows?execution=sandbox');
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
  });

  it("strips sampled sandbox self-links when the sampled card already sits on the current publish detail", () => {
    const currentHref = "/workflows/workflow-1?publish_invocation=invocation-1";
    const detail = buildDetail();
    const sandboxReadiness = buildBlockedSandboxReadiness();

    sandboxReadiness.recommended_action = {
      kind: "open_publish_detail",
      label: "Open current publish detail",
      href: currentHref,
      entry_key: "workflowLibrary"
    };
    detail.run_follow_up = {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 0,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 1,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
        follow_up: "run run-callback-1：继续检查 sandbox 阻断。"
      },
      recommended_action: null,
      sampled_runs: [
        {
          run_id: "run-callback-1",
          snapshot: {
            status: "failed",
            current_node_id: "sandbox_tool",
            waiting_reason: null,
            execution_focus_reason: "blocked_execution",
            execution_focus_node_id: "sandbox_tool",
            execution_focus_node_run_id: "node-run-tool-wait",
            execution_focus_node_name: "Sandbox tool",
            execution_focus_node_type: "tool",
            execution_focus_explanation: {
              primary_signal: "当前 sampled run 因 sandbox backend 不可用而阻断。",
              follow_up: "先恢复 backend，再回来复核 sampled run。"
            },
            execution_focus_tool_calls: [
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
            ],
            execution_focus_artifact_count: 0,
            execution_focus_artifact_ref_count: 0,
            execution_focus_tool_call_count: 1,
            execution_focus_raw_ref_count: 0
          },
          callback_tickets: [],
          sensitive_access_entries: []
        }
      ]
    } as never;

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        currentHref,
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation,
        sandboxReadiness
      })
    );

    expect(html).toContain("当前 sampled run 因 sandbox backend 不可用而阻断。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
    expect(html).not.toContain("Open current publish detail</a>");
  });

  it("prefers shared sandbox readiness CTA when execution focus follow-up is missing", () => {
    const detail = buildDetail();
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.execution_focus_reason = "blocked_execution";
    detail.execution_focus_explanation = null;
    detail.execution_focus_node = {
      node_run_id: "node-run-focus",
      node_id: "tool_wait",
      node_name: "Tool wait",
      node_type: "tool",
      status: "blocked",
      phase: "execute",
      retry_count: 0,
      artifact_refs: [],
      error_message: null,
      waiting_reason: null,
      started_at: "2026-03-20T10:00:00Z",
      finished_at: null,
      execution_class: "sandbox",
      execution_source: "runtime_policy",
      execution_profile: null,
      execution_timeout_ms: null,
      execution_network_policy: null,
      execution_filesystem_policy: null,
      execution_dependency_mode: null,
      execution_builtin_package_set: null,
      execution_dependency_ref: null,
      execution_backend_extensions: null,
      execution_dispatched_count: 1,
      execution_fallback_count: 0,
      execution_blocked_count: 1,
      execution_unavailable_count: 0,
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
      execution_blocking_reason: "No compatible sandbox backend is available.",
      effective_execution_class: "inline",
      execution_sandbox_backend_id: "sandbox-stale",
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_fallback_reason: null,
      event_count: 0,
      event_type_counts: {},
      last_event_type: null,
      artifacts: [],
      tool_calls: [],
      ai_calls: [],
      callback_tickets: [],
      skill_reference_load_count: 0,
      skill_reference_loads: [],
      sensitive_access_entries: []
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation,
        sandboxReadiness: {
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
              reason: "execution class blocked"
            }
          ],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
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
        }
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
  });

  it("uses shared approval timeline surface copy in publish detail", () => {
    const detail = buildDetail();
    const placeholderEntry =
      {} as PublishedEndpointInvocationDetailResponse["sensitive_access_entries"][number];

    detail.blocking_node_run_id = "node-run-blocked";
    detail.blocking_sensitive_access_entries = [placeholderEntry];
    detail.sensitive_access_entries = [placeholderEntry, placeholderEntry];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("Blocking approval timeline");
    expect(html).toContain("open blocker inbox slice");
    expect(html).toContain("当前阻塞节点没有关联 sensitive access timeline。");
    expect(html).toContain("Approval timeline");
    expect(html).toContain("当前这次 invocation 没有关联 sensitive access timeline。");
  });

  it("uses shared skill trace and missing-tool labels in publish detail", () => {
    const detail = buildDetail();

    detail.skill_trace = {
      scope: "execution_focus_node",
      reference_count: 2,
      phase_counts: {
        plan: 1,
        execute: 1
      },
      source_counts: {
        explicit: 2
      },
      nodes: [
        {
          node_run_id: "node-run-skill",
          node_id: "node-skill",
          node_name: "Skill node",
          reference_count: 2,
          loads: []
        }
      ]
    };
    detail.callback_tickets = [
      {
        tool_id: "tool-missing"
      } as PublishedEndpointInvocationDetailResponse["callback_tickets"][number]
    ];

    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        detail,
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("refs 2");
    expect(html).toContain("phases plan 1 · execute 1");
    expect(html).toContain("sources explicit 2");
    expect(html).toContain("node run node-run-skill · node node-skill");
    expect(html).toContain("missing catalog entry tool-missing");
  });

  it("forwards callback waiting automation into sampled publish detail summaries", async () => {
    vi.resetModules();

    const callbackSummaryProps: Array<Record<string, unknown>> = [];

    vi.doMock("next/link", () => ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode;
        href?: string;
      } & Record<string, unknown>) => createElement("a", { href: href ?? "#", ...props }, children)
    }));
    vi.doMock("@/components/run-diagnostics-execution/execution-node-card", () => ({
      ExecutionNodeCard: () => createElement("div", { "data-testid": "execution-node-card" })
    }));
    vi.doMock("@/components/sensitive-access-timeline-entry-list", () => ({
      SensitiveAccessTimelineEntryList: (props: Record<string, unknown>) =>
        createElement(
          "div",
          {
            "data-testid": "sensitive-access-timeline-entry-list",
            "data-empty-copy": String(props.emptyCopy ?? "")
          },
          String(props.emptyCopy ?? "")
        )
    }));
    vi.doMock("@/components/tool-governance-summary", () => ({
      ToolGovernanceSummary: () => createElement("div", { "data-testid": "tool-governance-summary" })
    }));
    vi.doMock("@/components/workflow-publish-invocation-callback-section", () => ({
      WorkflowPublishInvocationCallbackSection: () =>
        createElement("div", { "data-testid": "workflow-publish-invocation-callback-section" })
    }));
    vi.doMock("@/components/callback-waiting-summary-card", () => ({
      CallbackWaitingSummaryCard: (props: Record<string, unknown>) => {
        callbackSummaryProps.push(props);
        return createElement("div", { "data-testid": "callback-waiting-summary-card" });
      }
    }));

    try {
      const { WorkflowPublishInvocationDetailPanel: IsolatedWorkflowPublishInvocationDetailPanel } =
        await import("@/components/workflow-publish-invocation-detail-panel");

      renderToStaticMarkup(
        createElement(IsolatedWorkflowPublishInvocationDetailPanel, {
          currentHref: "/workflows/workflow-1?publish_invocation=invocation-1",
          detail: buildDetail(),
          clearHref: "/published?clear=1",
          tools: [],
          callbackWaitingAutomation
        })
      );

      expect(
        callbackSummaryProps.some(
          (props) =>
            props.runId === "run-callback-1" &&
            props.callbackWaitingAutomation === callbackWaitingAutomation &&
            props.currentHref === "/workflows/workflow-1?publish_invocation=invocation-1"
        )
      ).toBe(true);
    } finally {
      vi.doUnmock("@/components/callback-waiting-summary-card");
      vi.doUnmock("@/components/workflow-publish-invocation-callback-section");
      vi.doUnmock("@/components/tool-governance-summary");
      vi.doUnmock("@/components/sensitive-access-timeline-entry-list");
      vi.doUnmock("@/components/run-diagnostics-execution/execution-node-card");
      vi.doUnmock("next/link");
      vi.resetModules();
    }
  });

  it("keeps workspace starter scope on publish detail run drilldown links", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishInvocationDetailPanel, {
        currentHref: "/workflows/workflow-1?publish_invocation=invocation-1",
        detail: buildDetail(),
        clearHref: "/published?clear=1",
        tools: [],
        callbackWaitingAutomation,
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: "drift",
          selectedTemplateId: "starter-1"
        }
      })
    );

    expect(html).toContain(
      '/runs/run-callback-1?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;starter=starter-1&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
  });
});
