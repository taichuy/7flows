import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RunDetailExecutionFocusCard } from "@/components/run-detail-execution-focus-card";
import type { RunDetail } from "@/lib/get-run-detail";

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
});
