import { describe, expect, it } from "vitest";

import type { RunExecutionView } from "@/lib/get-run-views";
import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";

import { buildSensitiveAccessInboxEntryExecutionContext } from "./sensitive-access-inbox-execution-context";

function createInboxEntry(
  overrides: Partial<SensitiveAccessInboxEntry> = {}
): SensitiveAccessInboxEntry {
  return {
    ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-18T10:05:00Z",
      created_at: "2026-03-18T10:00:00Z"
    },
    request: {
      id: "request-1",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "tool",
      requester_id: "native.search",
      resource_id: "resource-1",
      action_type: "invoke",
      created_at: "2026-03-18T10:00:00Z"
    },
    resource: null,
    notifications: [],
    ...overrides
  };
}

function createExecutionNode(
  overrides: Partial<RunExecutionView["nodes"][number]> = {}
): RunExecutionView["nodes"][number] {
  return {
    node_run_id: "node-run-1",
    node_id: "tool_wait",
    node_name: "Tool Wait",
    node_type: "tool",
    status: "waiting_callback",
    phase: "waiting_callback",
    execution_class: "inline",
    execution_source: "workflow_default",
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
    effective_execution_class: null,
    execution_executor_ref: null,
    execution_sandbox_backend_id: null,
    execution_sandbox_backend_executor_ref: null,
    execution_blocking_reason: null,
    execution_fallback_reason: null,
    retry_count: 0,
    waiting_reason: "Waiting for callback approval",
    error_message: null,
    started_at: "2026-03-18T10:00:00Z",
    finished_at: null,
    event_count: 2,
    event_type_counts: {},
    last_event_type: "node.waiting",
    artifact_refs: [],
    artifacts: [],
    tool_calls: [],
    ai_calls: [],
    callback_tickets: [],
    skill_reference_load_count: 0,
    skill_reference_loads: [],
    sensitive_access_entries: [
      {
        request: {
          id: "request-1",
          run_id: "run-1",
          node_run_id: "node-run-1",
          requester_type: "tool",
          requester_id: "native.search",
          resource_id: "resource-1",
          action_type: "invoke",
          created_at: "2026-03-18T10:00:00Z"
        },
        resource: {
          id: "resource-1",
          label: "Callback capability",
          description: "External callback channel",
          sensitivity_level: "L2",
          source: "local_capability",
          metadata: {},
          created_at: "2026-03-18T09:00:00Z",
          updated_at: "2026-03-18T09:00:00Z"
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
          expires_at: "2026-03-18T10:05:00Z",
          created_at: "2026-03-18T10:00:00Z"
        },
        notifications: []
      }
    ],
    callback_waiting_lifecycle: null,
    scheduled_resume_delay_seconds: null,
    scheduled_resume_reason: null,
    scheduled_resume_source: null,
    scheduled_waiting_status: null,
    scheduled_resume_scheduled_at: null,
    scheduled_resume_due_at: null,
    ...overrides
  };
}

function createExecutionView(
  overrides: Partial<RunExecutionView> = {}
): RunExecutionView {
  const focusNode = createExecutionNode();

  return {
    run_id: "run-1",
    workflow_id: "wf-1",
    workflow_version: "0.1.0",
    compiled_blueprint_id: null,
    status: "waiting",
    summary: {
      node_run_count: 1,
      waiting_node_count: 1,
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
      sensitive_access_request_count: 1,
      sensitive_access_approval_ticket_count: 1,
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
      sensitive_access_decision_counts: { require_approval: 1 },
      sensitive_access_approval_status_counts: { pending: 1 },
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
        resume_source_counts: {},
        scheduled_resume_source_counts: {},
        termination_reason_counts: {}
      }
    },
    execution_focus_reason: "blocking_node_run",
    execution_focus_node: focusNode,
    skill_trace: null,
    nodes: [focusNode],
    ...overrides
  };
}

describe("sensitive access inbox execution context", () => {
  it("为 inbox 条目复用后端选出的 execution focus 节点", () => {
    const context = buildSensitiveAccessInboxEntryExecutionContext(
      createInboxEntry(),
      createExecutionView()
    );

    expect(context).not.toBeNull();
    expect(context?.runId).toBe("run-1");
    expect(context?.focusReason).toBe("blocking_node_run");
    expect(context?.focusNode.node_run_id).toBe("node-run-1");
    expect(context?.focusMatchesEntry).toBe(true);
  });

  it("当 execution focus 切到其他 blocker 时保留条目节点与 focus 节点的差异", () => {
    const context = buildSensitiveAccessInboxEntryExecutionContext(
      createInboxEntry(),
      createExecutionView({
        execution_focus_reason: "blocked_execution",
        execution_focus_node: createExecutionNode({
          node_run_id: "node-run-2",
          node_id: "sandbox_tool",
          node_name: "Sandbox Tool",
          status: "blocked",
          phase: "dispatch",
          execution_class: "sandbox",
          execution_blocked_count: 1,
          execution_blocking_reason: "sandbox backend unavailable",
          sensitive_access_entries: []
        }),
        nodes: [
          createExecutionNode(),
          createExecutionNode({
            node_run_id: "node-run-2",
            node_id: "sandbox_tool",
            node_name: "Sandbox Tool",
            status: "blocked",
            phase: "dispatch",
            execution_class: "sandbox",
            execution_blocked_count: 1,
            execution_blocking_reason: "sandbox backend unavailable",
            sensitive_access_entries: []
          })
        ]
      })
    );

    expect(context).not.toBeNull();
    expect(context?.focusMatchesEntry).toBe(false);
    expect(context?.entryNode?.node_run_id).toBe("node-run-1");
    expect(context?.focusNode.node_run_id).toBe("node-run-2");
    expect(context?.focusNode.execution_blocking_reason).toContain("sandbox backend unavailable");
  });
});
