import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsExecutionOverviewBlockers } from "@/components/run-diagnostics-execution/execution-overview-blockers";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import type { RunExecutionNodeItem, RunExecutionSkillTrace, RunExecutionView } from "@/lib/get-run-views";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

vi.mock("@/components/callback-waiting-summary-card", () => ({
  CallbackWaitingSummaryCard: ({
    focusEvidenceDrilldownLink,
    focusSkillTrace,
    focusSkillReferenceCount,
    focusSkillReferenceNodeName,
    nodeRunId,
    workflowCatalogGapSummary,
    workflowGovernanceHref,
    legacyAuthHandoff
  }: {
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
    focusSkillReferenceCount?: number | null;
    focusSkillReferenceNodeName?: string | null;
    nodeRunId?: string | null;
    workflowCatalogGapSummary?: string | null;
    workflowGovernanceHref?: string | null;
    legacyAuthHandoff?: {
      bindingChipLabel?: string | null;
    } | null;
  }) =>
    createElement(
      "div",
      { "data-testid": `callback-waiting-summary-card:${nodeRunId ?? "unknown"}` },
      `drilldown ${focusEvidenceDrilldownLink?.label ?? "none"} ${focusEvidenceDrilldownLink?.href ?? "none"} ` +
        `trace scope ${focusSkillTrace?.scope ?? "none"} ` +
        `trace refs ${(focusSkillTrace?.reference_count ?? 0).toString()} ` +
        `trace nodes ${(focusSkillTrace?.nodes?.length ?? 0).toString()} ` +
        `trace node ${focusSkillTrace?.nodes?.[0]?.node_run_id ?? "n/a"} ` +
        `fallback refs ${(focusSkillReferenceCount ?? 0).toString()} ` +
        `fallback node ${focusSkillReferenceNodeName ?? "n/a"} ` +
        `workflow ${workflowCatalogGapSummary ?? "none"} ${workflowGovernanceHref ?? "none"} ` +
        `legacy auth ${legacyAuthHandoff?.bindingChipLabel ?? "none"}`
    )
}));

vi.mock("@/components/operator-focus-evidence-card", () => ({
  OperatorFocusEvidenceCard: ({
    artifactSummary,
    artifactCount,
    artifactRefCount,
    drilldownLink,
    toolCallCount,
    toolCallSummaries
  }: {
    artifactSummary?: string | null;
    artifactCount?: number;
    artifactRefCount?: number;
    drilldownLink?: {
      href: string;
      label: string;
    } | null;
    toolCallCount?: number;
    toolCallSummaries?: Array<{
      title?: string | null;
    }>;
  }) =>
    createElement(
      "div",
      { "data-testid": "operator-focus-evidence-card" },
      `artifacts ${(artifactCount ?? 0).toString()} ` +
        `artifact refs ${(artifactRefCount ?? 0).toString()} ` +
        `tool calls ${(toolCallCount ?? 0).toString()} ` +
        `summary ${artifactSummary ?? "none"} ` +
        `drilldown ${drilldownLink?.label ?? "none"} ${drilldownLink?.href ?? "none"} ` +
        `first tool ${toolCallSummaries?.[0]?.title ?? "n/a"}`
    )
}));

