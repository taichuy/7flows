import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExecutionNodeCard } from "@/components/run-diagnostics-execution/execution-node-card";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { RunExecutionNodeItem, RunExecutionSkillTrace } from "@/lib/get-run-views";

const sensitiveAccessTimelineProps: Array<Record<string, unknown>> = [];

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: ({
    focusNodeEvidence,
    focusEvidenceDrilldownLink,
    focusSkillTrace,
    focusSkillReferenceLoads,
    focusSkillReferenceCount,
    focusSkillReferenceNodeId,
    focusSkillReferenceNodeName
  }: {
    focusNodeEvidence?: {
      artifacts?: unknown[];
      tool_calls?: unknown[];
      artifact_refs?: unknown[];
    } | null;
    focusEvidenceDrilldownLink?: {
      href?: string | null;
      label?: string | null;
    } | null;
    focusSkillTrace?: {
      scope?: string | null;
      reference_count?: number;
      nodes?: Array<{
        node_run_id?: string | null;
      }>;
    } | null;
    focusSkillReferenceLoads?: {
      references?: unknown[];
    }[];
    focusSkillReferenceCount?: number | null;
    focusSkillReferenceNodeId?: string | null;
    focusSkillReferenceNodeName?: string | null;
  }) =>
    createElement(
      "div",
      { "data-testid": "callback-waiting-summary-card" },
      `focus artifacts ${(focusNodeEvidence?.artifacts?.length ?? 0).toString()} ` +
        `focus tools ${(focusNodeEvidence?.tool_calls?.length ?? 0).toString()} ` +
        `focus refs ${(focusNodeEvidence?.artifact_refs?.length ?? 0).toString()} ` +
        `drilldown ${focusEvidenceDrilldownLink?.label ?? "none"} ${focusEvidenceDrilldownLink?.href ?? "none"} ` +
        `trace scope ${focusSkillTrace?.scope ?? "none"} ` +
        `trace refs ${(focusSkillTrace?.reference_count ?? 0).toString()} ` +
        `trace nodes ${(focusSkillTrace?.nodes?.length ?? 0).toString()} ` +
        `trace node ${focusSkillTrace?.nodes?.[0]?.node_run_id ?? "n/a"} ` +
        `skill loads ${(focusSkillReferenceLoads?.length ?? 0).toString()} ` +
        `skill refs ${(focusSkillReferenceCount ?? 0).toString()} ` +
        `skill node ${focusSkillReferenceNodeId ?? "n/a"} ${focusSkillReferenceNodeName ?? "n/a"}`
    )
}));

vi.mock("@/components/run-diagnostics-execution/shared", () => ({
  MetricChipRow: () => createElement("div", { "data-testid": "metric-chip-row" })
}));

vi.mock("@/components/run-diagnostics-execution/execution-node-card-sections", () => ({
  ExecutionNodeAiCallList: () => createElement("div", { "data-testid": "execution-ai-call-list" }),
  ExecutionNodeArtifactSection: () =>
    createElement("div", { "data-testid": "execution-artifact-section" }),
  ExecutionNodeCallbackTicketList: () =>
    createElement("div", { "data-testid": "execution-callback-ticket-list" }),
  ExecutionNodeSkillReferenceLoadList: () =>
    createElement("div", { "data-testid": "execution-skill-reference-load-list" }),
  ExecutionNodeSensitiveAccessSection: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-testid": "execution-sensitive-access-section" }, children),
  ExecutionNodeToolCallList: () =>
    createElement("div", { "data-testid": "execution-tool-call-list" })
}));

vi.mock("@/components/sensitive-access-timeline-entry-list", () => ({
  SensitiveAccessTimelineEntryList: (props: Record<string, unknown>) => {
    sensitiveAccessTimelineProps.push(props);
    return createElement("div", { "data-testid": "sensitive-access-timeline-entry-list" });
  }
}));

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "healthy",
    scheduler_required: true,
    detail: "callback waiting automation is healthy",
    scheduler_health_status: "healthy",
    scheduler_health_detail: "scheduler running",
    steps: []
  };
}

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

