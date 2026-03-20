import { describe, expect, it } from "vitest";

import { buildRunDetailExecutionFocusViewModel } from "@/lib/run-detail-execution-focus";

describe("run detail execution focus", () => {
  it("优先消费 run detail 已返回的 canonical execution focus 解释与证据", () => {
    const model = buildRunDetailExecutionFocusViewModel({
      id: "run-1",
      workflow_id: "wf-review",
      workflow_version: "v1",
      status: "waiting",
      input_payload: {},
      output_payload: null,
      error_message: null,
      created_at: "2026-03-20T12:00:00Z",
      event_count: 3,
      event_type_counts: {},
      node_runs: [
        {
          id: "node-run-focus",
          node_id: "agent_review",
          node_name: "Agent Review",
          node_type: "llm_agent",
          status: "waiting",
          input_payload: {},
          output_payload: null,
          waiting_reason: "waiting approval",
          started_at: "2026-03-20T12:00:10Z",
          finished_at: null
        }
      ],
      events: [],
      execution_focus_reason: "blocking_node_run",
      execution_focus_node: {
        node_run_id: "node-run-focus",
        node_id: "agent_review",
        node_name: "Agent Review",
        node_type: "llm_agent",
        status: "waiting",
        callback_waiting_explanation: {
          primary_signal: "当前节点仍在等待人工审批。",
          follow_up: "优先处理审批票据，再观察 runtime 是否恢复。"
        },
        callback_waiting_lifecycle: {
          wait_cycle_count: 1,
          issued_ticket_count: 1,
          expired_ticket_count: 0,
          consumed_ticket_count: 0,
          canceled_ticket_count: 0,
          late_callback_count: 0,
          resume_schedule_count: 1,
          max_expired_ticket_count: 3,
          terminated: false,
          termination_reason: null,
          terminated_at: null,
          last_ticket_status: "pending",
          last_ticket_reason: "approval pending",
          last_ticket_updated_at: "2026-03-20T12:00:20Z",
          last_late_callback_status: null,
          last_late_callback_reason: null,
          last_late_callback_at: null,
          last_resume_delay_seconds: 30,
          last_resume_reason: "approval pending",
          last_resume_source: "waiting_resume_monitor",
          last_resume_backoff_attempt: 1
        },
        scheduled_resume_delay_seconds: 30,
        scheduled_resume_source: "waiting_resume_monitor",
        scheduled_waiting_status: "waiting_callback",
        scheduled_resume_scheduled_at: "2026-03-20T12:00:20Z",
        scheduled_resume_due_at: "2026-03-20T12:00:50Z",
        scheduled_resume_requeued_at: "2026-03-20T12:01:30Z",
        scheduled_resume_requeue_source: "scheduler_waiting_resume_monitor",
        artifact_refs: ["artifact://focus-1"],
        artifacts: [
          {
            id: "artifact-1",
            run_id: "run-1",
            node_run_id: "node-run-focus",
            artifact_kind: "tool_result",
            content_type: "application/json",
            summary: "审批上下文已序列化。",
            uri: "artifact://focus-1",
            metadata_payload: {},
            created_at: "2026-03-20T12:00:25Z"
          }
        ],
        tool_calls: [
          {
            id: "tool-call-1",
            run_id: "run-1",
            node_run_id: "node-run-focus",
            tool_id: "policy.check",
            tool_name: "Policy Check",
            phase: "execute",
            status: "completed",
            request_summary: "",
            latency_ms: 10,
            retry_count: 0,
            created_at: "2026-03-20T12:00:22Z",
            requested_execution_class: "sandbox",
            requested_execution_source: "runtime_policy",
            requested_execution_timeout_ms: 3000,
            effective_execution_class: "sandbox",
            response_summary: "审批上下文已核对。",
            response_content_type: "application/json",
            raw_ref: "artifact://tool-call-raw"
          }
        ]
      },
      execution_focus_explanation: {
        primary_signal: "当前 run 的 canonical focus 已切到审批阻塞节点。",
        follow_up: "优先回到 approval inbox 清理 blocker。"
      },
      execution_focus_skill_trace: {
        reference_count: 2,
        phase_counts: { main_plan: 2 },
        source_counts: { skill_binding: 1, retrieval_query_match: 1 },
        loads: [
          {
            phase: "main_plan",
            references: [
              {
                skill_id: "skill-review",
                reference_id: "ref-handoff",
                load_source: "skill_binding",
                retrieval_mcp_params: {}
              },
              {
                skill_id: "skill-review",
                reference_id: "ref-guardrail",
                load_source: "retrieval_query_match",
                retrieval_mcp_params: {}
              }
            ]
          }
        ]
      }
    });

    expect(model).not.toBeNull();
    expect(model?.nodeRunId).toBe("node-run-focus");
    expect(model?.reason).toBe("blocking_node_run");
    expect(model?.primarySignal).toBe("当前 run 的 canonical focus 已切到审批阻塞节点。");
    expect(model?.followUp).toBe("优先回到 approval inbox 清理 blocker。");
    expect(model?.waitingReason).toBe("waiting approval");
    expect(model?.artifactCount).toBe(1);
    expect(model?.artifactRefCount).toBe(1);
    expect(model?.toolCallCount).toBe(1);
    expect(model?.rawRefCount).toBe(1);
    expect(model?.skillReferenceCount).toBe(2);
    expect(model?.skillReferencePhaseCounts).toEqual({ main_plan: 2 });
    expect(model?.skillReferenceSourceCounts).toEqual({
      retrieval_query_match: 1,
      skill_binding: 1
    });
    expect(model?.hasCallbackSummary).toBe(true);
  });

  it("在缺少 canonical explanation 时回退到 execution focus presenter", () => {
    const model = buildRunDetailExecutionFocusViewModel({
      id: "run-2",
      workflow_id: "wf-tool",
      workflow_version: "v1",
      status: "failed",
      input_payload: {},
      output_payload: null,
      error_message: null,
      created_at: "2026-03-20T12:30:00Z",
      event_count: 1,
      event_type_counts: {},
      node_runs: [
        {
          id: "node-run-tool",
          node_id: "tool_node",
          node_name: "Sandbox Tool",
          node_type: "tool",
          status: "failed",
          input_payload: {},
          output_payload: null,
          started_at: "2026-03-20T12:30:10Z",
          finished_at: "2026-03-20T12:30:12Z"
        }
      ],
      events: [],
      execution_focus_reason: "blocked_execution",
      execution_focus_node: {
        node_run_id: "node-run-tool",
        node_id: "tool_node",
        node_name: "Sandbox Tool",
        node_type: "tool",
        status: "failed",
        execution_blocking_reason:
          "Tool 'native.search' requests execution class 'sandbox'. A compatible sandbox backend has already been selected (sandbox-default), but that backend does not advertise sandbox-backed tool execution support. Strong-isolation tool paths must fail closed until a backend with sandbox tool runner support is available.",
        artifact_refs: [],
        artifacts: [],
        tool_calls: []
      },
      execution_focus_explanation: null
    });

    expect(model?.primarySignal).toBe(
      "执行阻断：当前 tool 路径还不能真实兑现请求的强隔离 execution class。"
    );
    expect(model?.followUp).toBe(
      "下一步：先把 tool execution class 调回当前宿主执行支持范围，或后续补齐 sandbox tool runner；在此之前继续保持 fail-closed。"
    );
    expect(model?.hasCallbackSummary).toBe(false);
  });
});