vi.mock("@/components/skill-reference-load-list", () => ({
  SkillReferenceLoadList: ({
    title,
    skillReferenceLoads
  }: {
    title?: string | null;
    skillReferenceLoads?: Array<{
      references?: Array<{
        reference_name?: string | null;
      }>;
    }>;
  }) =>
    createElement(
      "div",
      { "data-testid": "skill-reference-load-list" },
      `${title ?? "Skill references"} count ${
        skillReferenceLoads?.reduce(
          (total, item) => total + (item.references?.length ?? 0),
          0
        ) ?? 0
      } first ref ${skillReferenceLoads?.[0]?.references?.[0]?.reference_name ?? "n/a"}`
    )
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

function buildNode(overrides: Partial<RunExecutionNodeItem>): RunExecutionNodeItem {
  return {
    node_run_id: "node-run-focus",
    node_id: "focus_node",
    node_name: "Focus node",
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
    event_type_counts: { "node.waiting": 1 },
    last_event_type: "node.waiting",
    artifact_refs: [],
    artifacts: [],
    tool_calls: [],
    ai_calls: [],
    callback_tickets: [],
    skill_reference_load_count: 1,
    skill_reference_loads: [
      {
        phase: "plan",
        references: [
          {
            skill_id: "skill-focus",
            skill_name: "Focus skill",
            reference_id: "ref-focus",
            reference_name: "Focus checklist",
            load_source: "explicit",
            fetch_reason: "排障 callback waiting",
            fetch_request_index: 1,
            fetch_request_total: 1,
            retrieval_http_path: "/skills/focus",
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
    scheduled_resume_requeue_source: "waiting_resume_monitor",
    ...overrides
  };
}

function buildSkillTrace(): RunExecutionSkillTrace {
  return {
    scope: "run",
    reference_count: 3,
    phase_counts: { plan: 3 },
    source_counts: { explicit: 2, binding: 1 },
    nodes: [
      {
        node_run_id: "node-run-focus",
        node_id: "focus_node",
        node_name: "Focus node",
        reference_count: 1,
        loads: [
          {
            phase: "plan",
            references: [
              {
                skill_id: "skill-focus",
                skill_name: "Focus skill",
                reference_id: "ref-focus",
                reference_name: "Focus checklist",
                load_source: "explicit",
                fetch_reason: "排障 callback waiting",
                fetch_request_index: 1,
                fetch_request_total: 1,
                retrieval_http_path: "/skills/focus",
                retrieval_mcp_method: null,
                retrieval_mcp_params: {}
              }
            ]
          }
        ]
      },
      {
        node_run_id: "node-run-blocker",
        node_id: "blocker_node",
        node_name: "Blocker node",
        reference_count: 2,
        loads: [
          {
            phase: "plan",
            references: [
              {
                skill_id: "skill-blocker",
                skill_name: "Blocker skill",
                reference_id: "ref-blocker-1",
                reference_name: "Blocker checklist",
                load_source: "binding",
                fetch_reason: null,
                fetch_request_index: null,
                fetch_request_total: null,
                retrieval_http_path: null,
                retrieval_mcp_method: null,
                retrieval_mcp_params: {}
              },
              {
                skill_id: "skill-blocker",
                skill_name: "Blocker skill",
                reference_id: "ref-blocker-2",
                reference_name: "Blocker follow-up",
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

function buildExecutionView(): RunExecutionView {
  const focusNode = buildNode({
    node_run_id: "node-run-focus",
    node_id: "focus_node",
    node_name: "Focus node"
  });
  const blockerNode = buildNode({
    node_run_id: "node-run-blocker",
    node_id: "blocker_node",
    node_name: "Blocker node",
    skill_reference_load_count: 0,
    skill_reference_loads: []
  });

  return {
    run_id: "run-callback-1",
    workflow_id: "workflow-1",
    workflow_version: "v1",
    compiled_blueprint_id: null,
    status: "waiting",
    summary: {
      node_run_count: 2,
      waiting_node_count: 2,
      errored_node_count: 0,
      execution_dispatched_node_count: 2,
      execution_fallback_node_count: 0,
      execution_blocked_node_count: 0,
      execution_unavailable_node_count: 0,
      artifact_count: 0,
      tool_call_count: 0,
      ai_call_count: 0,
      assistant_call_count: 0,
      callback_ticket_count: 0,
      skill_reference_load_count: 1,
      sensitive_access_request_count: 0,
      sensitive_access_approval_ticket_count: 0,
      sensitive_access_notification_count: 0,
      artifact_kind_counts: {},
      tool_status_counts: {},
      ai_role_counts: {},
      execution_requested_class_counts: {},
      execution_effective_class_counts: {},
      execution_executor_ref_counts: {},
      execution_sandbox_backend_counts: {},
      skill_reference_phase_counts: {},
      skill_reference_source_counts: {},
      callback_ticket_status_counts: {},
      sensitive_access_decision_counts: {},
      sensitive_access_approval_status_counts: {},
      sensitive_access_notification_status_counts: {},
      callback_waiting: {
        node_count: 1,
        terminated_node_count: 0,
        issued_ticket_count: 1,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 1,
        scheduled_resume_pending_node_count: 1,
        scheduled_resume_requeued_node_count: 1,
        resume_source_counts: {
          callback_ticket_monitor: 1
        },
        scheduled_resume_source_counts: {
          callback_ticket_monitor: 1
        },
        termination_reason_counts: {}
      }
    },
    execution_focus_reason: "blocking_node_run",
    execution_focus_explanation: {
      primary_signal: "Focus node is still blocking the run.",
      follow_up: "Check callback waiting next."
    },
    execution_focus_node: focusNode,
    skill_trace: buildSkillTrace(),
    nodes: [focusNode, blockerNode]
  };
}

describe("RunDiagnosticsExecutionOverviewBlockers", () => {
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();

  it("filters shared skill trace for focus and blocker cards", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsExecutionOverviewBlockers, {
        executionView: buildExecutionView(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation()
      })
    );

    expect(html).toContain("callback-waiting-summary-card:node-run-focus");
    expect(html).not.toContain("Focus node is still blocking the run.");
    expect(html).not.toContain("Check callback waiting next.");
    expect(html).not.toContain("当前节点仍在等待 callback。");
    expect(html).not.toContain("优先观察定时恢复是否已重新排队。");
    expect(html).toContain(
      "drilldown jump to focused trace slice /runs/run-callback-1?node_run_id=node-run-focus#run-diagnostics-execution-timeline"
    );
    expect(html).toContain("trace scope run");
    expect(html).toContain("trace refs 1");
    expect(html).toContain("trace node node-run-focus");
    expect(html).toContain("callback-waiting-summary-card:node-run-blocker");
    expect(html).toContain("trace refs 2");
    expect(html).toContain("trace node node-run-blocker");
    expect(html).toContain("fallback refs 0");
    expect(html).toContain("fallback node Blocker node");
    expect(html).toContain("approvals 0 · callback tickets 0 · last resume 45s");
    expect(html).toContain("run detail 已直接带回后端选择的 canonical execution focus");
    expect(html).toContain("当前节点直接来自后端选出的 canonical execution focus");
    expect(html).toContain("effective sandbox");
    expect(html).toContain("executor tool-runtime");
    expect(html).toContain("backend sandbox-default");
    expect(html).toContain("runner tool");
  });

  it("keeps workflow governance handoff on callback blocker cards", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsExecutionOverviewBlockers, {
        executionView: buildExecutionView(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        workflowId: "workflow-1",
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        legacyAuthGovernance: buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
          binding: {
            workflow_id: "workflow-1",
            workflow_name: "Workflow 1"
          }
        })
      })
    );

    expect(html).toContain("workflow catalog gap · native.catalog-gap");
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(html).toContain("legacy auth 1 legacy bindings");
  });

  it("surfaces canonical focus evidence for non-callback execution blockers", () => {
    const focusNode = buildNode({
      node_run_id: "node-run-focus",
      node_id: "focus_node",
      node_name: "Focus node",
      status: "blocked",
      waiting_reason: null,
      callback_waiting_lifecycle: null,
      callback_waiting_explanation: null,
      scheduled_resume_delay_seconds: null,
      scheduled_resume_reason: null,
      scheduled_resume_source: null,
      scheduled_waiting_status: null,
      scheduled_resume_scheduled_at: null,
      scheduled_resume_due_at: null,
      scheduled_resume_requeued_at: null,
      scheduled_resume_requeue_source: null,
      execution_blocking_reason: "No compatible sandbox backend is available.",
      artifact_refs: ["artifact://focus-output"],
      artifacts: [
        {
          id: "artifact-1",
          run_id: "run-blocked-1",
          node_run_id: "node-run-focus",
          artifact_kind: "tool_result",
          content_type: "application/json",
          summary: "Sandbox output persisted for review",
          uri: "artifact://focus-output",
          metadata_payload: {},
          created_at: "2026-03-20T10:00:20Z"
        }
      ],
      tool_calls: [
        {
          id: "tool-call-1",
          run_id: "run-blocked-1",
          node_run_id: "node-run-focus",
          tool_id: "compat:dify-default:plugin:demo/search",
          tool_name: "Demo Search",
          phase: "execute",
          status: "blocked",
          request_summary: "search docs",
          requested_execution_class: "microvm",
          effective_execution_class: "inline",
          execution_blocking_reason: "No compatible sandbox backend is available.",
          raw_ref: "artifact://focus-output",
          latency_ms: 0,
          retry_count: 0,
          created_at: "2026-03-20T10:00:10Z"
        }
      ],
      skill_reference_load_count: 0,
      skill_reference_loads: [],
      execution_focus_explanation: {
        primary_signal: "当前节点因强隔离 backend 不可用而阻断。",
        follow_up: "先恢复兼容 backend，再重新调度该节点。"
      }
    });

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsExecutionOverviewBlockers, {
        executionView: {
          ...buildExecutionView(),
          run_id: "run-blocked-1",
          status: "failed",
          execution_focus_reason: "blocked_execution",
          execution_focus_node: focusNode,
          nodes: [focusNode],
          summary: {
            ...buildExecutionView().summary,
            waiting_node_count: 0,
            execution_blocked_node_count: 1,
            callback_waiting: {
              ...buildExecutionView().summary.callback_waiting,
              node_count: 0,
              issued_ticket_count: 0,
              resume_schedule_count: 0,
              scheduled_resume_pending_node_count: 0,
              scheduled_resume_requeued_node_count: 0,
              resume_source_counts: {},
              scheduled_resume_source_counts: {}
            }
          }
        },
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).not.toContain("callback-waiting-summary-card:node-run-focus");
    expect(html).toContain("operator-focus-evidence-card");
    expect(html).toContain("artifacts 1 artifact refs 1 tool calls 1");
    expect(html).toContain(
      "drilldown jump to focused trace slice /runs/run-blocked-1?node_run_id=node-run-focus#run-diagnostics-execution-timeline"
    );
    expect(html).toContain("first tool Demo Search · blocked");
    expect(html).toContain("skill-reference-load-list");
    expect(html).toContain(
      `${operatorSurfaceCopy.focusedSkillTraceTitle} count 1 first ref Focus checklist`
    );
    expect(html).not.toContain("effective inline");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 仍 blocked。");
  });
});
