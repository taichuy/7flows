import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RunSnapshot, RunSnapshotWithId } from "@/app/actions/run-snapshot";
import { WorkflowRunOverlayPanel } from "@/components/workflow-run-overlay-panel";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import { DEFAULT_RUN_TRACE_LIMIT } from "@/lib/get-run-trace";
import { buildRunDetailHrefFromWorkspaceStarterViewState } from "@/lib/workspace-starter-governance-query";

const { exportActionSpy } = vi.hoisted(() => ({
  exportActionSpy: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-trace-export-actions", () => ({
  RunTraceExportActions: (props: Record<string, unknown>) => {
    exportActionSpy(props);
    return createElement("div", { "data-testid": "run-trace-export-actions" });
  }
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

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "configured",
    scheduler_required: true,
    detail: "callback automation degraded",
    scheduler_health_status: "unhealthy",
    scheduler_health_detail: "scheduler is currently backlogged.",
    affected_run_count: 2,
    affected_workflow_count: 1,
    primary_blocker_kind: "scheduler_unhealthy",
    recommended_action: {
      kind: "callback_waiting",
      entry_key: "runLibrary",
      href: "/runs?status=waiting",
      label: "Open run library"
    },
    steps: []
  };
}

function buildRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
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
    events: [],
    ...overrides
  };
}

function buildRunSnapshotModel(snapshot: RunSnapshot): RunSnapshotWithId {
  return {
    runId: "run-1",
    snapshot,
    callbackTickets: [],
    sensitiveAccessEntries: []
  };
}

function buildRunSnapshot(): RunSnapshotWithId {
  return buildRunSnapshotModel({
    status: "failed",
    workflowId: "workflow-1",
    currentNodeId: "tool_wait",
    waitingReason: null,
    executionFocusReason: "blocked_execution",
    executionFocusNodeId: "tool_wait",
    executionFocusNodeRunId: "node-run-1",
    executionFocusNodeName: "Tool Wait",
    executionFocusNodeType: "tool",
    executionFocusExplanation: {
      primary_signal: "当前节点因强隔离 backend 不可用而阻断。",
      follow_up: "先恢复兼容 backend，再重新调度该节点。"
    },
    callbackWaitingExplanation: null,
    callbackWaitingLifecycle: null,
    executionFocusArtifactCount: 0,
    executionFocusArtifactRefCount: 0,
    executionFocusToolCallCount: 1,
    executionFocusRawRefCount: 0,
    executionFocusArtifactRefs: [],
    executionFocusArtifacts: [],
    executionFocusToolCalls: [
      {
        id: "tool-call-1",
        tool_id: "tool-a",
        tool_name: "Tool A",
        phase: "execute",
        status: "blocked",
        requested_execution_class: "sandbox",
        requested_execution_source: "runtime_policy",
        effective_execution_class: "inline",
        execution_executor_ref: "tool:compat-adapter:dify-default",
        execution_sandbox_backend_id: "sandbox-stale",
        execution_sandbox_runner_kind: "container",
        execution_blocking_reason: "No compatible sandbox backend is available.",
        execution_fallback_reason: null,
        response_summary: null,
        response_content_type: null,
        raw_ref: null
      }
    ],
    executionFocusSkillTrace: null
  });
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
        runSnapshot: buildRunSnapshot(),
        trace: null,
        traceError: null,
        selectedNodeId: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
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
    expect(exportActionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        runId: "run-1",
        requesterId: "workflow-run-overlay-export",
        formats: ["json"],
        sandboxReadiness: buildSandboxReadiness(),
        query: {
          limit: DEFAULT_RUN_TRACE_LIMIT,
          order: "asc"
        }
      })
    );
    const props = exportActionSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(props).not.toHaveProperty("blockedSummary");
  });

  it("preserves callback inbox context when overlay hydration carries callback tickets", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowRunOverlayPanel, {
        runs: [
          {
            id: "run-1",
            workflow_id: "workflow-1",
            workflow_version: "v1",
            status: "waiting",
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
        runSnapshot: {
          runId: "run-1",
          snapshot: {
            status: "waiting",
            workflowId: "workflow-1",
            currentNodeId: "approval_gate",
            waitingReason: "waiting callback",
            executionFocusReason: "waiting_callback",
            executionFocusNodeId: "approval_gate",
            executionFocusNodeRunId: "node-run-1",
            executionFocusNodeName: "Approval Gate",
            executionFocusNodeType: "tool",
            callbackWaitingExplanation: {
              primary_signal: "当前 callback waiting 仍需要 operator 回到 inbox。",
              follow_up: "先打开 inbox slice，确认 callback ticket 处理进度。"
            },
            callbackWaitingLifecycle: null,
            scheduledResumeDelaySeconds: 45,
            scheduledResumeScheduledAt: "2026-03-20T10:00:00Z",
            scheduledResumeDueAt: "2026-03-20T10:00:45Z",
            executionFocusArtifactCount: 0,
            executionFocusArtifactRefCount: 0,
            executionFocusToolCallCount: 0,
            executionFocusRawRefCount: 0,
            executionFocusArtifactRefs: [],
            executionFocusArtifacts: [],
            executionFocusToolCalls: [],
            executionFocusSkillTrace: null
          },
          callbackTickets: [
            {
              ticket: "callback-ticket-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              status: "pending",
              waiting_status: "waiting",
              tool_call_index: 0,
              created_at: "2026-03-20T10:00:00Z"
            }
          ],
          sensitiveAccessEntries: []
        },
        trace: null,
        traceError: null,
        selectedNodeId: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        isLoading: false,
        isRefreshingRuns: false,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("/sensitive-access?run_id=run-1&amp;node_run_id=node-run-1");
    expect(html).toContain("scheduler is currently backlogged.");
  });

  it("surfaces workflow catalog-gap handoff for the selected run", () => {
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
            last_event_at: null,
            tool_governance: {
              referenced_tool_ids: ["native.catalog-gap"],
              missing_tool_ids: ["native.catalog-gap"],
              governed_tool_count: 0,
              strong_isolation_tool_count: 0
            }
          }
        ],
        selectedRunId: "run-1",
        run: buildRunDetail({
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        }),
        runSnapshot: buildRunSnapshot(),
        trace: null,
        traceError: null,
        selectedNodeId: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        isLoading: false,
        isRefreshingRuns: false,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "当前这条 run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续对照当前 node timeline 与 trace。"
    );
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
  });

  it("keeps workspace starter scope on run diagnostics drilldown", () => {
    const workspaceStarterGovernanceQueryScope = {
      activeTrack: "应用新建编排" as const,
      sourceGovernanceKind: "missing_source" as const,
      needsFollowUp: true,
      searchQuery: "starter",
      selectedTemplateId: "starter-1"
    };
    const scopedRunHref = buildRunDetailHrefFromWorkspaceStarterViewState(
      "run-1",
      workspaceStarterGovernanceQueryScope
    );
    const escapedScopedRunHref = scopedRunHref.replaceAll("&", "&amp;");
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
        runSnapshot: buildRunSnapshot(),
        trace: null,
        traceError: null,
        selectedNodeId: null,
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
        workspaceStarterGovernanceQueryScope,
        isLoading: false,
        isRefreshingRuns: false,
        onSelectRunId: () => undefined,
        onRefreshRuns: () => undefined
      })
    );

    expect(html).toContain(`href=\"${escapedScopedRunHref}\"`);
    expect(html).not.toContain('href="/runs/run-1"');
    expect(html).toContain("查看 run 诊断面板");
  });
});
