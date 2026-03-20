import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPublishInvocationDetailPanel } from "@/components/workflow-publish-invocation-detail-panel";
import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-diagnostics-execution/execution-node-card", () => ({
  ExecutionNodeCard: () => createElement("div", { "data-testid": "execution-node-card" })
}));

vi.mock("@/components/sensitive-access-timeline-entry-list", () => ({
  SensitiveAccessTimelineEntryList: ({ emptyCopy }: { emptyCopy: string }) =>
    createElement(
      "div",
      {
        "data-testid": "sensitive-access-timeline-entry-list",
        "data-empty-copy": emptyCopy
      },
      emptyCopy
    )
}));

vi.mock("@/components/tool-governance-summary", () => ({
  ToolGovernanceSummary: () => createElement("div", { "data-testid": "tool-governance-summary" })
}));

vi.mock("@/components/workflow-publish-invocation-callback-section", () => ({
  WorkflowPublishInvocationCallbackSection: () =>
    createElement("div", { "data-testid": "workflow-publish-invocation-callback-section" })
}));

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
    expect(html).not.toContain("Sampled run focus evidence");
    expect(html.match(/Focused skill trace/g)?.length ?? 0).toBe(1);
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
});