function buildExecutionNode(): RunExecutionNodeItem {
  return {
    node_run_id: "node-run-callback",
    node_id: "callback_node",
    node_name: "Callback node",
    node_type: "tool",
    status: "waiting",
    phase: "execute",
    execution_class: "sandbox",
    execution_source: "tool_policy",
    execution_profile: "python-safe",
    execution_timeout_ms: 3000,
    execution_network_policy: "isolated",
    execution_filesystem_policy: "ephemeral",
    execution_dependency_mode: "builtin",
    execution_builtin_package_set: "default",
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
    execution_executor_ref: "tool-runtime",
    execution_sandbox_backend_id: "sandbox-default",
    execution_sandbox_backend_executor_ref: "sandbox-backend:sandbox-default",
    execution_sandbox_runner_kind: "tool",
    execution_blocking_reason: null,
    execution_fallback_reason: null,
    retry_count: 0,
    waiting_reason: "callback pending",
    error_message: null,
    started_at: "2026-03-20T10:00:00Z",
    finished_at: null,
    event_count: 3,
    event_type_counts: {
      "node.waiting": 1
    },
    last_event_type: "node.waiting",
    artifact_refs: ["artifact://callback-artifact"],
    artifacts: [
      {
        id: "artifact-1",
        run_id: "run-callback-1",
        node_run_id: "node-run-callback",
        artifact_kind: "json",
        content_type: "application/json",
        summary: "callback payload artifact",
        uri: "artifact://callback-artifact",
        metadata_payload: {},
        created_at: "2026-03-20T10:00:05Z"
      }
    ],
    tool_calls: [
      {
        id: "tool-call-1",
        run_id: "run-callback-1",
        node_run_id: "node-run-callback",
        tool_id: "callback.fetch",
        tool_name: "Callback Fetch",
        phase: "execute",
        status: "completed",
        request_summary: "poll callback",
        execution_trace: null,
        requested_execution_class: "sandbox",
        requested_execution_source: "tool_policy",
        requested_execution_profile: "python-safe",
        requested_execution_timeout_ms: 3000,
        requested_execution_network_policy: "isolated",
        requested_execution_filesystem_policy: "ephemeral",
        requested_execution_dependency_mode: "builtin",
        requested_execution_builtin_package_set: "default",
        requested_execution_dependency_ref: null,
        requested_execution_backend_extensions: null,
        effective_execution_class: "sandbox",
        execution_executor_ref: "tool-runtime",
        execution_sandbox_backend_id: "sandbox-default",
        execution_sandbox_backend_executor_ref: "sandbox-backend:sandbox-default",
        execution_sandbox_runner_kind: "tool",
        execution_blocking_reason: null,
        execution_fallback_reason: null,
        response_summary: "callback payload 已写入 artifact",
        response_content_type: "application/json",
        response_meta: {},
        raw_ref: "artifact://callback-tool-raw",
        latency_ms: 120,
        retry_count: 0,
        error_message: null,
        created_at: "2026-03-20T10:00:02Z",
        finished_at: "2026-03-20T10:00:02Z"
      }
    ],
    ai_calls: [],
    callback_tickets: [],
    skill_reference_load_count: 1,
    skill_reference_loads: [
      {
        phase: "plan",
        references: [
          {
            skill_id: "skill-callback",
            skill_name: "Callback skill",
            reference_id: "ref-1",
            reference_name: "Callback recovery checklist",
            load_source: "explicit",
            fetch_reason: "确认 callback 恢复条件",
            fetch_request_index: 1,
            fetch_request_total: 1,
            retrieval_http_path: "/skills/callback",
            retrieval_mcp_method: null,
            retrieval_mcp_params: {}
          }
        ]
      }
    ],
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
    execution_focus_explanation: {
      primary_signal: "当前节点仍在等待 callback。",
      follow_up: "优先观察定时恢复是否已重新排队。"
    },
    callback_waiting_explanation: {
      primary_signal: "当前 waiting 节点仍在等待 callback。",
      follow_up: "优先观察定时恢复是否已重新排队。"
    },
    scheduled_resume_delay_seconds: 45,
    scheduled_resume_reason: "callback pending",
    scheduled_resume_source: "callback_ticket_monitor",
    scheduled_waiting_status: "waiting_callback",
    scheduled_resume_scheduled_at: "2026-03-20T10:00:00Z",
    scheduled_resume_due_at: "2026-03-20T10:00:45Z",
    scheduled_resume_requeued_at: "2026-03-20T10:01:30Z",
    scheduled_resume_requeue_source: "waiting_resume_monitor"
  };
}

