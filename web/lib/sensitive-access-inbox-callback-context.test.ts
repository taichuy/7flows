import { describe, expect, it } from "vitest";

import type { RunExecutionView } from "./get-run-views";
import type { SensitiveAccessInboxEntry } from "./get-sensitive-access";
import { buildSensitiveAccessInboxEntryCallbackContext } from "./sensitive-access-inbox-callback-context";

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
      action_type: "invoke" as const,
      purpose_text: "Need approval before external callback resumes the run.",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "sensitive_callback",
      reason_label: "Sensitive callback",
      policy_summary: "Wait for operator approval before resuming.",
      created_at: "2026-03-18T10:00:00Z",
      decided_at: null
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
    notifications: [],
    ...overrides
  };
}

function createExecutionView(): RunExecutionView {
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
      callback_ticket_count: 1,
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
      callback_ticket_status_counts: { pending: 1 },
      sensitive_access_decision_counts: { require_approval: 1 },
      sensitive_access_approval_status_counts: { pending: 1 },
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
        scheduled_resume_requeued_node_count: 0,
        resume_source_counts: { operator_callback_resume: 1 },
        scheduled_resume_source_counts: { callback_ticket_monitor: 1 },
        termination_reason_counts: {}
      }
    },
    nodes: [
      {
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
        started_at: null,
        finished_at: null,
        event_count: 0,
        event_type_counts: {},
        last_event_type: null,
        artifact_refs: [],
        artifacts: [],
        tool_calls: [],
        ai_calls: [],
        callback_tickets: [
          {
            ticket: "callback-ticket-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            tool_call_id: null,
            tool_id: "native.search",
            tool_call_index: 0,
            waiting_status: "waiting_callback",
            status: "pending",
            reason: "callback pending",
            callback_payload: null,
            created_at: "2026-03-18T10:00:00Z",
            expires_at: "2026-03-18T10:05:00Z",
            consumed_at: null,
            canceled_at: null,
            expired_at: null
          }
        ],
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
              purpose_text: "Need approval before external callback resumes the run.",
              decision: "require_approval",
              decision_label: "Require approval",
              reason_code: "sensitive_callback",
              reason_label: "Sensitive callback",
              policy_summary: "Wait for operator approval before resuming.",
              created_at: "2026-03-18T10:00:00Z",
              decided_at: null
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
        callback_waiting_lifecycle: {
          wait_cycle_count: 1,
          issued_ticket_count: 1,
          expired_ticket_count: 0,
          consumed_ticket_count: 0,
          canceled_ticket_count: 0,
          late_callback_count: 0,
          resume_schedule_count: 1,
          max_expired_ticket_count: 2,
          terminated: false,
          termination_reason: null,
          terminated_at: null,
          last_ticket_status: "pending",
          last_ticket_reason: "callback pending",
          last_ticket_updated_at: "2026-03-18T10:00:00Z",
          last_late_callback_status: null,
          last_late_callback_reason: null,
          last_late_callback_at: null,
          last_resume_delay_seconds: 5,
          last_resume_reason: "callback pending",
          last_resume_source: "callback_ticket_monitor",
          last_resume_backoff_attempt: 1
        },
        scheduled_resume_delay_seconds: 5,
        scheduled_resume_reason: "callback pending",
        scheduled_resume_source: "callback_ticket_monitor",
        scheduled_waiting_status: "waiting_callback",
        scheduled_resume_scheduled_at: "2026-03-18T10:00:00Z",
        scheduled_resume_due_at: "2026-03-18T10:05:00Z"
      }
    ]
  };
}

