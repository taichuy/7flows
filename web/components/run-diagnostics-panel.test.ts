import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RunDiagnosticsPanel } from "@/components/run-diagnostics-panel";
import type { RunDetail } from "@/lib/get-run-detail";
import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";

const { traceFiltersSectionSpy } = vi.hoisted(() => ({
  traceFiltersSectionSpy: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/components/run-diagnostics-panel/overview-sections", () => ({
  RunDiagnosticsOverviewSections: () => createElement("div", { "data-testid": "overview-sections" })
}));

vi.mock("@/components/run-diagnostics-panel/trace-filters-section", () => ({
  RunDiagnosticsTraceFiltersSection: (props: Record<string, unknown>) => {
    traceFiltersSectionSpy(props);
    return createElement("div", { "data-testid": "trace-filters-section" });
  }
}));

vi.mock("@/components/run-diagnostics-execution-sections", () => ({
  RunDiagnosticsExecutionSections: () =>
    createElement("div", { "data-testid": "execution-sections" })
}));

vi.mock("@/components/run-diagnostics-panel/trace-results-section", () => ({
  RunDiagnosticsTraceResultsSection: () =>
    createElement("div", { "data-testid": "trace-results-section" })
}));

function buildRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_version: "3",
    status: "failed",
    input_payload: {},
    output_payload: null,
    created_at: "2026-03-21T00:00:00Z",
    started_at: "2026-03-21T00:00:05Z",
    finished_at: "2026-03-21T00:00:10Z",
    event_count: 4,
    event_type_counts: {
      run_started: 1,
      node_failed: 1
    },
    node_runs: [
      {
        id: "node-run-1",
        node_id: "node-1",
        node_name: "Node 1",
        node_type: "tool",
        status: "failed",
        input_payload: {},
        error_message: "tool failed"
      },
      {
        id: "node-run-2",
        node_id: "node-2",
        node_name: "Node 2",
        node_type: "llm",
        status: "succeeded",
        input_payload: {}
      }
    ],
    events: [],
    ...overrides
  };
}

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: false,
        backend_ids: [],
        supported_languages: [],
        supported_profiles: [],
        supported_dependency_modes: [],
        supports_tool_execution: false,
        supports_builtin_package_sets: false,
        supports_backend_extensions: false,
        supports_network_policy: false,
        supports_filesystem_policy: false,
        reason: "No sandbox backend is currently enabled."
      }
    ],
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

describe("RunDiagnosticsPanel", () => {
  it("通过 shared presenter 渲染 hero 与状态面板 copy", () => {
    const callbackWaitingAutomation = {
      status: "healthy",
      scheduler_required: true,
      detail: "callback waiting automation healthy",
      scheduler_health_status: "healthy",
      scheduler_health_detail: "scheduler loop is healthy",
      steps: []
    } satisfies CallbackWaitingAutomationCheck;
    const sandboxReadiness = buildSandboxReadiness();

    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsPanel, {
        run: buildRunDetail(),
        trace: null,
        traceError: null,
        traceQuery: {
          limit: 200,
          order: "asc"
        },
        executionView: null,
        evidenceView: null,
        callbackWaitingAutomation,
        sandboxReadiness
      })
    );

    expect(html).toContain("Run Diagnostics");
    expect(html).toContain("Run status");
    expect(html).toContain("创建时间");
    expect(html).toContain("执行耗时");
    expect(html).toContain("Node runs");
    expect(html).toContain("Events");
    expect(html).toContain("Errors");
    expect(html).toContain("回到 workflow 编辑器");
    expect(html).toContain('/workflows/workflow-1');
    expect(html).toContain('/runs');
    expect(html).toContain('/sensitive-access');
    expect(html).toContain("返回系统首页");
    expect(html).toContain('href="/"');
    expect(html).toContain("打开原始 events API");
    expect(traceFiltersSectionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackWaitingAutomation,
        runId: "run-1",
        sandboxReadiness
      })
    );
  });

  it("when the run still has catalog gaps, hero handoff deep-links back to filtered workflow editor", () => {
    const html = renderToStaticMarkup(
      createElement(RunDiagnosticsPanel, {
        run: buildRunDetail({
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        }),
        trace: null,
        traceError: null,
        traceQuery: {
          limit: 200,
          order: "asc"
        },
        executionView: null,
        evidenceView: null,
        callbackWaitingAutomation: {
          status: "healthy",
          scheduler_required: true,
          detail: "callback waiting automation healthy",
          scheduler_health_status: "healthy",
          scheduler_health_detail: "scheduler loop is healthy",
          steps: []
        },
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
  });
});
