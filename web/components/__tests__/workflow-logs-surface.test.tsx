import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  WorkflowLogsSurface,
  type WorkflowLogsSurfaceRunItem,
} from "@/components/workflow-logs-surface";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck,
} from "@/lib/get-system-overview";
import type { PublishedEndpointInvocationListResponse } from "@/lib/get-workflow-publish";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children),
}));

vi.mock("@/components/run-diagnostics-execution-sections", () => ({
  RunDiagnosticsExecutionSections: ({ workflowId }: { workflowId?: string | null }) =>
    createElement(
      "div",
      {
        "data-component": "run-diagnostics-execution-sections",
        "data-workflow-id": workflowId ?? "none",
      },
      workflowId ?? "none"
    ),
}));

vi.mock("@/components/workflow-publish-invocation-entry-card", () => ({
  WorkflowPublishInvocationEntryCard: ({
    item,
    detailHref,
    detailActive,
  }: {
    item: { id: string };
    detailHref: string;
    detailActive: boolean;
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-publish-invocation-entry-card",
        "data-invocation-id": item.id,
        "data-detail-href": detailHref,
        "data-detail-active": detailActive ? "true" : "false",
      },
      item.id
    ),
}));

vi.mock("@/components/workflow-publish-invocation-detail-panel", () => ({
  WorkflowPublishInvocationDetailPanel: ({
    detail,
  }: {
    detail: { invocation: { id: string } };
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-publish-invocation-detail-panel",
        "data-invocation-id": detail.invocation.id,
      },
      detail.invocation.id
    ),
}));

function buildCallbackWaitingAutomation(): CallbackWaitingAutomationCheck {
  return {
    status: "healthy",
    scheduler_required: true,
    detail: "callback waiting automation ready",
    scheduler_health_status: "healthy",
    scheduler_health_detail: "scheduler ready",
    steps: [],
  };
}

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
        supports_filesystem_policy: false,
        reason: null,
      },
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["builtin"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: false,
    supports_network_policy: true,
    supports_filesystem_policy: false,
  };
}

function buildRunSummary(): WorkflowLogsSurfaceRunItem {
  return {
    id: "run-1",
    workflowVersion: "v1",
    status: "failed",
    createdAt: "2026-04-01T09:00:00Z",
    lastEventAt: "2026-04-01T09:01:00Z",
    nodeRunCount: 3,
    eventCount: 7,
    errorMessage: "sandbox backend offline",
    logsHref: "/workflows/workflow-1/logs?run=run-1",
    detailHref: "/runs/run-1",
  };
}

function buildInvocationAudit(): PublishedEndpointInvocationListResponse {
  return {
    filters: {},
    summary: {
      total_count: 1,
      succeeded_count: 0,
      failed_count: 1,
      rejected_count: 0,
      cache_hit_count: 0,
      cache_miss_count: 1,
      cache_bypass_count: 0,
      pending_approval_count: 0,
      pending_notification_count: 0,
      last_invoked_at: "2026-04-01T09:05:00Z",
      last_status: "failed",
      last_cache_status: "miss",
      last_run_id: "run-1",
      last_run_status: "failed",
      last_reason_code: "runtime_failed",
      primary_sensitive_resource: null,
    },
    facets: {
      status_counts: [],
      request_source_counts: [],
      request_surface_counts: [],
      cache_status_counts: [],
      run_status_counts: [],
      reason_counts: [],
      api_key_usage: [],
      recent_failure_reasons: [],
      timeline_granularity: "hour",
      timeline: [],
    },
    items: [
      {
        id: "invocation-1",
        workflow_id: "workflow-1",
        binding_id: "binding-1",
        endpoint_id: "endpoint-1",
        endpoint_alias: "binding-1.alias",
        route_path: "/published/binding-1",
        protocol: "native",
        auth_mode: "api_key",
        request_source: "workflow",
        request_surface: "openai.responses",
        status: "failed",
        cache_status: "miss",
        run_id: "run-1",
        run_status: "failed",
        run_current_node_id: "node-1",
        run_waiting_reason: null,
        run_waiting_lifecycle: null,
        run_snapshot: null,
        run_follow_up: null,
        execution_focus_explanation: null,
        callback_waiting_explanation: null,
        reason_code: "runtime_failed",
        error_message: "tool failed",
        request_preview: null,
        response_preview: null,
        duration_ms: 1200,
        created_at: "2026-04-01T09:05:00Z",
        finished_at: "2026-04-01T09:05:01Z",
      },
    ],
  } as unknown as PublishedEndpointInvocationListResponse;
}