function createAdditionalSensitiveAccessEntry(): RunExecutionView["nodes"][number]["sensitive_access_entries"][number] {
  return {
    request: {
      id: "request-2",
      run_id: "run-1",
      node_run_id: "node-run-1",
      requester_type: "tool" as const,
      requester_id: "native.notify",
      resource_id: "resource-2",
      action_type: "invoke",
      purpose_text: "Notify operator before callback resumes.",
      decision: "require_approval" as const,
      decision_label: "Require approval",
      reason_code: "notification_delivery_failed",
      reason_label: "Notification delivery failed",
      policy_summary: "Retry notification before forcing resume.",
      created_at: "2026-03-18T10:02:00Z",
      decided_at: null
    },
    resource: {
      id: "resource-2",
      label: "Notification channel",
      description: "Operator notification target",
      sensitivity_level: "L2",
      source: "local_capability",
      metadata: {},
      created_at: "2026-03-18T09:02:00Z",
      updated_at: "2026-03-18T09:02:00Z"
    },
    approval_ticket: {
      id: "ticket-2",
      access_request_id: "request-2",
      run_id: "run-1",
      node_run_id: "node-run-1",
      status: "pending" as const,
      waiting_status: "waiting" as const,
      approved_by: null,
      decided_at: null,
      expires_at: "2026-03-18T10:07:00Z",
      created_at: "2026-03-18T10:02:00Z"
    },
    notifications: [
      {
        id: "dispatch-2",
        approval_ticket_id: "ticket-2",
        channel: "email" as const,
        target: "ops@example.com",
        status: "failed" as const,
        error: "SMTP timeout",
        created_at: "2026-03-18T10:02:30Z",
        delivered_at: null
      }
    ]
  };
}

describe("sensitive access inbox callback context", () => {
  it("为 inbox 条目复用 run detail 的 callback waiting 解释上下文", () => {
    const entry = createInboxEntry();
    const context = buildSensitiveAccessInboxEntryCallbackContext(entry, createExecutionView());

    expect(context).not.toBeNull();
    expect(context?.runId).toBe("run-1");
    expect(context?.nodeRunId).toBe("node-run-1");
    expect(context?.waitingReason).toBe("Waiting for callback approval");
    expect(context?.callbackTickets).toHaveLength(1);
    expect(context?.scheduledResumeSource).toBe("callback_ticket_monitor");
    expect(context?.scheduledResumeScheduledAt).toBe("2026-03-18T10:00:00Z");
    expect(context?.scheduledResumeDueAt).toBe("2026-03-18T10:05:00Z");
    expect(context?.sensitiveAccessEntries).toHaveLength(1);
    expect(context?.sensitiveAccessEntries[0]?.approval_ticket?.id).toBe("ticket-1");
  });

  it("在缺少 node_run_id 时会回退到 sensitive access 关联节点", () => {
    const entry = createInboxEntry({
      ticket: {
        ...createInboxEntry().ticket,
        node_run_id: null
      },
      request: {
        ...createInboxEntry().request!,
        node_run_id: null
      }
    });

    const context = buildSensitiveAccessInboxEntryCallbackContext(entry, createExecutionView());

    expect(context?.nodeRunId).toBe("node-run-1");
    expect(context?.callbackTickets[0]?.ticket).toBe("callback-ticket-1");
  });

  it("为 inbox callback follow-up 复用整节点的 sensitive access blockers", () => {
    const executionView = createExecutionView();
    executionView.nodes[0]!.sensitive_access_entries.push(createAdditionalSensitiveAccessEntry());

    const context = buildSensitiveAccessInboxEntryCallbackContext(createInboxEntry(), executionView);

    expect(context?.sensitiveAccessEntries).toHaveLength(2);
    expect(
      context?.sensitiveAccessEntries.map((item) => item.approval_ticket?.id).sort()
    ).toEqual(["ticket-1", "ticket-2"]);
    expect(context?.sensitiveAccessEntries[1]?.notifications[0]?.status).toBe("failed");
  });

  it("当 execution view 尚未回填当前票据时，仍保留当前 inbox 条目", () => {
    const executionView = createExecutionView();
    executionView.nodes[0]!.sensitive_access_entries = [createAdditionalSensitiveAccessEntry()];

    const context = buildSensitiveAccessInboxEntryCallbackContext(createInboxEntry(), executionView);

    expect(context?.sensitiveAccessEntries).toHaveLength(2);
    expect(
      context?.sensitiveAccessEntries.map((item) => item.approval_ticket?.id).sort()
    ).toEqual(["ticket-1", "ticket-2"]);
    expect(
      context?.sensitiveAccessEntries.find((item) => item.approval_ticket?.id === "ticket-1")
        ?.request.reason_code
    ).toBe("sensitive_callback");
  });
});
