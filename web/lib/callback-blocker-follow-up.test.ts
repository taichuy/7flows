import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunExecutionView } from "./get-run-views";
import { fetchCallbackBlockerSnapshot } from "./callback-blocker-follow-up";
import { getRunExecutionView } from "./get-run-views";

vi.mock("@/lib/get-run-views", () => ({
  getRunExecutionView: vi.fn()
}));

function createExecutionView(): RunExecutionView {
  return {
    run_id: "run-callback-follow-up",
    workflow_id: "wf-callback-follow-up",
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
        issued_ticket_count: 0,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 0,
        scheduled_resume_pending_node_count: 1,
        resume_source_counts: {},
        scheduled_resume_source_counts: { route_cleanup: 1 },
        termination_reason_counts: {}
      }
    },
    nodes: [
      {
        node_run_id: "node-run-1",
        node_id: "agent",
        node_name: "Agent",
        node_type: "llm_agent",
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
        waiting_reason: "Waiting for callback",
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
        callback_tickets: [],
        skill_reference_load_count: 0,
        skill_reference_loads: [],
        sensitive_access_entries: [],
        callback_waiting_lifecycle: null,
        scheduled_resume_delay_seconds: 0,
        scheduled_resume_reason: "waiting callback backoff",
        scheduled_resume_source: "route_cleanup",
        scheduled_waiting_status: "waiting_callback"
      }
    ]
  };
}

describe("callback blocker follow-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("把 scheduled resume 作为 operator blocker 快照的一部分", async () => {
    vi.mocked(getRunExecutionView).mockResolvedValue(createExecutionView());

    const snapshot = await fetchCallbackBlockerSnapshot({
      runId: "run-callback-follow-up",
      nodeRunId: "node-run-1"
    });

    expect(snapshot?.operatorStatuses).toContainEqual({
      kind: "scheduled_resume_pending",
      label: "scheduled resume queued",
      detail: "runtime will retry in 0s · route_cleanup · waiting_callback"
    });
    expect(snapshot?.recommendedAction).toMatchObject({
      kind: "watch_scheduled_resume",
      label: "Watch the scheduled resume"
    });
  });

  it("把 callback waiting automation 传进 blocker 快照推荐动作", async () => {
    const executionView = createExecutionView();
    executionView.nodes[0] = {
      ...executionView.nodes[0],
      scheduled_resume_delay_seconds: 5,
      scheduled_resume_source: "callback_ticket_monitor",
      scheduled_resume_scheduled_at: "2024-03-18T10:00:00Z",
      scheduled_resume_due_at: "2024-03-18T10:05:00Z"
    };
    vi.mocked(getRunExecutionView).mockResolvedValue(executionView);

    const snapshot = await fetchCallbackBlockerSnapshot({
      runId: "run-callback-follow-up",
      nodeRunId: "node-run-1",
      callbackWaitingAutomation: {
        status: "partial",
        scheduler_required: true,
        detail: "`WAITING_CALLBACK` 只完成了部分后台补偿配置。",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "waiting resume monitor 最近没有成功执行。",
        steps: [
          {
            key: "waiting_resume_monitor",
            label: "Requeue due waiting callbacks",
            task: "runtime.monitor_waiting_resumes",
            source: "scheduler_waiting_resume_monitor",
            enabled: true,
            interval_seconds: 30,
            detail: "周期扫描到期的 waiting callback。",
            scheduler_health: {
              health_status: "degraded",
              detail: "最近执行事实已超过调度窗口。",
              last_status: "succeeded",
              last_started_at: null,
              last_finished_at: "2026-03-18T09:00:00Z",
              matched_count: 0,
              affected_count: 0
            }
          }
        ]
      }
    });

    expect(snapshot?.recommendedAction).toMatchObject({
      kind: "manual_resume",
      label: "Scheduled resume is overdue"
    });
    expect(snapshot?.recommendedAction?.detail).toContain(
      "automation Requeue due waiting callbacks: degraded"
    );
  });
});
