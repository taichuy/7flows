import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsExecutionSections } from "@/components/run-diagnostics-execution-sections";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { RunEvidenceView, RunExecutionView } from "@/lib/get-run-views";

const { executionOverviewSpy, executionNodeCardSpy } = vi.hoisted(() => ({
  executionOverviewSpy: vi.fn(),
  executionNodeCardSpy: vi.fn()
}));

vi.mock("@/components/run-diagnostics-execution/execution-overview", () => ({
  RunDiagnosticsExecutionOverview: (props: Record<string, unknown>) => {
    executionOverviewSpy(props);
    return createElement("div", { "data-testid": "execution-overview" });
  }
}));

vi.mock("@/components/run-diagnostics-execution/execution-node-card", () => ({
  ExecutionNodeCard: (props: Record<string, unknown>) => {
    executionNodeCardSpy(props);
    return createElement("div", { "data-testid": "execution-node-card" });
  }
}));

vi.mock("@/components/run-diagnostics-execution/evidence-overview", () => ({
  RunDiagnosticsEvidenceOverview: () =>
    createElement("div", { "data-testid": "evidence-overview" })
}));

vi.mock("@/components/run-diagnostics-execution/evidence-node-card", () => ({
  EvidenceNodeCard: () => createElement("div", { "data-testid": "evidence-node-card" })
}));

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "healthy",
    scheduler_required: true,
    detail: "callback waiting automation healthy",
    scheduler_health_status: "healthy",
    scheduler_health_detail: "scheduler loop is healthy",
    steps: []
  };
}

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [],
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

function buildExecutionView(): RunExecutionView {
  return {
    run_id: "run-123",
    workflow_id: "workflow-1",
    workflow_version: "1.0.0",
    compiled_blueprint_id: null,
    status: "waiting",
    summary: {
      node_run_count: 1,
      waiting_node_count: 0,
      errored_node_count: 0,
      execution_dispatched_node_count: 0,
      execution_fallback_node_count: 0,
      execution_blocked_node_count: 0,
      execution_unavailable_node_count: 0,
      artifact_count: 0,
      tool_call_count: 0,
      ai_call_count: 0,
      assistant_call_count: 0,
      callback_ticket_count: 0,
      skill_reference_load_count: 0,
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
        node_count: 0,
        terminated_node_count: 0,
        issued_ticket_count: 0,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 0,
        scheduled_resume_pending_node_count: 0,
        scheduled_resume_requeued_node_count: 0,
        resume_source_counts: {},
        scheduled_resume_source_counts: {},
        termination_reason_counts: {}
      }
    },
    blocking_node_run_id: null,
    execution_focus_reason: null,
    execution_focus_node: null,
    execution_focus_explanation: null,
    legacy_auth_governance: null,
    run_snapshot: null,
    run_follow_up: null,
    skill_trace: null,
    nodes: [
      {
        node_run_id: "node-run-1",
        node_id: "node-1",
        node_name: "Node 1",
        node_type: "tool",
        phase: "execute",
        status: "waiting",
        started_at: "2026-03-21T00:00:00Z",
        finished_at: null,
        error_message: null,
        execution_class: "inline",
        execution_source: "tool_runtime",
        effective_execution_class: null,
        execution_executor_ref: null,
        execution_sandbox_backend_id: null,
        execution_sandbox_runner_kind: null,
        execution_sandbox_backend_executor_ref: null,
        execution_profile: null,
        execution_timeout_ms: null,
        execution_network_policy: null,
        execution_filesystem_policy: null,
        execution_dependency_mode: null,
        execution_builtin_package_set: null,
        execution_dependency_ref: null,
        execution_backend_extensions: null,
        execution_dispatched_count: 0,
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
        execution_blocking_reason: null,
        execution_fallback_reason: null,
        execution_focus_explanation: null,
        callback_waiting_explanation: null,
        callback_waiting_lifecycle: null,
        waiting_reason: null,
        scheduled_resume_delay_seconds: null,
        scheduled_resume_reason: null,
        scheduled_resume_source: null,
        scheduled_waiting_status: null,
        scheduled_resume_scheduled_at: null,
        scheduled_resume_due_at: null,
        scheduled_resume_requeued_at: null,
        scheduled_resume_requeue_source: null,
        retry_count: 0,
        event_count: 0,
        event_type_counts: {},
        last_event_type: null,
        skill_reference_load_count: 0,
        skill_reference_loads: [],
        artifact_refs: [],
        artifacts: [],
        tool_calls: [],
        ai_calls: [],
        callback_tickets: [],
        sensitive_access_entries: []
      }
    ]
  };
}

function buildEvidenceView(): RunEvidenceView {
  return {
    run_id: "run-123",
    workflow_id: "workflow-1",
    workflow_version: "1.0.0",
    status: "waiting",
    summary: {
      node_count: 0,
      artifact_count: 0,
      tool_call_count: 0,
      assistant_call_count: 0
    },
    nodes: []
  };
}

describe("RunDiagnosticsExecutionSections", () => {
  it("forwards workflow detail href into overview and node timeline cards", () => {
    renderToStaticMarkup(
      createElement(RunDiagnosticsExecutionSections, {
        executionView: buildExecutionView(),
        evidenceView: buildEvidenceView(),
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        workflowDetailHref:
          "/workflows/workflow-1?starter=starter-openclaw&definition_issue=legacy_publish_auth",
        workflowId: "workflow-1",
        toolGovernance: {
          referenced_tool_ids: ["native.catalog-gap"],
          missing_tool_ids: ["native.catalog-gap"],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        },
        legacyAuthGovernance: null,
        runDetailHref: "/runs/run-123"
      })
    );

    expect(executionOverviewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDetailHref:
          "/workflows/workflow-1?starter=starter-openclaw&definition_issue=legacy_publish_auth"
      })
    );
    expect(executionNodeCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowDetailHref:
          "/workflows/workflow-1?starter=starter-openclaw&definition_issue=legacy_publish_auth"
      })
    );
  });
});
