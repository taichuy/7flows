import { describe, expect, it } from "vitest";

import type { RunExecutionNodeItem, RunExecutionView } from "@/lib/get-run-views";

import { pickTopBlockerNodes } from "../run-execution-blockers";

function createExecutionNode(
  overrides: Partial<RunExecutionNodeItem> = {}
): RunExecutionNodeItem {
  return {
    node_run_id: "node-run-1",
    node_id: "tool_wait",
    node_name: "Tool Wait",
    node_type: "tool",
    status: "running",
    phase: "tool_execute",
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
    waiting_reason: null,
    error_message: null,
    started_at: "2026-03-18T10:00:00Z",
    finished_at: null,
    event_count: 0,
    event_type_counts: {},
    last_event_type: null,
    artifact_refs: [],
    artifacts: [],
    tool_calls: [],
    ai_calls: [],
    callback_tickets: [],
    skill_reference_load_count: 0,
    skill_reference_loads: [],
    sensitive_access_entries: [],
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

function createExecutionView(nodes: RunExecutionNodeItem[]): RunExecutionView {
  return {
    run_id: "run-1",
    workflow_id: "wf-1",
    workflow_version: "0.1.0",
    compiled_blueprint_id: null,
    status: "running",
    summary: {
      node_run_count: nodes.length,
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
    skill_trace: null,
    nodes
  };
}

describe("run execution blockers", () => {
  it("把纯 execution blocked 节点纳入 priority blockers", () => {
    const blockedNode = createExecutionNode({
      node_run_id: "node-run-blocked",
      node_name: "Sandbox Tool",
      execution_blocking_reason:
        "Compatibility adapter 'compat:dify' does not support requested execution class 'sandbox'.",
      execution_blocked_count: 1
    });
    const plainNode = createExecutionNode({
      node_run_id: "node-run-plain",
      node_name: "Plain Tool"
    });

    const blockers = pickTopBlockerNodes(createExecutionView([plainNode, blockedNode]));

    expect(blockers).toHaveLength(1);
    expect(blockers[0]?.node_run_id).toBe("node-run-blocked");
  });

  it("让真实审批阻塞继续优先于 execution blocked", () => {
    const approvalNode = createExecutionNode({
      node_run_id: "node-run-approval",
      node_name: "Approval Wait",
      status: "waiting_callback",
      waiting_reason: "waiting approval",
      sensitive_access_entries: [
        {
          request: {
            id: "request-1",
            run_id: "run-1",
            node_run_id: "node-run-approval",
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
            node_run_id: "node-run-approval",
            status: "pending",
            waiting_status: "waiting",
            approved_by: null,
            decided_at: null,
            expires_at: "2026-03-18T10:05:00Z",
            created_at: "2026-03-18T10:00:00Z"
          },
          notifications: []
        }
      ]
    });
    const blockedNode = createExecutionNode({
      node_run_id: "node-run-blocked",
      execution_blocking_reason:
        "sandbox_code requested execution class 'sandbox', but no compatible sandbox backend is registered.",
      execution_blocked_count: 1
    });

    const blockers = pickTopBlockerNodes(createExecutionView([blockedNode, approvalNode]));

    expect(blockers[0]?.node_run_id).toBe("node-run-approval");
    expect(blockers[1]?.node_run_id).toBe("node-run-blocked");
  });
});
