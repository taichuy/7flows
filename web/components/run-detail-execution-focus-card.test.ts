import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunDetailExecutionFocusCard } from "@/components/run-detail-execution-focus-card";
import type { RunDetail } from "@/lib/get-run-detail";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import { buildRunDetailExecutionFocusSurfaceCopy } from "@/lib/workbench-entry-surfaces";

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

function buildRunDetail(): RunDetail {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_version: "v1",
    compiled_blueprint_id: null,
    status: "waiting",
    input_payload: {},
    output_payload: null,
    error_message: null,
    current_node_id: "tool_wait",
    started_at: "2026-03-20T10:00:00Z",
    finished_at: null,
    created_at: "2026-03-20T10:00:00Z",
    event_count: 0,
    event_type_counts: {},
    first_event_at: null,
    last_event_at: null,
    blocking_node_run_id: "node-run-1",
    execution_focus_reason: "current_node",
    execution_focus_node: {
      node_run_id: "node-run-1",
      node_id: "tool_wait",
      node_name: "Tool Wait",
      node_type: "tool",
      status: "waiting",
      callback_waiting_explanation: null,
      callback_waiting_lifecycle: null,
      phase: "execute",
      execution_class: "sandbox",
      execution_source: "runtime_policy",
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
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_id: "sandbox-default",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_blocking_reason: null,
      execution_fallback_reason: null,
      scheduled_resume_delay_seconds: null,
      scheduled_resume_reason: null,
      scheduled_resume_source: null,
      scheduled_waiting_status: null,
      scheduled_resume_scheduled_at: null,
      scheduled_resume_due_at: null,
      scheduled_resume_requeued_at: null,
      scheduled_resume_requeue_source: null,
      artifact_refs: [],
      artifacts: [],
      tool_calls: [
        {
          id: "tool-call-1",
          run_id: "run-1",
          node_run_id: "node-run-1",
          tool_id: "callback.wait",
          tool_name: "Callback Wait",
          phase: "execute",
          status: "waiting",
          request_summary: "wait for callback",
          execution_trace: null,
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
          execution_executor_ref: "tool:compat-adapter:dify-default",
          execution_sandbox_backend_id: "sandbox-default",
          execution_sandbox_backend_executor_ref: null,
          execution_sandbox_runner_kind: "container",
          execution_blocking_reason: null,
          execution_fallback_reason: null,
          response_summary: "callback payload persisted",
          response_content_type: "application/json",
          response_meta: {},
          raw_ref: null,
          latency_ms: 120,
          retry_count: 0,
          error_message: null,
          created_at: "2026-03-20T10:00:01Z",
          finished_at: null
        }
      ]
    },
    execution_focus_explanation: {
      primary_signal: "当前节点仍在等待 callback。",
      follow_up: "先看当前 tool 实际落在哪个 runner。"
    },
    execution_focus_skill_trace: null,
    node_runs: [
      {
        id: "node-run-1",
        node_id: "tool_wait",
        node_name: "Tool Wait",
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
        finished_at: null
      }
    ],
    artifacts: [],
    tool_calls: [],
    ai_calls: [],
    events: []
  };
}

