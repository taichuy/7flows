import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowRunOverlayPanel } from "@/components/workflow-run-overlay-panel";
import type { RunDetail } from "@/lib/get-run-detail";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-trace-export-actions", () => ({
  RunTraceExportActions: () => createElement("div", { "data-testid": "run-trace-export-actions" })
}));

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 1,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: true,
        reason: null
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["builtin"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: false,
    supports_network_policy: true,
    supports_filesystem_policy: true
  };
}

function buildRunDetail(): RunDetail {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_version: "v1",
    compiled_blueprint_id: null,
    status: "failed",
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
    execution_focus_reason: "blocked_execution",
    execution_focus_node: {
      node_run_id: "node-run-1",
      node_id: "tool_wait",
      node_name: "Tool Wait",
      node_type: "tool",
      status: "blocked",
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
      effective_execution_class: "inline",
      execution_executor_ref: "tool:compat-adapter:dify-default",
      execution_sandbox_backend_id: "sandbox-stale",
      execution_sandbox_backend_executor_ref: null,
      execution_sandbox_runner_kind: "container",
      execution_blocking_reason: "No compatible sandbox backend is available.",
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
      tool_calls: []
    },
    execution_focus_explanation: {
      primary_signal: "当前节点因强隔离 backend 不可用而阻断。",
      follow_up: "先恢复兼容 backend，再重新调度该节点。"
    },
    execution_focus_skill_trace: null,
    node_runs: [
      {
        id: "node-run-1",
        node_id: "tool_wait",
        node_name: "Tool Wait",
        node_type: "tool",
        status: "blocked",
        phase: "execute",
        retry_count: 0,
        input_payload: {},
        checkpoint_payload: {},
        working_context: {},
        evidence_context: null,
        artifact_refs: [],
        output_payload: null,
        error_message: "sandbox blocked",
        waiting_reason: null,
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

describe("WorkflowRunOverlayPanel", () => {
  it("surfaces live sandbox readiness alongside overlay execution focus", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowRunOverlayPanel, {
        runs: [
          {
            id: "run-1",
            workflow_id: "workflow-1",
            workflow_version: "v1",
            status: "failed",
            started_at: "2026-03-20T10:00:00Z",
            finished_at: null,
            created_at: "2026-03-20T10:00:00Z",
            node_run_count: 1,
            event_count: 0,
            last_event_at: null
          }
        ],
        selectedRunId: "run-1",
        run: buildRunDetail(),
        trace: null,
        traceError: null,
        selectedNodeId: null,
        sandboxReadiness: buildSandboxReadiness(),
        isLoading: false,
        isRefreshingRuns: false,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("Execution focus");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("open run");
    expect(html).toContain("当前 live sandbox readiness 显示 sandbox 已 ready。");
    expect(html).toContain("历史 run 记录的 backend 是 sandbox-stale");
  });
});