describe("WorkflowLogsSurface", () => {
  it("renders a shared empty state when invocation and run facts are both missing", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowLogsSurface, {
        workflowId: "workflow-1",
        recentRuns: [],
        selectionSource: "latest",
        activeRunSummary: null,
        activeRunDetail: null,
        executionView: null,
        evidenceView: null,
        publishHref: "/workflows/workflow-1/publish",
        runLibraryHref: "/runs",
        workflowEditorHref: "/workflows/workflow-1/editor",
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
      })
    );

    expect(html).toContain('data-component="workflow-logs-empty-state"');
    expect(html).toContain('data-surface="logs"');
    expect(html).toContain("Invocation and run facts");
    expect(html).toContain("日志与标注");
  });

  it("renders the shared utility frame for run fallback mode", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowLogsSurface, {
        workflowId: "workflow-1",
        recentRuns: [buildRunSummary()],
        selectionSource: "latest",
        selectionNotice: "当前没有 invocation facts，已回退到 recent runs。",
        activeRunSummary: buildRunSummary(),
        activeRunDetail: null,
        executionView: null,
        evidenceView: null,
        publishHref: "/workflows/workflow-1/publish",
        runLibraryHref: "/runs",
        workflowEditorHref: "/workflows/workflow-1/editor",
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
      })
    );

    expect(html).toContain('data-component="workflow-studio-utility-frame"');
    expect(html).toContain('data-surface="logs"');
    expect(html).toContain('data-component="workflow-logs-run-fallback"');
    expect(html).toContain("run fallback");
    expect(html).toContain("run run-1");
  });

  it("renders invocation-first diagnostics inside the shared utility frame", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowLogsSurface, {
        workflowId: "workflow-1",
        activeBinding: {
          id: "binding-1",
          endpointAlias: "binding-1.alias",
          routePath: "/published/binding-1",
          protocol: "native",
          authMode: "api_key",
          workflowVersion: "v1",
        },
        invocationAudit: buildInvocationAudit(),
        buildInvocationHref: (invocationId: string) =>
          `/workflows/workflow-1/logs?publish_binding=binding-1&publish_invocation=${invocationId}`,
        clearInvocationHref: "/workflows/workflow-1/logs?publish_binding=binding-1",
        recentRuns: [buildRunSummary()],
        selectionSource: "latest",
        selectionNotice: "当前 selection 已对齐最新 invocation。",
        activeRunSummary: buildRunSummary(),
        activeRunDetail: null,
        executionView: null,
        evidenceView: null,
        publishHref: "/workflows/workflow-1/publish",
        runLibraryHref: "/runs",
        workflowEditorHref: "/workflows/workflow-1/editor",
        callbackWaitingAutomation: buildCallbackWaitingAutomation(),
        sandboxReadiness: buildSandboxReadiness(),
      })
    );

    expect(html).toContain('data-component="workflow-studio-utility-frame"');
    expect(html).toContain('data-surface="logs"');
    expect(html).toContain('data-component="workflow-logs-invocation-list"');
    expect(html).toContain('data-component="workflow-logs-invocation-detail"');
    expect(html).toContain('data-component="workflow-publish-invocation-entry-card"');
    expect(html).toContain("Binding");
    expect(html).toContain("当前 selection 已对齐最新 invocation。");
  });
});