describe("RunDetailExecutionFocusCard", () => {
  it("renders compact runtime fact badges for the canonical focus node", () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run: buildRunDetail(),
        title: "Execution focus"
      })
    );

    expect(html).toContain("Tool Wait");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
  });

  it("defers generic focus recommendation to the shared callback waiting summary", () => {
    const run = buildRunDetail();
    run.execution_focus_explanation = {
      primary_signal: "顶层 execution focus 仍在等待 callback。",
      follow_up: "顶层 execution focus 建议先观察重排队。"
    };
    run.execution_focus_node = {
      ...run.execution_focus_node!,
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
      scheduled_resume_requeue_source: "waiting_resume_monitor"
    };

    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run,
        title: "Execution focus"
      })
    );

    expect(html).toContain("当前 waiting 节点仍在等待 callback。");
    expect(html).toContain("优先观察定时恢复是否已重新排队。");
    expect(html).toContain("Recommended next step");
    expect(html).not.toContain("顶层 execution focus 仍在等待 callback。");
    expect(html).not.toContain("顶层 execution focus 建议先观察重排队。");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool:compat-adapter:dify-default");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner container");
  });

  it("restores approval inbox CTA from local callback blocker context when canonical action is missing", () => {
    const run = buildRunDetail();
    run.execution_focus_explanation = {
      primary_signal: "顶层 execution focus 仍在等待 callback。",
      follow_up: "顶层 execution focus 建议先观察重排队。"
    };
    run.execution_focus_node = {
      ...run.execution_focus_node!,
      callback_waiting_explanation: {
        primary_signal: "当前 waiting 节点仍在等待审批放行。",
        follow_up: "先处理审批票据，再回来继续看 callback waiting。"
      },
      callback_waiting_lifecycle: {
        wait_cycle_count: 1,
        issued_ticket_count: 1,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 0,
        max_expired_ticket_count: 0,
        terminated: false,
        last_resume_delay_seconds: null,
        last_resume_source: null,
        last_resume_backoff_attempt: 0
      }
    };
    run.run_follow_up = {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 0,
      unknown_run_count: 0,
      recommended_action: null,
      sampled_runs: [
        {
          run_id: "run-1",
          snapshot: {
            status: "waiting",
            current_node_id: "tool_wait",
            waiting_reason: "callback pending",
            execution_focus_reason: "current_node",
            execution_focus_node_id: "tool_wait",
            execution_focus_node_run_id: "node-run-1",
            execution_focus_node_name: "Tool Wait",
            execution_focus_node_type: "tool",
            execution_focus_explanation: {
              primary_signal: "当前 waiting 节点仍在等待审批放行。",
              follow_up: "先处理审批票据，再回来继续看 callback waiting。"
            },
            callback_waiting_explanation: {
              primary_signal: "当前 waiting 节点仍在等待审批放行。",
              follow_up: "先处理审批票据，再回来继续看 callback waiting。"
            },
            callback_waiting_lifecycle: {
              wait_cycle_count: 1,
              issued_ticket_count: 1,
              expired_ticket_count: 0,
              consumed_ticket_count: 0,
              canceled_ticket_count: 0,
              late_callback_count: 0,
              resume_schedule_count: 0,
              max_expired_ticket_count: 0,
              terminated: false,
              last_resume_delay_seconds: null,
              last_resume_source: null,
              last_resume_backoff_attempt: 0
            },
            scheduled_resume_delay_seconds: null,
            scheduled_resume_reason: null,
            scheduled_resume_source: null,
            scheduled_waiting_status: null,
            scheduled_resume_scheduled_at: null,
            scheduled_resume_due_at: null,
            scheduled_resume_requeued_at: null,
            scheduled_resume_requeue_source: null,
            execution_focus_artifact_count: 0,
            execution_focus_artifact_ref_count: 0,
            execution_focus_tool_call_count: 0,
            execution_focus_raw_ref_count: 0,
            execution_focus_artifact_refs: [],
            execution_focus_artifacts: [],
            execution_focus_tool_calls: [],
            execution_focus_skill_trace: null
          },
          callback_tickets: [],
          sensitive_access_entries: [
            {
              request: {
                id: "access-request-1",
                run_id: "run-1",
                node_run_id: "node-run-1",
                requester_type: "workflow",
                requester_id: "requester-1",
                resource_id: "resource-1",
                action_type: "invoke",
                purpose_text: "读取敏感配置",
                decision: "require_approval",
                decision_label: "require approval",
                reason_code: "sensitive_access_requires_approval",
                reason_label: "需要审批",
                policy_summary: "L3 资源默认要求人工审批。",
                created_at: "2026-03-20T10:00:00Z",
                decided_at: null
              },
              resource: {
                id: "resource-1",
                label: "Search Tool",
                description: "high-risk tool",
                sensitivity_level: "L3",
                source: "local_capability",
                metadata: {},
                created_at: "2026-03-20T10:00:00Z",
                updated_at: "2026-03-20T10:00:00Z"
              },
              approval_ticket: {
                id: "approval-ticket-1",
                access_request_id: "access-request-1",
                run_id: "run-1",
                node_run_id: "node-run-1",
                status: "pending",
                waiting_status: "waiting",
                approved_by: null,
                decided_at: null,
                expires_at: "2026-03-21T10:00:00Z",
                created_at: "2026-03-20T10:00:00Z"
              },
              notifications: [],
              outcome_explanation: null
            }
          ]
        }
      ],
      explanation: {
        primary_signal: "当前 run 已接入 canonical follow-up。",
        follow_up: "优先使用本地 blocker context 恢复 approval inbox CTA。"
      }
    };

    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run,
        title: "Execution focus"
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("先处理审批票据，再回来继续看 callback waiting。");
    expect(html).toContain("Open approval inbox");
    expect(html).toContain(
      'href="/sensitive-access?status=pending&amp;waiting_status=waiting&amp;run_id=run-1&amp;node_run_id=node-run-1&amp;access_request_id=access-request-1&amp;approval_ticket_id=approval-ticket-1"'
    );
  });

  it("shows live sandbox readiness for blocked strong-isolation focus nodes", () => {
    const run = buildRunDetail();
    run.execution_focus_reason = "blocked_execution";
    run.execution_focus_node = {
      ...run.execution_focus_node!,
      status: "blocked",
      execution_blocking_reason: "No compatible sandbox backend is available.",
      effective_execution_class: "inline"
    };
    run.execution_focus_explanation = {
      primary_signal: "当前节点因强隔离 backend 不可用而阻断。",
      follow_up: "先恢复兼容 backend，再重新调度该节点。"
    };

    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run,
        title: "Execution focus",
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 仍 blocked。");
    expect(html).toContain("Strong-isolation execution must fail closed");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
    expect(html).toContain("Open workflow library");
    expect(html).toContain("先恢复兼容 backend，再重新调度该节点。");
  });

  it("falls back to the shared sandbox readiness CTA when execution follow-up is missing", () => {
    const run = buildRunDetail();
    run.node_runs[0] = {
      ...run.node_runs[0]!,
      waiting_reason: null
    };
    run.execution_focus_reason = "blocked_execution";
    run.execution_focus_node = {
      ...run.execution_focus_node!,
      status: "blocked",
      execution_blocking_reason: "No compatible sandbox backend is available.",
      effective_execution_class: "inline"
    };
    run.execution_focus_explanation = {
      primary_signal: "当前节点因强隔离 backend 不可用而阻断。",
      follow_up: null
    };

    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run,
        title: "Execution focus",
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow");
    expect(html).toContain("优先回到 workflow library 处理强隔离 execution class 与隔离需求。");
    expect(html).toContain("Open workflow library");
  });

  it("falls back to the run detail CTA when no explicit execution follow-up exists", () => {
    const run = buildRunDetail();
    run.node_runs[0] = {
      ...run.node_runs[0]!,
      waiting_reason: null
    };
    run.execution_focus_explanation = {
      primary_signal: "当前节点需要继续核对 execution focus。",
      follow_up: null
    };

    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run,
        title: "Execution focus"
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("execution focus");
    expect(html).toContain("当前 run 已回接 canonical execution focus；优先继续检查 focus node、runtime evidence 和 execution fallback / blocking 原因。");
    expect(html).toContain("open run");
  });

  it("prefers canonical run follow-up action before local run CTA fallback", () => {
    const run = buildRunDetail();
    run.node_runs[0] = {
      ...run.node_runs[0]!,
      waiting_reason: null
    };
    run.execution_focus_explanation = {
      primary_signal: "当前节点需要继续核对 execution focus。",
      follow_up: null
    };
    run.run_follow_up = {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 0,
      unknown_run_count: 0,
      recommended_action: {
        kind: "approval blocker",
        entry_key: "operatorInbox",
        href: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
        label: "open approval inbox slice"
      },
      sampled_runs: [
        {
          run_id: "run-1",
          snapshot: null,
          callback_tickets: [],
          sensitive_access_entries: []
        }
      ],
      explanation: {
        primary_signal: "当前 run 已接入 canonical follow-up。",
        follow_up: "先处理审批票据，再回来继续看 execution focus。"
      }
    };

    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run,
        title: "Execution focus"
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("先处理审批票据，再回来继续看 execution focus。");
    expect(html).toContain("open approval inbox slice");
  });

  it("renders the shared skill trace narrative when focus references are present", () => {
    const surfaceCopy = buildRunDetailExecutionFocusSurfaceCopy();
    const run = buildRunDetail();
    run.node_runs[0] = {
      ...run.node_runs[0]!,
      waiting_reason: null
    };
    run.execution_focus_explanation = {
      primary_signal: "当前节点正在消费 skill trace。",
      follow_up: "先核对当前 focus 节点注入了哪些 references。"
    };
    run.execution_focus_skill_trace = {
      reference_count: 1,
      phase_counts: { execute: 1 },
      source_counts: { explicit: 1 },
      loads: [
        {
          phase: "execute",
          references: [
            {
              skill_id: "sandbox-code",
              skill_name: "Sandbox Code",
              reference_id: "ref-1",
              reference_name: "Runtime policy",
              load_source: "explicit",
              fetch_reason: null,
              fetch_request_index: null,
              fetch_request_total: null,
              retrieval_http_path: null,
              retrieval_mcp_method: null,
              retrieval_mcp_params: {}
            }
          ]
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(RunDetailExecutionFocusCard, {
        run,
        title: "Execution focus"
      })
    );

    expect(html).toContain(surfaceCopy.focusedSkillTraceDescription);
    expect(html).toContain("Focused skill trace");
    expect(html).toContain("Injected references");
  });
});