function buildSkillTrace(): RunExecutionSkillTrace {
  return {
    scope: "run",
    reference_count: 3,
    phase_counts: {
      plan: 3
    },
    source_counts: {
      explicit: 2,
      binding: 1
    },
    nodes: [
      {
        node_run_id: "node-run-callback",
        node_id: "callback_node",
        node_name: "Callback node",
        reference_count: 1,
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
                fetch_reason: "确认 callback 恢复条件",
                fetch_request_index: 1,
                fetch_request_total: 1,
                retrieval_http_path: "/skills/callback",
                retrieval_mcp_method: null,
                retrieval_mcp_params: {}
              }
            ]
          }
        ]
      },
      {
        node_run_id: "node-run-other",
        node_id: "other_node",
        node_name: "Other node",
        reference_count: 2,
        loads: [
          {
            phase: "plan",
            references: [
              {
                skill_id: "skill-other",
                skill_name: "Other skill",
                reference_id: "ref-2",
                reference_name: "Other checklist",
                load_source: "binding",
                fetch_reason: null,
                fetch_request_index: null,
                fetch_request_total: null,
                retrieval_http_path: null,
                retrieval_mcp_method: null,
                retrieval_mcp_params: {}
              },
              {
                skill_id: "skill-other",
                skill_name: "Other skill",
                reference_id: "ref-3",
                reference_name: "Other follow-up",
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
      }
    ]
  };
}

describe("ExecutionNodeCard", () => {
  beforeEach(() => {
    sensitiveAccessTimelineProps.length = 0;
  });

  it("passes compact focus evidence and skill trace into callback waiting summary", () => {
    const callbackWaitingAutomation = buildCallbackWaitingAutomation();
    const html = renderToStaticMarkup(
      createElement(ExecutionNodeCard, {
        node: buildExecutionNode(),
        runId: "run-callback-1",
        callbackWaitingAutomation
      })
    );

    expect(html).toContain("focus artifacts 1");
    expect(html).toContain("focus tools 1");
    expect(html).toContain("focus refs 1");
    expect(html).toContain("drilldown jump to focused trace slice");
    expect(html).toContain(
      "/runs/run-callback-1?node_run_id=node-run-callback#run-diagnostics-execution-timeline"
    );
    expect(html).toContain("trace scope none");
    expect(html).toContain("skill loads 1");
    expect(html).toContain("skill refs 1");
    expect(html).toContain("skill node callback_node Callback node");
    expect(sensitiveAccessTimelineProps[0]?.callbackWaitingAutomation).toEqual(callbackWaitingAutomation);
    expect(sensitiveAccessTimelineProps[0]?.callbackTickets).toEqual(buildExecutionNode().callback_tickets);
    expect(html).not.toContain("当前节点仍在等待 callback。");
    expect(html).not.toContain("优先观察定时恢复是否已重新排队。");
  });

  it("filters shared skill trace down to the current execution node", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutionNodeCard, {
        node: buildExecutionNode(),
        runId: "run-callback-1",
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        skillTrace: buildSkillTrace()
      })
    );

    expect(html).toContain("trace scope run");
    expect(html).toContain("trace refs 1");
    expect(html).toContain("trace nodes 1");
    expect(html).toContain("trace node node-run-callback");
  });

  it("surfaces compact runner facts in the node header strip", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutionNodeCard, {
        node: buildExecutionNode(),
        runId: "run-callback-1",
        callbackWaitingAutomation: buildCallbackWaitingAutomation()
      })
    );

    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool-runtime");
    expect(html).toContain("sandbox sandbox-default");
    expect(html).toContain("runner tool");
  });

  it("reuses shared runtime copy for execution detail summaries", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutionNodeCard, {
        node: {
          ...buildExecutionNode(),
          execution_backend_extensions: {
            concurrency: 2
          },
          requested_execution_class: "microvm",
          requested_execution_source: "workflow_override",
          requested_execution_profile: "python-safe",
          requested_execution_backend_extensions: {
            image: "safe-python"
          },
          execution_fallback_reason: "compat_adapter_execution_class_not_supported",
          callback_waiting_lifecycle: null,
          callback_waiting_explanation: null,
          waiting_reason: null,
          scheduled_resume_delay_seconds: null,
          scheduled_resume_reason: null,
          scheduled_resume_source: null,
          scheduled_waiting_status: null,
          scheduled_resume_scheduled_at: null,
          scheduled_resume_due_at: null,
          scheduled_resume_requeued_at: null,
          scheduled_resume_requeue_source: null
        },
        runId: "run-callback-1",
        callbackWaitingAutomation: buildCallbackWaitingAutomation()
      })
    );

    expect(html).toContain("Backend extensions {&quot;concurrency&quot;:2}");
    expect(html).toContain("Dispatch request class microvm");
    expect(html).toContain("Dispatch backend extensions {&quot;image&quot;:&quot;safe-python&quot;}");
    expect(html).toContain("执行降级：compat_adapter_execution_class_not_supported");
  });

  it("shows live sandbox readiness when a node is blocked on strong isolation", () => {
    const blockedNode = {
      ...buildExecutionNode(),
      status: "blocked",
      callback_waiting_lifecycle: null,
      callback_waiting_explanation: null,
      execution_blocking_reason: "No compatible sandbox backend is available.",
      execution_blocked_count: 1,
      scheduled_resume_delay_seconds: null,
      scheduled_resume_reason: null,
      scheduled_resume_source: null,
      scheduled_waiting_status: null,
      scheduled_resume_scheduled_at: null,
      scheduled_resume_due_at: null,
      scheduled_resume_requeued_at: null,
      scheduled_resume_requeue_source: null
    } satisfies RunExecutionNodeItem;

    const html = renderToStaticMarkup(
      createElement(ExecutionNodeCard, {
        node: blockedNode,
        runId: "run-callback-1",
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 仍 blocked。");
    expect(html).toContain("Strong-isolation execution must fail closed");
  });
});
